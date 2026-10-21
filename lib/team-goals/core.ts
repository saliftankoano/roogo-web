// "Nos objectifs": the team goals set by the founder. Pure rules only (no
// imports), so the browser, the server and node:test share one source: the
// metric catalogue, the period of a goal and its countdown, the pace and the
// status words, the shaping of the evidence, the levers' weekly progress,
// who may change what, and the checks on API input.
//
// Principle shown in the app: « Qu’est-ce qui doit se passer pour que ce soit
// inévitable ? ». Nothing here is a hardcoded number: every value comes from
// records handed in by lib/team-goals/server.ts.
//
// Dates: Ouagadougou is UTC all year, so a "day key" (YYYY-MM-DD) is read
// with the UTC getters.

export const PRINCIPLE = "Qu’est-ce qui doit se passer pour que ce soit inévitable ?";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function dayKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function startOf(key: string) {
  return new Date(`${key}T00:00:00.000Z`);
}

export function plusDays(key: string, days: number): string {
  return dayKeyOf(new Date(startOf(key).getTime() + days * DAY_MS));
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((startOf(b).getTime() - startOf(a).getTime()) / DAY_MS);
}

export function isDayKeyValue(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayKeyOf(startOf(value)) === value;
}

/** "1 000", "12 500". */
export function formatCount(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** "16 octobre", "1er août", or "16 octobre 2025" when the year differs from `yearOf`. */
export function dayLabel(key: string, yearOf?: string): string {
  const d = startOf(key);
  const year = yearOf && yearOf.slice(0, 4) !== key.slice(0, 4) ? ` ${d.getUTCFullYear()}` : "";
  const day = d.getUTCDate() === 1 ? "1er" : String(d.getUTCDate());
  return `${day} ${MONTHS[d.getUTCMonth()]}${year}`;
}

/** "16 oct." */
export function shortDayLabel(key: string): string {
  const d = startOf(key);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export const GOAL_METRICS = [
  "users",
  "properties_under_contract",
  "properties_sold",
  "properties_listed_in_period",
  "tiktok_followers",
  "facebook_followers",
  "instagram_followers",
] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const MANUAL_METRICS = ["tiktok_followers", "facebook_followers", "instagram_followers"] as const;
export type ManualMetric = (typeof MANUAL_METRICS)[number];

/** Icon shown with the goal: real platform logos, the Roogo logo, a house for sales, a key for rentals, a house-plus for listings. */
export type GoalIcon = "app" | "tiktok" | "facebook" | "instagram" | "vente" | "location" | "annonce";

export type MetricDef = {
  family: string;
  icon: GoalIcon;
  /** Name in the « Ajouter un objectif » catalogue. */
  pick: string;
  /** Default goal title for a target. */
  title: (target: number) => string;
  unit: [string, string];
  /** stock: a level read now (accounts, followers, contracts). flow: counted inside the period (sales, listings). */
  kind: "stock" | "flow";
  manual: boolean;
  /** Where the number comes from, after « Preuves · ». */
  source: string;
  /** How it is counted, one or two sentences. */
  measure: string;
};

export const METRICS: Record<GoalMetric, MetricDef> = {
  users: {
    family: "App",
    icon: "app",
    pick: "Utilisateurs sur Roogo",
    title: (n) => `${formatCount(n)} utilisateurs sur Roogo`,
    unit: ["compte", "comptes"],
    kind: "stock",
    manual: false,
    source: "Comptes Clerk",
    measure: "Comptes créés sur l’app et le site, comptés chez Clerk (là où vivent les comptes). Les comptes de l’équipe et les comptes de test ne comptent pas.",
  },
  tiktok_followers: {
    family: "TikTok",
    icon: "tiktok",
    pick: "Abonnés TikTok",
    title: (n) => `${formatCount(n)} abonnés TikTok`,
    unit: ["abonné", "abonnés"],
    kind: "stock",
    manual: true,
    source: "Saisi à la main",
    measure: "TikTok ne donne pas le chiffre à l’appli. Il est saisi à la main depuis le profil, avec la capture d’écran en preuve.",
  },
  facebook_followers: {
    family: "Facebook",
    icon: "facebook",
    pick: "Abonnés Facebook",
    title: (n) => `${formatCount(n)} abonnés Facebook`,
    unit: ["abonné", "abonnés"],
    kind: "stock",
    manual: true,
    source: "Lu chaque nuit",
    measure: "Abonnés de la page Facebook Roogo Burkina, lus automatiquement chaque nuit chez Facebook. Si la lecture ne passe pas, le chiffre se saisit à la main avec la capture d’écran en preuve.",
  },
  instagram_followers: {
    family: "Instagram",
    icon: "instagram",
    pick: "Abonnés Instagram",
    title: (n) => `${formatCount(n)} abonnés Instagram`,
    unit: ["abonné", "abonnés"],
    kind: "stock",
    manual: true,
    source: "Lu chaque nuit",
    measure: "Abonnés du compte Instagram @roogo.burkina, lus automatiquement chaque nuit chez Instagram. Si la lecture ne passe pas, le chiffre se saisit à la main avec la capture d’écran en preuve.",
  },
  properties_sold: {
    family: "Ventes",
    icon: "vente",
    pick: "Biens vendus",
    title: (n) => `${formatCount(n)} ${n > 1 ? "biens vendus" : "bien vendu"}`,
    unit: ["vente", "ventes"],
    kind: "flow",
    manual: false,
    source: "Statut Vendu",
    measure: "Toute vente compte : maison, villa, appartement ou terrain. Une vente compte quand l’annonce passe en « Vendu » avec la date de signature chez le notaire, sur la page de l’annonce (Directeur ou Fondateur).",
  },
  properties_under_contract: {
    family: "Locations",
    icon: "location",
    pick: "Biens loués sous contrat Roogo",
    title: (n) => `${formatCount(n)} ${n > 1 ? "biens loués" : "bien loué"} sous contrat Roogo`,
    unit: ["bien", "biens"],
    kind: "stock",
    manual: false,
    source: "Contrats actifs",
    measure: "Un bien compte quand son contrat de location est actif dans Roogo.",
  },
  properties_listed_in_period: {
    family: "Annonces",
    icon: "annonce",
    pick: "Nouveaux biens en ligne",
    title: (n) => `${formatCount(n)} ${n > 1 ? "nouveaux biens" : "nouveau bien"} en ligne`,
    unit: ["bien", "biens"],
    kind: "flow",
    manual: false,
    source: "Compté en direct",
    measure: "Biens mis en ligne pendant la période. Les annonces de test ne comptent pas ; celles en attente de validation s’affichent sans compter.",
  },
};

/**
 * The definition shown for a goal. TikTok joins the nightly automatic
 * readings only once the founder has connected the account (« Connecter
 * TikTok », lib/team-goals/tiktok-store.ts); until then it stays manual.
 * Manual entry stays open as the fallback either way.
 */
export function metricDefFor(metric: GoalMetric, opts: { tiktokConnected?: boolean } = {}): MetricDef {
  const def = METRICS[metric];
  if (metric === "tiktok_followers" && opts.tiktokConnected) {
    return {
      ...def,
      source: "Lu chaque nuit",
      measure: "Abonnés du compte TikTok @roogo.226, lus automatiquement chaque nuit chez TikTok. Si la lecture ne passe pas, le chiffre se saisit à la main avec la capture d’écran en preuve.",
    };
  }
  return def;
}

/** Catalogue order in « Ajouter un objectif » (approved canvas). */
export const CATALOG_ORDER: GoalMetric[] = [
  "properties_listed_in_period",
  "instagram_followers",
  "users",
  "tiktok_followers",
  "facebook_followers",
  "properties_sold",
  "properties_under_contract",
];

export function isGoalMetric(value: unknown): value is GoalMetric {
  return typeof value === "string" && (GOAL_METRICS as readonly string[]).includes(value);
}

export function isManualMetric(value: unknown): value is ManualMetric {
  return typeof value === "string" && (MANUAL_METRICS as readonly string[]).includes(value);
}

export function unitWord(metric: GoalMetric, n: number) {
  const [one, many] = METRICS[metric].unit;
  return Math.abs(n) > 1 ? many : one;
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export const GOAL_PERIODS = ["month", "recurring_month", "quarter", "year"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];
/** Tabs on Accueil: Tous / Ce mois / Ce trimestre / Cette année. */
export type PeriodTab = "mois" | "trimestre" | "annee";

export function isGoalPeriod(value: unknown): value is GoalPeriod {
  return typeof value === "string" && (GOAL_PERIODS as readonly string[]).includes(value);
}

export function monthBounds(key: string) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const start = `${y}-${pad(m)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return { start, end: plusDays(next, -1) };
}

export function quarterBounds(key: string) {
  const y = Number(key.slice(0, 4));
  const q = Math.floor((Number(key.slice(5, 7)) - 1) / 3);
  const start = `${y}-${pad(q * 3 + 1)}-01`;
  return { start, end: monthBounds(`${y}-${pad(q * 3 + 3)}-01`).end, quarter: q + 1 };
}

export function yearBounds(key: string) {
  const y = key.slice(0, 4);
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** Start and end stored for a new goal of this period, from today. */
export function periodDates(period: GoalPeriod, todayKey: string): { startDate: string; endDate: string | null } {
  if (period === "month") {
    const b = monthBounds(todayKey);
    return { startDate: b.start, endDate: b.end };
  }
  if (period === "recurring_month") return { startDate: monthBounds(todayKey).start, endDate: null };
  if (period === "quarter") {
    const b = quarterBounds(todayKey);
    return { startDate: b.start, endDate: b.end };
  }
  const b = yearBounds(todayKey);
  return { startDate: b.start, endDate: b.end };
}

/** The four choices of the period step, with today's wording. */
export function periodChoices(todayKey: string): { period: GoalPeriod; label: string; sub: string }[] {
  const month = monthBounds(todayKey);
  const quarter = quarterBounds(todayKey);
  const year = yearBounds(todayKey);
  return [
    { period: "month", label: "Ce mois", sub: `${capitalize(MONTHS[Number(todayKey.slice(5, 7)) - 1])} · jusqu’au ${shortDayLabel(month.end)}` },
    { period: "recurring_month", label: "Chaque mois", sub: "Repart le 1er · les mois passés restent en historique" },
    { period: "quarter", label: "Ce trimestre", sub: `T${quarter.quarter} ${todayKey.slice(0, 4)} · jusqu’au ${shortDayLabel(quarter.end)}` },
    { period: "year", label: "Cette année", sub: `Année ${todayKey.slice(0, 4)} · jusqu’au ${shortDayLabel(year.end)}` },
  ];
}

export type GoalDates = { period: GoalPeriod; start_date: string; end_date: string | null };

export type GoalWindow = {
  startKey: string;
  endKey: string;
  tab: PeriodTab;
  /** "Octobre", "Chaque mois", "T4 2026", "Année 2026". */
  label: string;
  /** Days after today until the end, 0 on the last day. */
  daysLeft: number;
  ended: boolean;
  upcoming: boolean;
  /** "encore 76 j", "dernier jour", "terminé le 31 octobre", "commence le 1er novembre". */
  countdown: string;
  /** "avant le 31 décembre". */
  endPhrase: string;
};

function monthLabel(key: string, todayKey: string) {
  const name = capitalize(MONTHS[Number(key.slice(5, 7)) - 1]);
  return key.slice(0, 4) === todayKey.slice(0, 4) ? name : `${name} ${key.slice(0, 4)}`;
}



/** The window a goal is measured on today. A recurring goal is measured on the current month. */
export function goalWindow(goal: GoalDates, todayKey: string): GoalWindow {
  let startKey: string;
  let endKey: string;
  let tab: PeriodTab;
  let label: string;
  if (goal.period === "recurring_month") {
    const anchor = todayKey < goal.start_date ? goal.start_date : todayKey;
    const b = monthBounds(anchor);
    startKey = b.start < goal.start_date ? goal.start_date : b.start;
    endKey = b.end;
    tab = "mois";
    label = "Chaque mois";
  } else {
    startKey = goal.start_date;
    endKey = goal.end_date ?? goal.start_date;
    if (goal.period === "month") {
      tab = "mois";
      label = monthLabel(startKey, todayKey);
    } else if (goal.period === "quarter") {
      tab = "trimestre";
      label = `T${quarterBounds(startKey).quarter} ${startKey.slice(0, 4)}`;
    } else {
      tab = "annee";
      label = `Année ${startKey.slice(0, 4)}`;
    }
  }
  const ended = todayKey > endKey;
  const upcoming = todayKey < startKey;
  const daysLeft = ended ? 0 : daysBetween(upcoming ? startKey : todayKey, endKey);
  let countdown: string;
  if (ended) countdown = `terminé le ${dayLabel(endKey, todayKey)}`;
  else if (upcoming) countdown = `commence le ${dayLabel(startKey, todayKey)}`;
  else if (daysLeft === 0) countdown = "dernier jour";
  else countdown = `encore ${daysLeft} j`;
  return { startKey, endKey, tab, label, daysLeft, ended, upcoming, countdown, endPhrase: `avant le ${dayLabel(endKey, todayKey)}` };
}

/** Past months of a recurring goal, newest first (history kept, counter restarted on the 1st). */
export function pastMonthWindows(goal: GoalDates, todayKey: string, max = 12): { startKey: string; endKey: string; label: string }[] {
  if (goal.period !== "recurring_month") return [];
  const out: { startKey: string; endKey: string; label: string }[] = [];
  let cursor = plusDays(monthBounds(todayKey).start, -1);
  while (out.length < max && cursor >= goal.start_date) {
    const b = monthBounds(cursor);
    const startKey = b.start < goal.start_date ? goal.start_date : b.start;
    out.push({ startKey, endKey: b.end, label: monthLabel(b.start, todayKey) });
    cursor = plusDays(b.start, -1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pace and status
// ---------------------------------------------------------------------------

export type GoalStatus = "en_bonne_voie" | "a_suivre" | "il_faut_agir" | "atteint" | "pas_atteint";
export type StatusTone = "green" | "amber" | "red" | "grey";

export const STATUS_LABELS: Record<GoalStatus, string> = {
  en_bonne_voie: "En bonne voie",
  a_suivre: "À suivre",
  il_faut_agir: "Il faut agir",
  atteint: "Atteint",
  pas_atteint: "Pas atteint",
};

export const STATUS_TONES: Record<GoalStatus, StatusTone> = {
  en_bonne_voie: "green",
  a_suivre: "amber",
  il_faut_agir: "red",
  atteint: "green",
  pas_atteint: "red",
};

/** A pace is judged only after a week of measurement. */
export const MIN_DAYS_FOR_PACE = 7;
/** Below this share of the required pace, the goal needs action. */
export const ACT_THRESHOLD = 0.6;

/** "4 par jour", "3 par semaine", "1 toutes les 5 semaines". */
export function needLabel(perDay: number): string {
  if (!(perDay > 0)) return "Rien de plus";
  if (perDay >= 1) return `${Math.ceil(perDay - 1e-9)} par jour`;
  const perWeek = perDay * 7;
  if (perWeek >= 1) return `${Math.ceil(perWeek - 1e-9)} par semaine`;
  const weeks = Math.floor(1 / perWeek);
  return weeks <= 1 ? "1 par semaine" : `1 toutes les ${weeks} semaines`;
}

export type Progress = {
  status: GoalStatus;
  tone: StatusTone;
  label: string;
  /** 0 to 100, for the bar. */
  pct: number;
  remaining: number;
  /** Per day needed from today to the end (end day included), null when nothing is left. */
  requiredPerDay: number | null;
  /** What we actually do per day, when known. */
  actualPerDay: number | null;
  need: string;
};

/**
 * Status from the required pace and the real pace.
 * - Reached: Atteint. Window over and not reached: Pas atteint.
 * - No number yet, period not started, or no real pace yet (less than a
 *   week of measurement): À suivre, in grey when there is no number at all.
 * - Real pace at or above the required pace: En bonne voie; at least 60% of
 *   it: À suivre; below: Il faut agir.
 * For a flow metric (sales, listings) the real pace is what was counted
 * since the start of the period divided by the days elapsed.
 */
export function goalProgress(input: {
  current: number | null;
  target: number;
  window: GoalWindow;
  todayKey: string;
  kind: "stock" | "flow";
  /** Real pace for a stock metric (new accounts per day, followers per day). */
  actualPerDay?: number | null;
}): Progress {
  const { current, target, window, todayKey, kind } = input;
  const pct = current == null ? 0 : Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  const remaining = Math.max(0, target - (current ?? 0));
  const daysInclusive = window.ended ? 0 : window.daysLeft + 1;
  const requiredPerDay = remaining > 0 && daysInclusive > 0 ? remaining / daysInclusive : null;
  let actualPerDay = input.actualPerDay ?? null;
  if (kind === "flow" && current != null && !window.upcoming) {
    const elapsed = daysBetween(window.startKey, window.ended ? window.endKey : todayKey) + 1;
    actualPerDay = elapsed >= MIN_DAYS_FOR_PACE ? current / elapsed : null;
  }
  const make = (status: GoalStatus, tone?: StatusTone): Progress => ({
    status,
    tone: tone ?? STATUS_TONES[status],
    label: STATUS_LABELS[status],
    pct,
    remaining,
    requiredPerDay,
    actualPerDay,
    need: requiredPerDay == null ? (remaining > 0 ? "Période terminée" : "Garder le cap") : needLabel(requiredPerDay),
  });
  if (current != null && current >= target) return make("atteint");
  if (window.ended) return make("pas_atteint");
  if (current == null) return make("a_suivre", "grey");
  if (window.upcoming || actualPerDay == null || requiredPerDay == null) return make("a_suivre");
  const ratio = actualPerDay / requiredPerDay;
  if (ratio >= 1) return make("en_bonne_voie");
  if (ratio >= ACT_THRESHOLD) return make("a_suivre");
  return make("il_faut_agir");
}

// ---------------------------------------------------------------------------
// Evidence shaping (counts only for people: no names, emails or phones)
// ---------------------------------------------------------------------------

/** Clerk test users and example.com accounts, the same rule as the team list. */
export function isTestEmail(email: string | null | undefined): boolean {
  return /\+clerk_test|@example\.(com|org)$/i.test(email ?? "");
}

export const TEAM_USER_TYPES = ["staff", "founder", "admin"];

export function countsAsUser(row: { user_type: string | null; email: string | null }): boolean {
  return !TEAM_USER_TYPES.includes((row.user_type ?? "").toLowerCase()) && !isTestEmail(row.email);
}

/** Monday of the calendar week (Monday to Sunday) of a day. */
export function mondayOf(key: string): string {
  const weekday = startOf(key).getUTCDay();
  return plusDays(key, weekday === 0 ? -6 : 1 - weekday);
}

export type WeekCount = { startKey: string; endKey: string; count: number; isCurrent: boolean; label: string; sub: string };

/** New records per calendar week, newest first, the current week included. */
export function weeklyCounts(isoTimes: string[], todayKey: string, weeks = 8): WeekCount[] {
  const current = mondayOf(todayKey);
  const out: WeekCount[] = [];
  for (let i = 0; i < weeks; i += 1) {
    const startKey = plusDays(current, -7 * i);
    const endKey = plusDays(startKey, 6);
    out.push({
      startKey,
      endKey,
      count: 0,
      isCurrent: i === 0,
      label: i === 0 ? "Cette sem." : shortDayLabel(startKey),
      sub: i === 0 ? `Depuis lundi ${dayLabel(startKey, todayKey)}` : `Semaine du ${dayLabel(startKey, todayKey)}`,
    });
  }
  const oldest = out[out.length - 1].startKey;
  for (const iso of isoTimes) {
    const key = dayKeyOf(new Date(iso));
    if (key < oldest || key > out[0].endKey) continue;
    const slot = out[daysBetween(mondayOf(key), current) / 7];
    if (slot) slot.count += 1;
  }
  return out;
}

/** Records of the last `days` days (today included), per day. */
export function recentPerDay(isoTimes: string[], todayKey: string, days = 28): number {
  const from = plusDays(todayKey, -(days - 1));
  const n = isoTimes.filter((iso) => {
    const key = dayKeyOf(new Date(iso));
    return key >= from && key <= todayKey;
  }).length;
  return n / days;
}

export type Reading = { value: number; measured_on: string; created_at?: string };

function sortReadings<T extends Reading>(readings: T[]): T[] {
  return [...readings].sort((a, b) =>
    a.measured_on === b.measured_on ? ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1) : a.measured_on < b.measured_on ? -1 : 1,
  );
}

/** The last reading on or before a day, or null. */
export function readingAt<T extends Reading>(readings: T[], endKey: string): T | null {
  const before = sortReadings(readings).filter((r) => r.measured_on <= endKey);
  return before.length ? before[before.length - 1] : null;
}

/**
 * Followers gained per day, from the latest reading back to the oldest
 * reading of the last 90 days that is at least a week older. Null with a
 * single reading or readings too close together.
 */
export function readingPace(readings: Reading[], todayKey: string): number | null {
  const sorted = sortReadings(readings).filter((r) => r.measured_on <= todayKey);
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1];
  const floor = plusDays(latest.measured_on, -90);
  const base = sorted.find((r) => r.measured_on >= floor && daysBetween(r.measured_on, latest.measured_on) >= MIN_DAYS_FOR_PACE);
  if (!base) return null;
  return (latest.value - base.value) / daysBetween(base.measured_on, latest.measured_on);
}

export type ListingRow = {
  id: string;
  status: string | null;
  is_test: boolean | null;
  published_at: string | null;
  created_at: string | null;
};

/** Listings put online inside the window (counted) and those still waiting for validation (shown, not counted). */
export function listedInWindow<T extends ListingRow>(rows: T[], window: { startKey: string; endKey: string }): { counted: T[]; pending: T[] } {
  const inside = (iso: string | null) => {
    if (!iso) return false;
    const key = dayKeyOf(new Date(iso));
    return key >= window.startKey && key <= window.endKey;
  };
  const real = rows.filter((row) => !row.is_test);
  const counted = real
    .filter((row) => row.status !== "en_attente" && inside(row.published_at))
    .sort((a, b) => ((a.published_at ?? "") < (b.published_at ?? "") ? 1 : -1));
  const pending = real
    .filter((row) => row.status === "en_attente" && inside(row.created_at))
    .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));
  return { counted, pending };
}

export type AgreementRow = {
  status: string | null;
  property_id: string | null;
  start_date: string | null;
  property: { is_test?: boolean | null } | null;
};

/** One row per property with an active rental agreement, test listings excluded, newest contract first. */
export function activeContracts<T extends AgreementRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => row.status === "active" && row.property_id && !row.property?.is_test)
    .sort((a, b) => ((a.start_date ?? "") < (b.start_date ?? "") ? 1 : -1))
    .filter((row) => {
      if (seen.has(row.property_id!)) return false;
      seen.add(row.property_id!);
      return true;
    });
}

export type SoldRow = { status: string | null; is_test: boolean | null; sold_at: string | null };

/**
 * Properties sold inside the window: status vendu, a signature date inside
 * the window, test listings excluded. Any property type counts (land too).
 * Newest sale first.
 */
export function soldInWindow<T extends SoldRow>(rows: T[], window: { startKey: string; endKey: string }): T[] {
  return rows
    .filter((row) => {
      if (row.status !== "vendu" || row.is_test || !row.sold_at) return false;
      const key = dayKeyOf(new Date(row.sold_at));
      return key >= window.startKey && key <= window.endKey;
    })
    .sort((a, b) => ((a.sold_at ?? "") < (b.sold_at ?? "") ? 1 : -1));
}

export type ReadingSource = "manuel" | "automatique";

const AUTO_PLATFORM: Partial<Record<GoalMetric, string>> = {
  facebook_followers: "Facebook",
  instagram_followers: "Instagram",
  tiktok_followers: "TikTok",
};

/** Under a reading in the drawer: « Lu automatiquement sur Facebook » or « Saisi par Salif ». */
export function readingSourceLabel(metric: GoalMetric, source: string | null | undefined, enteredBy: string | null): string {
  if (source === "automatique") {
    const platform = AUTO_PLATFORM[metric];
    return platform ? `Lu automatiquement sur ${platform}` : "Lu automatiquement";
  }
  return enteredBy ? `Saisi par ${enteredBy}` : "Saisi à la main";
}

/** "50 000 FCFA par mois". */
export function fcfa(amount: number | null | undefined, perMonth = false): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "";
  return `${formatCount(Number(amount))} FCFA${perMonth ? " par mois" : ""}`;
}

// ---------------------------------------------------------------------------
// Levers
// ---------------------------------------------------------------------------

/** Monday of the Monday-to-Saturday team week (Sunday belongs to the next week), like the briefing. */
export function teamWeekStart(key: string): string {
  const weekday = startOf(key).getUTCDay();
  return weekday === 0 ? plusDays(key, 1) : plusDays(key, 1 - weekday);
}

export function teamWeek(key: string) {
  const startKey = teamWeekStart(key);
  return { startKey, endKey: plusDays(startKey, 5), endExclusiveKey: plusDays(startKey, 6) };
}

/** Done this week = ticks of the week + tasks linked to the lever completed this week. */
export function leverDoneThisWeek(
  ticks: { ticked_on: string }[],
  doneTasks: { completed_at: string | null }[],
  todayKey: string,
): number {
  const week = teamWeek(todayKey);
  const inWeek = (key: string) => key >= week.startKey && key < week.endExclusiveKey;
  return (
    ticks.filter((t) => inWeek(t.ticked_on)).length +
    doneTasks.filter((t) => t.completed_at && inWeek(dayKeyOf(new Date(t.completed_at)))).length
  );
}

/** "Ma part cette semaine": each lever counts at most its weekly target. */
export function shareTotals(levers: { done: number; weeklyTarget: number }[]): { done: number; target: number } {
  return levers.reduce(
    (sum, lever) => ({ done: sum.done + Math.min(lever.done, lever.weeklyTarget), target: sum.target + lever.weeklyTarget }),
    { done: 0, target: 0 },
  );
}

// ---------------------------------------------------------------------------
// Who may do what (checked by the server; the buttons only follow)
// ---------------------------------------------------------------------------

export type GoalActorLevel = "fondateur" | "directeur" | "assistant" | "conseillere" | "stagiaire";

/** Create, archive, change the target, add or edit levers: the founder only. */
export function canManageGoals(level: GoalActorLevel | null | undefined): boolean {
  return level === "fondateur";
}

/** Enter a manual reading (followers): the founder and the Directeur. */
export function canEnterReading(level: GoalActorLevel | null | undefined): boolean {
  return level === "fondateur" || level === "directeur";
}

/** Tick a lever: its owner, the Directeur or the founder. */
export function canTickLever(actor: { id: string; level: GoalActorLevel }, lever: { owner_id: string }): boolean {
  return actor.id === lever.owner_id || actor.level === "fondateur" || actor.level === "directeur";
}

// ---------------------------------------------------------------------------
// Input checks shared by the API routes
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/\s/g, "")) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function cleanText(value: unknown, max: number): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

export type LeverInput = { ownerId: string; title: string; rhythm: string | null; weeklyTarget: number };

export function parseLever(body: unknown): { error: string } | { value: LeverInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuidValue(b.ownerId)) return { error: "Choisissez qui tient ce levier." };
  const title = cleanText(b.title, 160);
  if (!title) return { error: title === undefined ? "Le levier est trop long (160 caractères au plus)." : "Écrivez ce qu’on fait chaque semaine." };
  const rhythm = cleanText(b.rhythm, 80);
  if (rhythm === undefined) return { error: "Le rythme est trop long (80 caractères au plus)." };
  const weeklyTarget = intIn(b.weeklyTarget ?? 1, 1, 100);
  if (weeklyTarget == null) return { error: "Combien de fois par semaine : un nombre entre 1 et 100." };
  return { value: { ownerId: b.ownerId, title, rhythm, weeklyTarget } };
}

export type NewGoalInput = {
  metric: GoalMetric;
  title: string;
  target: number;
  period: GoalPeriod;
  startDate: string;
  endDate: string | null;
  levers: LeverInput[];
};

export function parseNewGoal(body: unknown, todayKey: string): { error: string } | { value: NewGoalInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isGoalMetric(b.metric)) return { error: "Choisissez ce qu’on mesure." };
  const target = intIn(b.target, 1, 100000000);
  if (target == null) return { error: "La cible doit être un nombre entier positif." };
  if (!isGoalPeriod(b.period)) return { error: "Choisissez la période." };
  const title = cleanText(b.title, 120);
  if (title === undefined) return { error: "Le titre est trop long (120 caractères au plus)." };
  const levers: LeverInput[] = [];
  if (b.levers != null) {
    if (!Array.isArray(b.levers) || b.levers.length > 10) return { error: "Dix leviers au plus." };
    for (const raw of b.levers) {
      const parsed = parseLever(raw);
      if ("error" in parsed) return parsed;
      levers.push(parsed.value);
    }
  }
  const { startDate, endDate } = periodDates(b.period, todayKey);
  return {
    value: { metric: b.metric, title: title ?? METRICS[b.metric].title(target), target, period: b.period, startDate, endDate, levers },
  };
}

export type ReadingInput = { metric: ManualMetric; value: number; measuredOn: string; note: string | null };

export function parseReading(body: unknown, todayKey: string): { error: string } | { value: ReadingInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isManualMetric(b.metric)) return { error: "Ce chiffre se compte tout seul : pas de saisie à la main." };
  const value = intIn(b.value, 0, 1000000000);
  if (value == null) return { error: "Le chiffre doit être un nombre entier." };
  const measuredOn = b.measuredOn == null || b.measuredOn === "" ? todayKey : b.measuredOn;
  if (!isDayKeyValue(measuredOn)) return { error: "La date n’est pas valide." };
  if (measuredOn > todayKey) return { error: "La date ne peut pas être dans le futur." };
  if (measuredOn < plusDays(todayKey, -366)) return { error: "La date est trop ancienne." };
  const note = cleanText(b.note, 300);
  if (note === undefined) return { error: "La note est trop longue (300 caractères au plus)." };
  return { value: { metric: b.metric, value, measuredOn, note } };
}

export function parseTarget(value: unknown): number | null {
  return intIn(value, 1, 100000000);
}
