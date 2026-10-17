// Server side of the staff briefing and team board: who is asking, what they
// may see and do, and the payloads for /admin and /admin/equipe. Every read
// and write uses the service role, like the other admin tables; permissions
// are checked here, never trusted from the client.

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { getUserTypeFromMetadata, isStaffLikeUserType } from "@/lib/user-types";
import {
  LEVEL_LABELS,
  addDays,
  assignmentKind,
  briefingSentence,
  bundlePastWeeks,
  buildBriefing,
  buildColumn,
  capitalize,
  dayKey,
  demandeState,
  initialsOf,
  isDirectorOrFounder,
  isLate,
  isOpen,
  isStaffTitle,
  lateLabel,
  levelFor,
  longDayLabel,
  mergeItems,
  orderPeople,
  rangeLabel,
  rowToItem,
  toDemandeView,
  weekBounds,
  weekdayAndDate,
  whenLabel,
  type BoardColumn,
  type BriefingItem,
  type DaySummary,
  type DemandeView,
  type NewTaskInput,
  type PastWeek,
  type Person,
  type PersonNames,
  type StaffLevel,
  type StaffTaskRow,
  type StaffTitle,
} from "./core";
import { loadAutoItems, propertyLabel } from "./sources";
import { fieldNoticesToday, type FieldNotice } from "@/lib/field-visits/server";

export type Viewer = Person & { isFounder: boolean };

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

const STAFF_TYPES = ["staff", "founder", "admin"];
const HISTORY_WEEKS = 8;

/** Table missing because migration 089 has not run yet. */
function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? "");
}

function firstNameOf(fullName: string | null | undefined, email: string | null | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  // "Abdoul Moubarak Zongo" goes by Moubarak: with three names or more, the
  // usual first name is the middle one.
  if (parts.length >= 3) return parts[1];
  if (parts.length) return parts[0];
  const local = (email ?? "").split("@")[0];
  return local ? capitalize(local) : "Membre";
}

function toPerson(row: { id: string; full_name: string | null; email: string | null }, level: StaffLevel): Person {
  const fullName = (row.full_name ?? "").trim() || firstNameOf(null, row.email);
  return {
    id: row.id,
    fullName,
    firstName: firstNameOf(row.full_name, row.email),
    // Initials follow the name people use: Moubarak Zongo is MZ, not AZ.
    initials: initialsOf(`${firstNameOf(row.full_name, row.email)} ${fullName.split(/\s+/).slice(-1)[0] ?? ""}`.trim()),
    level,
    levelLabel: LEVEL_LABELS[level],
  };
}

/** The signed-in staff member, or null when the caller is not staff. */
export async function getViewer(): Promise<Viewer | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  const userType = getUserTypeFromMetadata(clerkUser.publicMetadata);
  if (!isStaffLikeUserType(userType)) return null;
  const user = (await getOrSyncUserByClerkId(clerkUser.id)) as
    | { id: string; full_name: string | null; email: string | null }
    | null;
  if (!user) return null;
  let title: string | null = null;
  if (userType !== "founder") {
    const { data, error } = await supabaseAdmin
      .from("staff_titles")
      .select("title")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error && !isMissingTable(error)) console.error("[team-tasks] title lookup failed", { code: error.code });
    title = data?.title ?? null;
  }
  const level = levelFor(userType, title);
  const fullName = user.full_name || clerkUser.fullName || null;
  return {
    ...toPerson({ id: user.id, full_name: fullName, email: user.email }, level),
    isFounder: level === "fondateur",
  };
}

type PeopleResult = { people: Person[]; titlesReady: boolean };

async function loadPeople(viewer: Viewer): Promise<PeopleResult> {
  const [users, titles] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id, full_name, email, user_type")
      .in("user_type", STAFF_TYPES)
      .limit(200),
    supabaseAdmin.from("staff_titles").select("user_id, title"),
  ]);
  if (users.error) throw users.error;
  const titlesReady = !titles.error;
  if (titles.error && !isMissingTable(titles.error)) throw titles.error;
  const titleBy = new Map((titles.data ?? []).map((row) => [row.user_id as string, row.title as string]));
  // Test accounts (Clerk test users, example.com) are not people on the team.
  const isTestAccount = (email: string | null) => /\+clerk_test|@example\.(com|org)$/i.test(email ?? "");
  const people = (users.data ?? []).filter((row) => !isTestAccount(row.email as string | null)).map((row) =>
    toPerson(row, levelFor(row.user_type, titleBy.get(row.id))),
  );
  // The viewer's own level comes from Clerk, the source of truth for founders.
  const others = people.filter((p) => p.id !== viewer.id);
  return { people: orderPeople([...others, viewer]), titlesReady };
}

/** Staff and founders, ordered as in the briefing (used by the field visit sheet's team picker). */
export async function getTeamPeople(viewer: Viewer): Promise<Person[]> {
  return (await loadPeople(viewer)).people;
}

type TasksResult = { rows: StaffTaskRow[]; ready: boolean };

async function loadTaskRows(now: Date): Promise<TasksResult> {
  const since = new Date(weekBounds(dayKey(now)).start.getTime() - HISTORY_WEEKS * 7 * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("staff_tasks")
    .select("*")
    .or(`status.neq.fait,completed_at.gte.${since}`)
    .order("due_date", { ascending: true })
    .limit(3000);
  if (error) {
    if (isMissingTable(error)) return { rows: [], ready: false };
    throw error;
  }
  return { rows: (data ?? []) as StaffTaskRow[], ready: true };
}

function namesOf(people: Person[]): PersonNames {
  return new Map(people.map((p) => [p.id, { firstName: p.firstName }]));
}

export type Snapshot = {
  now: Date;
  people: Person[];
  titlesReady: boolean;
  tasksReady: boolean;
  rows: StaffTaskRow[];
  auto: BriefingItem[];
  items: BriefingItem[];
  failedSources: string[];
};

async function snapshot(viewer: Viewer, now = new Date()): Promise<Snapshot> {
  const [{ people, titlesReady }, { rows, ready }] = await Promise.all([loadPeople(viewer), loadTaskRows(now)]);
  const todayKey = dayKey(now);
  const { items: auto, failed } = await loadAutoItems({
    now,
    todayKey,
    week: weekBounds(todayKey),
    staffIds: new Set(people.map((p) => p.id)),
  });
  const names = namesOf(people);
  const stored = rows.map((row) => rowToItem(row, names)).filter((item): item is BriefingItem => !!item);
  return {
    now,
    people,
    titlesReady,
    tasksReady: ready,
    rows,
    auto,
    items: mergeItems(stored, auto),
    failedSources: failed,
  };
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export type ViewItem = BriefingItem & { when: string; lateWhen: string; late: boolean };

function view(item: BriefingItem, now: Date): ViewItem {
  return { ...item, when: whenLabel(item, now), lateWhen: lateLabel(item, now), late: isLate(item, now) };
}

export type ComposerPerson = {
  id: string;
  firstName: string;
  initials: string;
  levelLabel: string;
  isMe: boolean;
  isFounder: boolean;
  /** "demande" when the viewer can only send an ask, "manuel" otherwise. */
  mode: "manuel" | "demande";
  load: number;
};

export type BriefingPayload = {
  viewer: { id: string; firstName: string; fullName: string; initials: string; levelLabel: string; level: StaffLevel };
  nowIso: string;
  todayLabel: string;
  todayKey: string;
  sentence: string;
  total: number;
  done: number;
  open: number;
  late: ViewItem[];
  next: ViewItem | null;
  rest: ViewItem[];
  tomorrowLabel: string;
  tomorrow: ViewItem[];
  week: DaySummary[];
  /** Founder only: asks waiting for an answer, plus those handled today. */
  asks: DemandeView[];
  /** Directeur only: the asks they sent recently. */
  myAsks: DemandeView[];
  people: ComposerPerson[];
  canSeeTeam: boolean;
  unassignedCount: number;
  tasksReady: boolean;
  failedSources: string[];
  /** "Sur le terrain": today's field visit sheets and their latest time button (in-app notice). */
  fieldNotices: FieldNotice[];
};

function composerPeople(viewer: Viewer, people: Person[], items: BriefingItem[], now: Date): ComposerPerson[] {
  const weekEnd = weekBounds(dayKey(now)).endKey;
  return people
    .map((person) => {
      const mode = assignmentKind(viewer, person);
      if (!mode) return null;
      return {
        id: person.id,
        firstName: person.firstName,
        initials: person.initials,
        levelLabel: person.levelLabel,
        isMe: person.id === viewer.id,
        isFounder: person.level === "fondateur",
        mode,
        load: items.filter((item) => item.ownerId === person.id && isOpen(item) && item.dueDate <= weekEnd).length,
      };
    })
    .filter((p): p is ComposerPerson => !!p)
    // Others first, then "Moi", like the canvas.
    .sort((a, b) => Number(a.isMe) - Number(b.isMe));
}

function demandesFor(viewer: Viewer, rows: StaffTaskRow[], names: PersonNames, now: Date) {
  const todayKey = dayKey(now);
  const recent = addDays(todayKey, -14);
  const demandes = rows.filter((row) => row.kind === "demande");
  const asks = viewer.isFounder
    ? demandes
        .filter((row) => row.owner_id === viewer.id)
        .filter((row) => demandeState(row) === "pending" || dayKey(new Date(row.updated_at)) === todayKey)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        .map((row) => toDemandeView(row, names, now))
    : [];
  const myAsks = demandes
    .filter((row) => row.created_by === viewer.id && row.owner_id !== viewer.id)
    .filter((row) => demandeState(row) !== "done" || dayKey(new Date(row.updated_at)) >= recent)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 10)
    .map((row) => toDemandeView(row, names, now));
  return { asks, myAsks };
}

export async function getBriefingPayload(viewer: Viewer, now = new Date()): Promise<BriefingPayload> {
  const snap = await snapshot(viewer, now);
  const notices = await fieldNoticesToday(viewer.id, snap.people, now).catch((error) => {
    console.error("[team-tasks] field notices failed", { code: error?.code, message: error?.message });
    return [];
  });
  return briefingFromSnapshot(viewer, snap, notices);
}

/** Pure assembly of the briefing from loaded data (also used with mocked data in development). */
export function briefingFromSnapshot(viewer: Viewer, snap: Snapshot, fieldNotices: FieldNotice[] = []): BriefingPayload {
  const now = snap.now;
  const mine = snap.items.filter((item) => item.ownerId === viewer.id);
  const parts = buildBriefing(mine, now);
  const names = namesOf(snap.people);
  const { asks, myAsks } = demandesFor(viewer, snap.rows, names, now);
  const canSeeTeam = isDirectorOrFounder(viewer.level);
  return {
    viewer: {
      id: viewer.id,
      firstName: viewer.firstName,
      fullName: viewer.fullName,
      initials: viewer.initials,
      levelLabel: viewer.levelLabel,
      level: viewer.level,
    },
    nowIso: now.toISOString(),
    todayKey: parts.todayKey,
    todayLabel: capitalize(longDayLabel(parts.todayKey)),
    sentence: briefingSentence(parts),
    total: parts.total,
    done: parts.done,
    open: parts.open,
    late: parts.late.map((item) => view(item, now)),
    next: parts.next ? view(parts.next, now) : null,
    rest: parts.rest.map((item) => view(item, now)),
    tomorrowLabel: capitalize(weekdayAndDate(parts.tomorrowKey)),
    tomorrow: parts.tomorrow.map((item) => view(item, now)),
    week: parts.week,
    asks,
    myAsks,
    people: composerPeople(viewer, snap.people, snap.items, now),
    canSeeTeam,
    unassignedCount: canSeeTeam ? snap.items.filter((item) => !item.ownerId && isOpen(item)).length : 0,
    tasksReady: snap.tasksReady,
    failedSources: snap.failedSources,
    fieldNotices,
  };
}

/** Open items for the viewer today (late included): the number on "Mon espace". */
export async function getOpenCount(viewer: Viewer, now = new Date()): Promise<number> {
  const snap = await snapshot(viewer, now);
  return buildBriefing(snap.items.filter((item) => item.ownerId === viewer.id), now).open;
}

export type BoardPerson = Person & { isMe: boolean; isFounder: boolean };
export type BoardViewColumn = Omit<BoardColumn, "person" | "open"> & {
  person: BoardPerson | null;
  open: (BoardColumn["open"][number])[];
  asks: DemandeView[];
};

export type BoardPayload = {
  viewerId: string;
  viewerIsFounder: boolean;
  weekTitle: string;
  weekShortTitle: string;
  todayLabel: string;
  columns: BoardViewColumn[];
  unassigned: BoardViewColumn;
  pastWeeks: PastWeek[];
  /** People an unowned item can be given to by this viewer. */
  assignees: { id: string; firstName: string; isMe: boolean }[];
  people: ComposerPerson[];
  titles: { userId: string; title: StaffTitle | null }[];
  titlesReady: boolean;
  tasksReady: boolean;
  failedSources: string[];
};

/** "Semaine du lundi 12 au samedi 17 octobre", keeping both months when they differ. */
function longWeekTitle(startKey: string, endKey: string) {
  const start = longDayLabel(startKey);
  const end = longDayLabel(endKey);
  const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7);
  return `Semaine du ${sameMonth ? start.replace(/ \S+$/, "") : start} au ${end}`;
}

export async function getBoardPayload(viewer: Viewer, now = new Date()): Promise<ServiceResult<BoardPayload>> {
  if (!isDirectorOrFounder(viewer.level)) return fail(403, "L’équipe est réservée au Directeur et au Fondateur.");
  return { ok: true, value: boardFromSnapshot(viewer, await snapshot(viewer, now)) };
}

/** Pure assembly of the week board from loaded data (also used with mocked data in development). */
export function boardFromSnapshot(viewer: Viewer, snap: Snapshot): BoardPayload {
  const now = snap.now;
  const todayKey = dayKey(now);
  const week = weekBounds(todayKey);
  const names = namesOf(snap.people);
  const demandes = snap.rows.filter((row) => row.kind === "demande");
  const columns = snap.people.map((person) => {
    const isFounder = person.level === "fondateur";
    const asks = isFounder
      ? demandes
          .filter((row) => row.owner_id === person.id)
          .filter((row) => demandeState(row) === "pending" || dayKey(new Date(row.updated_at)) === todayKey)
          .map((row) => toDemandeView(row, names, now))
      : [];
    const column = buildColumn(
      person,
      snap.items.filter((item) => item.ownerId === person.id),
      now,
      asks.filter((ask) => ask.state === "pending").length,
    );
    return {
      ...column,
      person: {
        ...person,
        firstName: person.id === viewer.id ? `${person.firstName} (moi)` : person.firstName,
        isMe: person.id === viewer.id,
        isFounder,
      },
      asks,
    };
  });
  const unassignedColumn = buildColumn(null, snap.items.filter((item) => !item.ownerId), now);
  const doneItems = snap.rows
    .map((row) => rowToItem(row, names))
    .filter((item): item is BriefingItem => !!item && !isOpen(item));
  return {
    viewerId: viewer.id,
    viewerIsFounder: viewer.isFounder,
    weekTitle: longWeekTitle(week.startKey, week.endKey),
    weekShortTitle: `Semaine ${rangeLabel(week.startKey, week.endKey)}`,
    todayLabel: `Aujourd’hui ${weekdayAndDate(todayKey)}`,
    columns,
    unassigned: { ...unassignedColumn, person: null, asks: [] },
    pastWeeks: bundlePastWeeks(doneItems, snap.people, now),
    assignees: snap.people
      .filter((person) => assignmentKind(viewer, person) === "manuel")
      .map((person) => ({ id: person.id, firstName: person.firstName, isMe: person.id === viewer.id })),
    people: composerPeople(viewer, snap.people, snap.items, now),
    titles: snap.people
      .filter((person) => person.level !== "fondateur")
      .map((person) => ({ userId: person.id, title: isStaffTitle(person.level) ? person.level : null })),
    titlesReady: snap.titlesReady,
    tasksReady: snap.tasksReady,
    failedSources: snap.failedSources,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function writeError(error: { code?: string; message?: string }, context: string) {
  if (isMissingTable(error)) return fail(503, "Les tâches ne sont pas encore installées (migration 089 à lancer).");
  if (error.code === "23503") return fail(400, "Le lien choisi n’existe plus.");
  if (error.code === "23505") return fail(409, "Cette tâche existe déjà.");
  console.error(`[team-tasks] ${context} failed`, { code: error.code, message: error.message });
  return fail(500, "L’enregistrement a échoué. Réessayez.");
}

async function findPerson(viewer: Viewer, id: string): Promise<Person | null> {
  if (id === viewer.id) return viewer;
  const { people } = await loadPeople(viewer);
  return people.find((p) => p.id === id) ?? null;
}

export async function createTask(viewer: Viewer, input: NewTaskInput): Promise<ServiceResult<{ id: string; kind: "manuel" | "demande" }>> {
  const target = await findPerson(viewer, input.ownerId);
  if (!target) return fail(404, "Cette personne ne fait pas partie de l’équipe.");
  const kind = assignmentKind(viewer, target);
  if (!kind) {
    return fail(403, target.level === "fondateur"
      ? "Seul un Directeur peut envoyer une demande au Fondateur."
      : "Vous pouvez seulement vous ajouter une tâche à vous-même.");
  }
  if (kind === "demande" && !input.reason) return fail(400, "Dites pourquoi : c’est obligatoire pour une demande.");
  const { data, error } = await supabaseAdmin
    .from("staff_tasks")
    .insert({
      owner_id: target.id,
      created_by: viewer.id,
      kind,
      title: input.title,
      note: input.note,
      reason: kind === "demande" ? input.reason : null,
      due_date: input.dueDate,
      due_time: input.dueTime,
      property_id: input.propertyId,
      visit_request_id: input.visitRequestId,
      studio_project_id: input.studioProjectId,
    })
    .select("id")
    .single();
  if (error || !data) return writeError(error ?? {}, "create");
  return { ok: true, value: { id: data.id as string, kind } };
}

export type TaskAction =
  | { action: "done" }
  | { action: "undo" }
  | { action: "postpone" }
  | { action: "accept" }
  | { action: "reply"; text: string };

function nextWorkingDay(key: string) {
  const next = addDays(key, 1);
  return new Date(`${next}T00:00:00Z`).getUTCDay() === 0 ? addDays(next, 1) : next;
}

export async function updateTask(viewer: Viewer, id: string, body: TaskAction, now = new Date()): Promise<ServiceResult<{ id: string }>> {
  const { data: row, error } = await supabaseAdmin.from("staff_tasks").select("*").eq("id", id).maybeSingle<StaffTaskRow>();
  if (error) return writeError(error, "load");
  if (!row) return fail(404, "Cette tâche n’existe plus.");
  const involved = row.owner_id === viewer.id || row.created_by === viewer.id || isDirectorOrFounder(viewer.level);
  const nowIso = now.toISOString();
  let patch: Record<string, unknown>;

  switch (body.action) {
    case "done":
    case "undo":
    case "postpone": {
      if (!involved) return fail(403, "Cette tâche n’est pas la vôtre.");
      if (row.kind === "demande" && !row.accepted_at) return fail(409, "Cette demande n’a pas encore été prise en charge.");
      if (body.action === "done") patch = { status: "fait", completed_at: nowIso, completed_by: viewer.id };
      else if (body.action === "undo") {
        if (row.kind === "auto") {
          const { error: deleteError } = await supabaseAdmin.from("staff_tasks").delete().eq("id", id).eq("kind", "auto");
          if (deleteError) return writeError(deleteError, "undo auto");
          return { ok: true, value: { id } };
        }
        patch = { status: "a_faire", completed_at: null, completed_by: null };
      } else {
        if (row.status === "fait") return fail(409, "Cette tâche est déjà faite.");
        patch = { status: "reportee", due_date: nextWorkingDay(dayKey(now)) };
      }
      break;
    }
    case "accept":
    case "reply": {
      if (row.kind !== "demande") return fail(400, "Ce n’est pas une demande.");
      if (!viewer.isFounder || row.owner_id !== viewer.id) return fail(403, "Seul le Fondateur concerné peut répondre à cette demande.");
      if (body.action === "accept") {
        if (row.accepted_at) return { ok: true, value: { id } };
        const today = dayKey(now);
        patch = { accepted_at: nowIso, due_date: row.due_date < today ? today : row.due_date };
      } else {
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return fail(400, "Écrivez votre réponse.");
        if (text.length > 500) return fail(400, "La réponse est trop longue (500 caractères au plus).");
        patch = { reply_text: text, replied_at: nowIso };
      }
      break;
    }
    default:
      return fail(400, "Action inconnue.");
  }

  const { error: updateError } = await supabaseAdmin.from("staff_tasks").update(patch).eq("id", id);
  if (updateError) return writeError(updateError, body.action);
  return { ok: true, value: { id } };
}

export async function deleteTask(viewer: Viewer, id: string): Promise<ServiceResult<{ id: string }>> {
  const { data: row, error } = await supabaseAdmin.from("staff_tasks").select("id, created_by, kind").eq("id", id).maybeSingle();
  if (error) return writeError(error, "load");
  if (!row) return fail(404, "Cette tâche n’existe plus.");
  if (row.kind === "auto") return fail(400, "Décochez-la plutôt.");
  if (row.created_by !== viewer.id && !viewer.isFounder) return fail(403, "Seule la personne qui a créé la tâche peut la supprimer.");
  const { error: deleteError } = await supabaseAdmin.from("staff_tasks").delete().eq("id", id);
  if (deleteError) return writeError(deleteError, "delete");
  return { ok: true, value: { id } };
}

/**
 * Acts on an automatic item. The item is looked up again on the server from
 * its key, so nobody can tick or hand out something that is not really there.
 */
export async function autoItemAction(
  viewer: Viewer,
  body: { action: "done" | "assign"; key: string; ownerId?: string },
  now = new Date(),
): Promise<ServiceResult<{ id: string }>> {
  const snap = await snapshot(viewer, now);
  if (!snap.tasksReady) return fail(503, "Les tâches ne sont pas encore installées (migration 089 à lancer).");
  const item = snap.auto.find((candidate) => candidate.key === body.key);
  if (!item || !item.sourceKey) return fail(404, "Cet élément n’est plus en attente.");
  if (snap.items.every((candidate) => candidate.key !== item.key)) return fail(409, "Quelqu’un s’en occupe déjà.");
  const today = dayKey(now);
  const common = {
    title: item.title.slice(0, 200),
    note: item.sub ? item.sub.slice(0, 2000) : null,
    due_date: item.dueDate < today && body.action === "assign" ? today : item.dueDate,
    due_time: item.dueTime,
    source_key: item.sourceKey,
    source_href: item.href,
    property_id: item.propertyId,
    visit_request_id: item.visitRequestId,
    studio_project_id: item.studioProjectId,
    created_by: viewer.id,
  };
  let insert: Record<string, unknown>;
  if (body.action === "done") {
    if (!item.canCheck) return fail(400, "Cet élément se termine dans sa page.");
    if (item.ownerId !== viewer.id && !isDirectorOrFounder(viewer.level)) return fail(403, "Cet élément n’est pas le vôtre.");
    insert = {
      ...common,
      kind: "auto",
      owner_id: item.ownerId ?? viewer.id,
      status: "fait",
      completed_at: now.toISOString(),
      completed_by: viewer.id,
    };
  } else {
    if (!isDirectorOrFounder(viewer.level)) return fail(403, "Seuls le Directeur et le Fondateur attribuent.");
    if (item.ownerId) return fail(409, "Cet élément a déjà un responsable.");
    const target = body.ownerId ? snap.people.find((p) => p.id === body.ownerId) : null;
    if (!target) return fail(404, "Cette personne ne fait pas partie de l’équipe.");
    if (assignmentKind(viewer, target) !== "manuel") return fail(403, "Vous ne pouvez pas attribuer à cette personne.");
    insert = { ...common, kind: "manuel", owner_id: target.id, status: "a_faire" };
  }
  const { data, error } = await supabaseAdmin.from("staff_tasks").insert(insert).select("id").single();
  if (error || !data) return writeError(error ?? {}, `auto ${body.action}`);
  return { ok: true, value: { id: data.id as string } };
}

export async function setStaffTitle(viewer: Viewer, userId: string, title: StaffTitle): Promise<ServiceResult<{ userId: string }>> {
  if (!viewer.isFounder) return fail(403, "Seul le Fondateur change les titres.");
  const target = await findPerson(viewer, userId);
  if (!target) return fail(404, "Cette personne ne fait pas partie de l’équipe.");
  if (target.level === "fondateur") return fail(400, "Le titre de Fondateur vient du compte, pas d’ici.");
  const { error } = await supabaseAdmin
    .from("staff_titles")
    .upsert({ user_id: userId, title, updated_by: viewer.id }, { onConflict: "user_id" });
  if (error) return writeError(error, "title");
  return { ok: true, value: { userId } };
}

// ---------------------------------------------------------------------------
// "Lier à" options
// ---------------------------------------------------------------------------

export type LinkOption = { id: string; label: string; sub: string };

export async function searchLinks(viewer: Viewer, type: string, q: string): Promise<ServiceResult<LinkOption[]>> {
  const term = q.replace(/[%,()]/g, " ").trim().slice(0, 60);
  if (type === "property") {
    let query = supabaseAdmin
      .from("properties")
      .select("id, property_type, quartier, city, reference, listing_type")
      .order("created_at", { ascending: false })
      .limit(12);
    if (term) query = query.or(`reference.ilike.%${term}%,quartier.ilike.%${term}%,city.ilike.%${term}%`);
    const { data, error } = await query;
    if (error) return writeError(error, "links property");
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: row.id as string,
        label: propertyLabel(row),
        sub: row.listing_type === "vendre" ? "Vente" : "Location",
      })),
    };
  }
  if (type === "visit") {
    const { data, error } = await supabaseAdmin
      .from("visit_requests")
      .select("id, status, scheduled_at, created_at, buyer:buyer_id ( full_name ), property:property_id ( id, property_type, quartier, city, reference )")
      .in("status", ["requested", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) return writeError(error, "links visit");
    return {
      ok: true,
      value: (data ?? []).map((row) => {
        const property = Array.isArray(row.property) ? row.property[0] : row.property;
        const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
        const when = row.scheduled_at ? new Date(row.scheduled_at as string) : null;
        return {
          id: row.id as string,
          label: `Visite, ${propertyLabel(property ?? null)}`,
          sub: [
            (buyer as { full_name?: string } | null)?.full_name,
            when ? `${weekdayAndDate(dayKey(when))} ${when.toISOString().slice(11, 16)}` : "À confirmer",
          ].filter(Boolean).join(" · "),
        };
      }),
    };
  }
  if (type === "studio") {
    let query = supabaseAdmin
      .from("studio_conversations")
      .select("id, title, updated_at, user_id")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(15);
    if (!viewer.isFounder) query = query.eq("user_id", viewer.id);
    if (term) query = query.ilike("title", `%${term}%`);
    const { data, error } = await query;
    if (error) return writeError(error, "links studio");
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: row.id as string,
        label: row.title as string,
        sub: `Modifié ${weekdayAndDate(dayKey(new Date(row.updated_at as string)))}`,
      })),
    };
  }
  return fail(400, "Type de lien inconnu.");
}
