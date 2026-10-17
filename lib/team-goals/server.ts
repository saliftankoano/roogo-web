// Server side of "Nos objectifs": loads the goals, computes every number
// from its own records (or from a dated reading with its proof), shapes the
// evidence for the drawer, and does the writes. Every read and write uses
// the service role; who may change what is checked here with the helpers of
// lib/team-goals/core.ts, never trusted from the client.
//
// Privacy: the users metric hands out counts per week only, never a name,
// an email or a phone number.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { propertyLabel } from "@/lib/team-tasks/sources";
import type { Person } from "@/lib/team-tasks/core";
import type { ServiceResult, Viewer } from "@/lib/team-tasks/server";
import {
  CATALOG_ORDER,
  METRICS,
  activeContracts,
  canEnterReading,
  canManageGoals,
  canTickLever,
  countsAsUser,
  dayKeyOf,
  dayLabel,
  fcfa,
  formatCount,
  goalProgress,
  goalWindow,
  isManualMetric,
  leverDoneThisWeek,
  listedInWindow,
  pastMonthWindows,
  periodChoices,
  readingAt,
  readingPace,
  recentPerDay,
  salesInWindow,
  shareTotals,
  shortDayLabel,
  teamWeek,
  unitWord,
  weeklyCounts,
  type GoalDates,
  type GoalIcon,
  type GoalMetric,
  type GoalPeriod,
  type GoalStatus,
  type GoalWindow,
  type LeverInput,
  type NewGoalInput,
  type PeriodTab,
  type ReadingInput,
  type StatusTone,
} from "./core";

const PROOF_BUCKET = "team-goal-proofs";
const PROOF_TTL_SECONDS = 3600;
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /does not exist|Could not find the table/i.test(error.message ?? "");
}

function writeError(error: { code?: string; message?: string }, context: string) {
  if (isMissingTable(error)) return fail(503, "Les objectifs ne sont pas encore installés (migration 091 à lancer).");
  if (error.code === "23505") return fail(409, "C’est déjà enregistré.");
  if (error.code === "23503") return fail(400, "L’élément choisi n’existe plus.");
  console.error(`[team-goals] ${context} failed`, { code: error.code, message: error.message });
  return fail(500, "L’enregistrement a échoué. Réessayez.");
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type GoalRow = {
  id: string;
  title: string;
  metric: GoalMetric;
  target: number;
  period: GoalPeriod;
  start_date: string;
  end_date: string | null;
  sort_order: number;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
};

export type LeverRow = {
  id: string;
  goal_id: string;
  owner_id: string;
  title: string;
  rhythm: string | null;
  weekly_target: number;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
};

export type ReadingRow = {
  id: string;
  metric: string;
  value: number;
  measured_on: string;
  entered_by: string | null;
  proof_path: string | null;
  note: string | null;
  created_at: string;
};

type PropertyBits = {
  id: string;
  reference: string | null;
  property_type: string | null;
  quartier: string | null;
  city: string | null;
  listing_type?: string | null;
  price?: number | null;
  status?: string | null;
  is_test?: boolean | null;
  published_at?: string | null;
  created_at?: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function placeLabel(p: PropertyBits | null) {
  return propertyLabel(p ? { ...p, reference: null } : null);
}

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export type EvidenceRow = {
  key: string;
  tag: string;
  /** dark for a property reference, light otherwise. */
  tagTone: "dark" | "light";
  title: string;
  sub: string;
  href: string | null;
  link: string | null;
  /** Signed link to the screenshot of a reading. */
  proofUrl: string | null;
  /** For a confirmed sale: its id (the founder can remove it). */
  saleId?: string;
  muted?: boolean;
};

export type HistoryRow = { key: string; label: string; value: string; reached: boolean };

export type LeverView = {
  id: string;
  goalId: string;
  goalTitle: string;
  ownerId: string;
  ownerName: string;
  ownerInitials: string;
  title: string;
  rhythm: string | null;
  weeklyTarget: number;
  done: number;
  mine: boolean;
  canTick: boolean;
};

export type GoalView = {
  id: string;
  title: string;
  metric: GoalMetric;
  icon: GoalIcon;
  family: string;
  target: number;
  targetLabel: string;
  current: number | null;
  currentLabel: string;
  period: GoalPeriod;
  periodLabel: string;
  tab: PeriodTab;
  countdown: string;
  endPhrase: string;
  ended: boolean;
  status: GoalStatus;
  statusLabel: string;
  tone: StatusTone;
  pct: number;
  remainingLabel: string;
  need: string;
  /** One or two sentences under the card on the goals page. */
  paceText: string;
  source: string;
  measure: string;
  listTitle: string;
  evidence: EvidenceRow[];
  history: HistoryRow[];
  manual: boolean;
  /** For the sold metric (founder): the properties for sale, to confirm one. */
  forSale: { id: string; label: string }[];
  levers: LeverView[];
};

export type GoalsPayload = {
  ready: boolean;
  todayKey: string;
  viewerId: string;
  canManage: boolean;
  canEnterReading: boolean;
  goals: GoalView[];
  mine: LeverView[];
  mineTotals: { done: number; target: number };
  people: { id: string; firstName: string; initials: string; levelLabel: string }[];
  tally: { personId: string; name: string; initials: string; done: number; target: number }[];
  catalog: { metric: GoalMetric; pick: string; icon: GoalIcon }[];
  periodChoices: { period: GoalPeriod; label: string; sub: string }[];
  /** metric|period pairs already used by an active goal of the current window. */
  used: string[];
  failedMetrics: GoalMetric[];
};

type MetricResult = {
  current: number | null;
  actualPerDay: number | null;
  paceText: string;
  listTitle: string;
  evidence: EvidenceRow[];
  history: HistoryRow[];
  forSale: { id: string; label: string }[];
};

type Ctx = {
  todayKey: string;
  people: Person[];
  /** Earliest window start among the goals that use a metric (for listings history). */
  since: Partial<Record<GoalMetric, string>>;
};

// One load per metric per request, shared by every goal on that metric.
type Loaded = {
  users?: { createdAts: string[] };
  readings?: Map<string, ReadingRow[]>;
  proofUrls?: Map<string, string>;
  contracts?: { rows: { property_id: string; start_date: string | null; monthly_rent: number | null; property: PropertyBits | null }[] };
  sales?: { rows: { id: string; property_id: string; signed_on: string; confirmed_by: string | null; property: PropertyBits | null }[]; forSale: PropertyBits[] };
  listings?: PropertyBits[];
};

async function loadUsers(): Promise<{ createdAts: string[] }> {
  const createdAts: string[] = [];
  const page = 1000;
  for (let from = 0; from < 50000; from += page) {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("user_type, email, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      if (countsAsUser(row as { user_type: string | null; email: string | null })) createdAts.push(row.created_at as string);
    }
    if (!data || data.length < page) break;
  }
  return { createdAts };
}

async function loadReadings(metrics: string[]): Promise<{ readings: Map<string, ReadingRow[]>; proofUrls: Map<string, string> }> {
  const { data, error } = await supabaseAdmin
    .from("team_goal_readings")
    .select("id, metric, value, measured_on, entered_by, proof_path, note, created_at")
    .in("metric", metrics)
    .order("measured_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const readings = new Map<string, ReadingRow[]>();
  for (const row of (data ?? []) as ReadingRow[]) {
    if (!readings.has(row.metric)) readings.set(row.metric, []);
    readings.get(row.metric)!.push(row);
  }
  const paths = [...new Set((data ?? []).map((r) => r.proof_path as string | null).filter((p): p is string => !!p))].slice(0, 60);
  const proofUrls = new Map<string, string>();
  if (paths.length) {
    const signed = await supabaseAdmin.storage.from(PROOF_BUCKET).createSignedUrls(paths, PROOF_TTL_SECONDS);
    if (signed.error) console.error("[team-goals] proof links failed", { message: signed.error.message });
    for (const entry of signed.data ?? []) {
      if (entry.path && entry.signedUrl) proofUrls.set(entry.path, entry.signedUrl);
    }
  }
  return { readings, proofUrls };
}

async function loadContracts() {
  const { data, error } = await supabaseAdmin
    .from("rental_agreements")
    .select("status, property_id, start_date, monthly_rent, property:property_id ( id, reference, property_type, quartier, city, is_test )")
    .eq("status", "active")
    .limit(500);
  if (error) throw error;
  const rows = activeContracts(
    (data ?? []).map((row) => ({
      status: row.status as string | null,
      property_id: row.property_id as string | null,
      start_date: row.start_date as string | null,
      monthly_rent: row.monthly_rent as number | null,
      property: one(row.property as PropertyBits | PropertyBits[] | null),
    })),
  ) as { property_id: string; start_date: string | null; monthly_rent: number | null; property: PropertyBits | null }[];
  return { rows };
}

async function loadSales() {
  const [sales, forSale] = await Promise.all([
    supabaseAdmin
      .from("team_goal_sales")
      .select("id, property_id, signed_on, confirmed_by, property:property_id ( id, reference, property_type, quartier, city, price, is_test )")
      .order("signed_on", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("properties")
      .select("id, reference, property_type, quartier, city, price, listing_type, status, is_test")
      .eq("listing_type", "vendre")
      .eq("status", "en_ligne")
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  // Before migration 091 the sales table is missing: no confirmed sale yet, the list for sale still shows.
  if (sales.error && !isMissingTable(sales.error)) throw sales.error;
  if (forSale.error) throw forSale.error;
  const soldIds = new Set((sales.data ?? []).map((row) => row.property_id as string));
  return {
    rows: (sales.data ?? []).map((row) => ({
      id: row.id as string,
      property_id: row.property_id as string,
      signed_on: row.signed_on as string,
      confirmed_by: row.confirmed_by as string | null,
      property: one(row.property as PropertyBits | PropertyBits[] | null),
    })),
    forSale: ((forSale.data ?? []) as PropertyBits[]).filter((p) => !soldIds.has(p.id)),
  };
}

async function loadListings(sinceKey: string) {
  const since = `${sinceKey}T00:00:00.000Z`;
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, reference, property_type, quartier, city, status, is_test, published_at, created_at, listing_type")
    .or(`published_at.gte.${since},created_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as PropertyBits[];
}

function nameOf(people: Person[], id: string | null) {
  if (!id) return null;
  return people.find((p) => p.id === id)?.firstName ?? null;
}

function propertyRow(p: PropertyBits | null, sub: string, key: string, extra: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    key,
    tag: p?.reference ?? "Bien",
    tagTone: "dark",
    title: placeLabel(p),
    sub,
    href: p?.id ? `/admin/annonces/${p.id}` : null,
    link: p?.id ? "Ouvrir le bien" : null,
    proofUrl: null,
    ...extra,
  };
}

function metricFor(goal: GoalRow, window: GoalWindow, ctx: Ctx, loaded: Loaded): MetricResult {
  const today = ctx.todayKey;
  const at = window.ended ? window.endKey : today;
  const empty: MetricResult = { current: null, actualPerDay: null, paceText: "", listTitle: "", evidence: [], history: [], forSale: [] };
  const months = pastMonthWindows(goal, today);
  const target = goal.target;
  const reachedLabel = (n: number | null) => (n == null ? "?" : formatCount(n));

  switch (goal.metric) {
    case "users": {
      const times = loaded.users?.createdAts ?? [];
      const current = times.filter((iso) => dayKeyOf(new Date(iso)) <= at).length;
      const weeks = weeklyCounts(times, today, 8);
      const word = (n: number) => `${formatCount(n)} ${n > 1 ? "nouveaux comptes" : "nouveau compte"}`;
      return {
        ...empty,
        current,
        actualPerDay: recentPerDay(times, today, 28),
        paceText: `${weeks[0].count} cette semaine, ${weeks[1].count} la semaine du ${dayLabel(weeks[1].startKey, today)}.`,
        listTitle: "Nouveaux comptes par semaine",
        evidence: weeks.map((w) => ({
          key: w.startKey, tag: w.label, tagTone: "light", title: word(w.count), sub: w.sub, href: null, link: null, proofUrl: null,
        })),
        history: months.map((m) => {
          const n = times.filter((iso) => dayKeyOf(new Date(iso)) <= m.endKey).length;
          return { key: m.startKey, label: m.label, value: reachedLabel(n), reached: n >= target };
        }),
      };
    }
    case "tiktok_followers":
    case "facebook_followers":
    case "instagram_followers": {
      const readings = loaded.readings?.get(goal.metric) ?? [];
      const last = readingAt(readings, at);
      const pace = readingPace(readings, today);
      return {
        ...empty,
        current: last?.value ?? null,
        actualPerDay: pace,
        paceText: last
          ? `Dernier relevé le ${dayLabel(last.measured_on, today)}.${pace == null ? " Le rythme réel s’affiche dès qu’une deuxième saisie a au moins 7 jours d’écart." : ""}`
          : "Aucun relevé pour l’instant. Le premier chiffre s’affiche dès la première saisie.",
        listTitle: readings.length ? "Relevés" : "Aucun relevé",
        evidence: readings.slice(0, 20).map((r) => ({
          key: r.id,
          tag: shortDayLabel(r.measured_on),
          tagTone: "light",
          title: `${formatCount(r.value)} ${r.value > 1 ? "abonnés" : "abonné"}`,
          sub: [nameOf(ctx.people, r.entered_by) ? `Saisi par ${nameOf(ctx.people, r.entered_by)}` : "Saisi à la main", r.note].filter(Boolean).join(" · "),
          href: null,
          link: r.proof_path && loaded.proofUrls?.get(r.proof_path) ? "Voir la capture" : null,
          proofUrl: r.proof_path ? (loaded.proofUrls?.get(r.proof_path) ?? null) : null,
        })),
        history: months.map((m) => {
          const v = readingAt(readings, m.endKey)?.value ?? null;
          return { key: m.startKey, label: m.label, value: reachedLabel(v), reached: v != null && v >= target };
        }),
      };
    }
    case "properties_under_contract": {
      const rows = loaded.contracts?.rows ?? [];
      const started = rows.filter((r) => r.start_date && r.start_date <= at);
      const recent = rows.filter((r) => r.start_date && r.start_date > dayKeyOf(new Date(Date.parse(`${today}T00:00:00Z`) - 89 * 86400000)) && r.start_date <= today);
      return {
        ...empty,
        current: started.length,
        actualPerDay: recent.length / 90,
        paceText: started.length
          ? `Contrats actifs : ${started.map((r) => `${r.property?.reference ?? "bien"} (${placeLabel(r.property)})`).join(", ")}.`
          : "Aucun contrat actif pour l’instant.",
        listTitle: started.length ? "Contrats actifs" : "Aucun contrat actif",
        evidence: started.map((r) =>
          propertyRow(
            r.property,
            [fcfa(r.monthly_rent, true), r.start_date ? `contrat depuis le ${dayLabel(r.start_date, today)}` : null].filter(Boolean).join(" · "),
            r.property_id,
          ),
        ),
        history: months.map((m) => {
          const n = rows.filter((r) => r.start_date && r.start_date <= m.endKey).length;
          return { key: m.startKey, label: m.label, value: reachedLabel(n), reached: n >= target };
        }),
      };
    }
    case "properties_sold": {
      const sales = loaded.sales?.rows ?? [];
      const forSale = loaded.sales?.forSale ?? [];
      const counted = salesInWindow(sales, window);
      const shown = forSale.slice(0, 12);
      const evidence: EvidenceRow[] = [
        ...counted.map((s) =>
          propertyRow(
            s.property,
            [`Signé le ${dayLabel(s.signed_on, today)}`, nameOf(ctx.people, s.confirmed_by) ? `confirmé par ${nameOf(ctx.people, s.confirmed_by)}` : null].filter(Boolean).join(" · "),
            `sale:${s.id}`,
            { saleId: s.id },
          ),
        ),
        ...shown.map((p) => propertyRow(p, [fcfa(p.price), "en vente"].filter(Boolean).join(" · "), `for-sale:${p.id}`, { muted: true })),
      ];
      if (forSale.length > shown.length) {
        evidence.push({
          key: "for-sale:more", tag: `+ ${forSale.length - shown.length}`, tagTone: "light", title: "Autres biens en vente",
          sub: "Terrains, villas, maisons et appartements", href: "/admin/annonces", link: "Tout voir", proofUrl: null,
        });
      }
      const n = counted.length;
      return {
        ...empty,
        current: n,
        paceText: n ? `${n} ${n > 1 ? "ventes confirmées" : "vente confirmée"} sur la période.` : "Aucune vente confirmée pour l’instant.",
        listTitle: `${forSale.length} ${forSale.length > 1 ? "biens en vente" : "bien en vente"}, ${n ? `${n} ${n > 1 ? "signés" : "signé"}` : "aucun signé"}`,
        evidence,
        history: months.map((m) => {
          const v = salesInWindow(sales, m).length;
          return { key: m.startKey, label: m.label, value: reachedLabel(v), reached: v >= target };
        }),
        forSale: forSale.map((p) => ({ id: p.id, label: propertyLabel(p) })),
      };
    }
    case "properties_listed_in_period": {
      const rows = (loaded.listings ?? []).map((p) => ({ ...p, status: p.status ?? null, is_test: p.is_test ?? null, published_at: p.published_at ?? null, created_at: p.created_at ?? null }));
      const { counted, pending } = listedInWindow(rows, window);
      return {
        ...empty,
        current: counted.length,
        paceText: `${counted.length} ${counted.length > 1 ? "mis en ligne" : "mis en ligne"}${pending.length ? `, ${pending.length} en attente de validation` : ""}.`,
        listTitle: `En ligne ${goal.period === "year" ? `en ${window.startKey.slice(0, 4)}` : `du ${dayLabel(window.startKey, today)} au ${dayLabel(window.endKey, today)}`}`,
        evidence: [
          ...counted.slice(0, 40).map((p) => propertyRow(p, `En ligne le ${dayLabel(dayKeyOf(new Date(p.published_at!)), today)}`, p.id)),
          ...pending.slice(0, 20).map((p) => propertyRow(p, "En attente de validation, pas encore compté", `pending:${p.id}`, { muted: true })),
        ],
        history: months.map((m) => {
          const v = listedInWindow(rows, m).counted.length;
          return { key: m.startKey, label: m.label, value: reachedLabel(v), reached: v >= target };
        }),
      };
    }
    default:
      return empty;
  }
}

async function loadMetrics(goals: GoalRow[], ctx: Ctx, readings?: ReadingRow[]): Promise<{ loaded: Loaded; failed: GoalMetric[] }> {
  const metrics = new Set(goals.map((g) => g.metric));
  const loaded: Loaded = {};
  const failed: GoalMetric[] = [];
  const jobs: Promise<void>[] = [];
  const guard = (names: GoalMetric[], job: () => Promise<void>) =>
    jobs.push(
      job().catch((error) => {
        failed.push(...names);
        console.error("[team-goals] metric load failed", { metrics: names, code: error?.code, message: error?.message });
      }),
    );
  if (metrics.has("users")) guard(["users"], async () => { loaded.users = await loadUsers(); });
  const manual = [...metrics].filter(isManualMetric);
  if (manual.length && readings) {
    loaded.readings = new Map(manual.map((m) => [m, readings.filter((r) => r.metric === m)]));
    loaded.proofUrls = new Map();
  } else if (manual.length) {
    guard(manual, async () => {
      const r = await loadReadings(manual);
      loaded.readings = r.readings;
      loaded.proofUrls = r.proofUrls;
    });
  }
  if (metrics.has("properties_under_contract")) guard(["properties_under_contract"], async () => { loaded.contracts = await loadContracts(); });
  if (metrics.has("properties_sold")) guard(["properties_sold"], async () => { loaded.sales = await loadSales(); });
  if (metrics.has("properties_listed_in_period")) {
    guard(["properties_listed_in_period"], async () => {
      loaded.listings = await loadListings(ctx.since.properties_listed_in_period ?? ctx.todayKey);
    });
  }
  await Promise.all(jobs);
  return { loaded, failed };
}

function emptyPayload(viewer: Viewer, people: Person[], todayKey: string, ready: boolean): GoalsPayload {
  return {
    ready,
    todayKey,
    viewerId: viewer.id,
    canManage: canManageGoals(viewer.level),
    canEnterReading: canEnterReading(viewer.level),
    goals: [],
    mine: [],
    mineTotals: { done: 0, target: 0 },
    people: people.map((p) => ({ id: p.id, firstName: p.firstName, initials: p.initials, levelLabel: p.levelLabel })),
    tally: [],
    catalog: CATALOG_ORDER.map((metric) => ({ metric, pick: METRICS[metric].pick, icon: METRICS[metric].icon })),
    periodChoices: periodChoices(todayKey),
    used: [],
    failedMetrics: [],
  };
}

export async function getGoalTitles(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin.from("team_goals").select("id, title").limit(500);
  if (error) {
    if (!isMissingTable(error)) console.error("[team-goals] titles failed", { code: error.code });
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.id as string, row.title as string]));
}

/** Everything the goals strip, the drawer and /admin/objectifs need, for this viewer. */
export async function getGoalsPayload(viewer: Viewer, people: Person[], now = new Date()): Promise<GoalsPayload> {
  const todayKey = dayKeyOf(now);
  const { data: goalData, error: goalError } = await supabaseAdmin
    .from("team_goals")
    .select("id, title, metric, target, period, start_date, end_date, sort_order, created_by, archived_at, created_at")
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(60);
  if (goalError) {
    if (isMissingTable(goalError)) return emptyPayload(viewer, people, todayKey, false);
    throw goalError;
  }
  const goals = (goalData ?? []) as GoalRow[];
  const base = emptyPayload(viewer, people, todayKey, true);
  if (!goals.length) return base;

  const week = teamWeek(todayKey);
  const goalIds = goals.map((g) => g.id);
  const { data: leverData, error: leverError } = await supabaseAdmin
    .from("team_goal_levers")
    .select("id, goal_id, owner_id, title, rhythm, weekly_target, sort_order, archived_at, created_at")
    .in("goal_id", goalIds)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (leverError) throw leverError;
  const levers = (leverData ?? []) as LeverRow[];
  const leverIds = levers.map((l) => l.id);
  const [ticks, linked] = leverIds.length
    ? await Promise.all([
        supabaseAdmin.from("team_goal_lever_ticks").select("lever_id, ticked_on").in("lever_id", leverIds).gte("ticked_on", week.startKey),
        supabaseAdmin
          .from("staff_tasks")
          .select("lever_id, completed_at")
          .in("lever_id", leverIds)
          .gte("completed_at", `${week.startKey}T00:00:00.000Z`),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (ticks.error) throw ticks.error;
  if (linked.error) throw linked.error;
  return goalsFromRows(viewer, people, {
    goals,
    levers,
    ticks: (ticks.data ?? []) as { lever_id: string; ticked_on: string }[],
    linked: (linked.data ?? []) as { lever_id: string; completed_at: string | null }[],
  }, now);
}

export type GoalRowsInput = {
  goals: GoalRow[];
  levers: LeverRow[];
  ticks: { lever_id: string; ticked_on: string }[];
  linked: { lever_id: string; completed_at: string | null }[];
};

/**
 * Assembly of the payload from goal rows; the metrics themselves are always
 * read from their records. `readings` replaces the readings table (only for
 * the development preview, before migration 091 runs).
 */
export async function goalsFromRows(
  viewer: Viewer,
  people: Person[],
  input: GoalRowsInput,
  now = new Date(),
  readings?: ReadingRow[],
): Promise<GoalsPayload> {
  const todayKey = dayKeyOf(now);
  const { goals, levers } = input;
  const base = emptyPayload(viewer, people, todayKey, true);
  if (!goals.length) return base;
  const windows = new Map(goals.map((g) => [g.id, goalWindow(g as GoalDates, todayKey)]));
  const since: Ctx["since"] = {};
  for (const g of goals) {
    const w = windows.get(g.id)!;
    const earliest = g.period === "recurring_month" ? g.start_date : w.startKey;
    if (!since[g.metric] || earliest < since[g.metric]!) since[g.metric] = earliest;
  }
  const ctx: Ctx = { todayKey, people, since };
  const { loaded, failed } = await loadMetrics(goals, ctx, readings);

  const titleOf = new Map(goals.map((g) => [g.id, g.title]));
  const leverViews: LeverView[] = levers.map((lever) => {
    const owner = people.find((p) => p.id === lever.owner_id);
    return {
      id: lever.id,
      goalId: lever.goal_id,
      goalTitle: titleOf.get(lever.goal_id) ?? "",
      ownerId: lever.owner_id,
      ownerName: owner?.firstName ?? "Ancien membre",
      ownerInitials: owner?.initials ?? "?",
      title: lever.title,
      rhythm: lever.rhythm,
      weeklyTarget: lever.weekly_target,
      done: leverDoneThisWeek(
        input.ticks.filter((t) => t.lever_id === lever.id),
        input.linked.filter((t) => t.lever_id === lever.id),
        todayKey,
      ),
      mine: lever.owner_id === viewer.id,
      canTick: canTickLever(viewer, lever),
    };
  });

  const views: GoalView[] = goals.map((goal) => {
    const def = METRICS[goal.metric];
    const window = windows.get(goal.id)!;
    const metric = failed.includes(goal.metric)
      ? { current: null, actualPerDay: null, paceText: "Le chiffre n’a pas pu se charger. Rechargez la page.", listTitle: "", evidence: [], history: [], forSale: [] }
      : metricFor(goal, window, ctx, loaded);
    const progress = goalProgress({
      current: metric.current,
      target: goal.target,
      window,
      todayKey,
      kind: def.kind,
      actualPerDay: metric.actualPerDay,
    });
    const remainingLabel = progress.status === "atteint" ? "Atteint" : `${formatCount(progress.remaining)} ${unitWord(goal.metric, progress.remaining)}`;
    const needSentence = progress.status === "atteint" || progress.status === "pas_atteint" ? "" : ` Il en faut ${progress.need}.`;
    return {
      id: goal.id,
      title: goal.title,
      metric: goal.metric,
      icon: def.icon,
      family: def.family,
      target: goal.target,
      targetLabel: formatCount(goal.target),
      current: metric.current,
      currentLabel: metric.current == null ? "?" : formatCount(metric.current),
      period: goal.period,
      periodLabel: window.label,
      tab: window.tab,
      countdown: window.countdown,
      endPhrase: window.endPhrase,
      ended: window.ended,
      status: progress.status,
      statusLabel: progress.label,
      tone: progress.tone,
      pct: progress.pct,
      remainingLabel,
      need: progress.status === "atteint" ? "Garder le cap" : progress.need,
      paceText: `${metric.paceText}${needSentence}`.trim(),
      source: def.source,
      measure: def.measure,
      listTitle: metric.listTitle,
      evidence: metric.evidence,
      history: metric.history,
      manual: def.manual,
      forSale: canManageGoals(viewer.level) ? metric.forSale : [],
      levers: leverViews.filter((l) => l.goalId === goal.id),
    };
  });

  const mine = leverViews.filter((l) => l.mine);
  const tallyBy = new Map<string, { done: number; target: number }>();
  for (const lever of leverViews) {
    const t = tallyBy.get(lever.ownerId) ?? { done: 0, target: 0 };
    t.done += Math.min(lever.done, lever.weeklyTarget);
    t.target += lever.weeklyTarget;
    tallyBy.set(lever.ownerId, t);
  }
  return {
    ...base,
    goals: views,
    mine,
    mineTotals: shareTotals(mine),
    tally: people
      .filter((p) => tallyBy.has(p.id))
      .map((p) => ({ personId: p.id, name: p.firstName, initials: p.initials, ...tallyBy.get(p.id)! })),
    used: views.filter((g) => !g.ended).map((g) => `${g.metric}|${g.period}`),
    failedMetrics: [...new Set(failed)],
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** The founder only: level from Clerk (isFounder) and the shared rule must both agree. */
function founderOnly(viewer: Viewer) {
  return viewer.isFounder && canManageGoals(viewer.level) ? null : fail(403, "Seul le Fondateur crée et modifie les objectifs.");
}

async function nextSort(table: "team_goals" | "team_goal_levers", goalId?: string) {
  let query = supabaseAdmin.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  if (goalId) query = query.eq("goal_id", goalId);
  const { data } = await query;
  return ((data?.[0]?.sort_order as number | undefined) ?? 0) + 1;
}

function checkOwner(people: Person[], ownerId: string) {
  return people.some((p) => p.id === ownerId) ? null : fail(404, "Cette personne ne fait pas partie de l’équipe.");
}

export async function createGoal(viewer: Viewer, people: Person[], input: NewGoalInput): Promise<ServiceResult<{ id: string }>> {
  const denied = founderOnly(viewer);
  if (denied) return denied;
  for (const lever of input.levers) {
    const bad = checkOwner(people, lever.ownerId);
    if (bad) return bad;
  }
  const { data, error } = await supabaseAdmin
    .from("team_goals")
    .insert({
      title: input.title,
      metric: input.metric,
      target: input.target,
      period: input.period,
      start_date: input.startDate,
      end_date: input.endDate,
      sort_order: await nextSort("team_goals"),
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error || !data) return writeError(error ?? {}, "create goal");
  if (input.levers.length) {
    const { error: leverError } = await supabaseAdmin.from("team_goal_levers").insert(
      input.levers.map((lever, index) => ({
        goal_id: data.id,
        owner_id: lever.ownerId,
        title: lever.title,
        rhythm: lever.rhythm,
        weekly_target: lever.weeklyTarget,
        sort_order: index + 1,
        created_by: viewer.id,
      })),
    );
    if (leverError) return writeError(leverError, "create goal levers");
  }
  return { ok: true, value: { id: data.id as string } };
}

export type GoalPatch =
  | { action: "target"; target: number }
  | { action: "title"; title: string }
  | { action: "archive" }
  | { action: "restore" };

export async function updateGoal(viewer: Viewer, id: string, patch: GoalPatch): Promise<ServiceResult<{ id: string }>> {
  const denied = founderOnly(viewer);
  if (denied) return denied;
  let values: Record<string, unknown>;
  if (patch.action === "target") values = { target: patch.target };
  else if (patch.action === "title") values = { title: patch.title };
  else if (patch.action === "archive") values = { archived_at: new Date().toISOString(), archived_by: viewer.id };
  else values = { archived_at: null, archived_by: null };
  const { data, error } = await supabaseAdmin.from("team_goals").update(values).eq("id", id).select("id");
  if (error) return writeError(error, `goal ${patch.action}`);
  if (!data?.length) return fail(404, "Cet objectif n’existe plus.");
  return { ok: true, value: { id } };
}

export async function createLever(viewer: Viewer, people: Person[], goalId: string, input: LeverInput): Promise<ServiceResult<{ id: string }>> {
  const denied = founderOnly(viewer);
  if (denied) return denied;
  const bad = checkOwner(people, input.ownerId);
  if (bad) return bad;
  const { data: goal, error: goalError } = await supabaseAdmin.from("team_goals").select("id, archived_at").eq("id", goalId).maybeSingle();
  if (goalError) return writeError(goalError, "lever goal");
  if (!goal || goal.archived_at) return fail(404, "Cet objectif n’existe plus.");
  const { data, error } = await supabaseAdmin
    .from("team_goal_levers")
    .insert({
      goal_id: goalId,
      owner_id: input.ownerId,
      title: input.title,
      rhythm: input.rhythm,
      weekly_target: input.weeklyTarget,
      sort_order: await nextSort("team_goal_levers", goalId),
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error || !data) return writeError(error ?? {}, "create lever");
  return { ok: true, value: { id: data.id as string } };
}

export async function updateLever(viewer: Viewer, people: Person[], id: string, input: LeverInput | { archive: true }): Promise<ServiceResult<{ id: string }>> {
  const denied = founderOnly(viewer);
  if (denied) return denied;
  let values: Record<string, unknown>;
  if ("archive" in input) values = { archived_at: new Date().toISOString() };
  else {
    const bad = checkOwner(people, input.ownerId);
    if (bad) return bad;
    values = { owner_id: input.ownerId, title: input.title, rhythm: input.rhythm, weekly_target: input.weeklyTarget };
  }
  const { data, error } = await supabaseAdmin.from("team_goal_levers").update(values).eq("id", id).select("id");
  if (error) return writeError(error, "update lever");
  if (!data?.length) return fail(404, "Ce levier n’existe plus.");
  return { ok: true, value: { id } };
}

/** « J’en ai fait un » (+1 today) or take back the last tick of the week. */
export async function tickLever(viewer: Viewer, id: string, action: "tick" | "untick", now = new Date()): Promise<ServiceResult<{ id: string }>> {
  const { data: lever, error } = await supabaseAdmin.from("team_goal_levers").select("id, owner_id, archived_at").eq("id", id).maybeSingle();
  if (error) return writeError(error, "load lever");
  if (!lever || lever.archived_at) return fail(404, "Ce levier n’existe plus.");
  if (!canTickLever(viewer, lever as { owner_id: string })) return fail(403, "Ce levier n’est pas le vôtre.");
  const today = dayKeyOf(now);
  if (action === "tick") {
    const { error: insertError } = await supabaseAdmin.from("team_goal_lever_ticks").insert({ lever_id: id, user_id: viewer.id, ticked_on: today });
    if (insertError) return writeError(insertError, "tick lever");
    return { ok: true, value: { id } };
  }
  const { data: last, error: lastError } = await supabaseAdmin
    .from("team_goal_lever_ticks")
    .select("id")
    .eq("lever_id", id)
    .gte("ticked_on", teamWeek(today).startKey)
    .order("created_at", { ascending: false })
    .limit(1);
  if (lastError) return writeError(lastError, "untick lever");
  if (!last?.length) return fail(409, "Rien à retirer cette semaine.");
  const { error: deleteError } = await supabaseAdmin.from("team_goal_lever_ticks").delete().eq("id", last[0].id);
  if (deleteError) return writeError(deleteError, "untick lever");
  return { ok: true, value: { id } };
}

const PROOF_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A manual reading, with an optional compressed screenshot (base64 from compressImageToBase64). */
export async function addReading(
  viewer: Viewer,
  input: ReadingInput,
  proof: { data: string; ext: string } | null,
): Promise<ServiceResult<{ id: string }>> {
  if (!canEnterReading(viewer.level)) return fail(403, "Seuls le Fondateur et le Directeur saisissent un chiffre.");
  let proofPath: string | null = null;
  if (proof) {
    const ext = proof.ext.toLowerCase().replace(/^\./, "");
    const contentType = PROOF_TYPES[ext];
    if (!contentType) return fail(400, "La capture doit être une image JPEG, PNG ou WebP.");
    const raw = proof.data.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length) return fail(400, "La capture est vide.");
    if (bytes.length > MAX_PROOF_BYTES) return fail(413, "La capture est trop lourde (5 Mo au plus).");
    proofPath = `readings/${input.metric}/${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(PROOF_BUCKET).upload(proofPath, bytes, { contentType, upsert: false });
    if (uploadError) {
      console.error("[team-goals] proof upload failed", { message: uploadError.message, bytes: bytes.length, ext });
      return fail(502, "La capture n’a pas pu être envoyée. Réessayez, ou enregistrez le chiffre sans capture.");
    }
  }
  const { data, error } = await supabaseAdmin
    .from("team_goal_readings")
    .insert({ metric: input.metric, value: input.value, measured_on: input.measuredOn, note: input.note, entered_by: viewer.id, proof_path: proofPath })
    .select("id")
    .single();
  if (error || !data) {
    if (proofPath) await supabaseAdmin.storage.from(PROOF_BUCKET).remove([proofPath]);
    return writeError(error ?? {}, "add reading");
  }
  return { ok: true, value: { id: data.id as string } };
}

export async function confirmSale(viewer: Viewer, input: { propertyId: string; signedOn: string; note: string | null }): Promise<ServiceResult<{ id: string }>> {
  const denied = founderOnly(viewer);
  if (denied) return fail(403, "Seul le Fondateur confirme une vente.");
  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id, listing_type, is_test")
    .eq("id", input.propertyId)
    .maybeSingle();
  if (propertyError) return writeError(propertyError, "sale property");
  if (!property) return fail(404, "Ce bien n’existe plus.");
  if (property.listing_type !== "vendre") return fail(400, "Ce bien n’est pas à vendre.");
  if (property.is_test) return fail(400, "Une annonce de test ne compte pas.");
  const { data, error } = await supabaseAdmin
    .from("team_goal_sales")
    .insert({ property_id: input.propertyId, signed_on: input.signedOn, note: input.note, confirmed_by: viewer.id })
    .select("id")
    .single();
  if (error || !data) return error?.code === "23505" ? fail(409, "Cette vente est déjà confirmée.") : writeError(error ?? {}, "confirm sale");
  return { ok: true, value: { id: data.id as string } };
}

export async function removeSale(viewer: Viewer, id: string): Promise<ServiceResult<{ id: string }>> {
  if (founderOnly(viewer)) return fail(403, "Seul le Fondateur confirme une vente.");
  const { data, error } = await supabaseAdmin.from("team_goal_sales").delete().eq("id", id).select("id");
  if (error) return writeError(error, "remove sale");
  if (!data?.length) return fail(404, "Cette vente n’existe plus.");
  return { ok: true, value: { id } };
}
