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
  demandeActionError,
  demandeRole,
  demandeState,
  callDoneError,
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
  parseSnoozeDate,
  rangeLabel,
  rowToItem,
  STAFF_LEVEL_BY_TITLE,
  titleFromStaffLevel,
  toDemandeView,
  weekBounds,
  weekdayAndDate,
  whenLabel,
  type BoardColumn,
  type BriefingItem,
  type DaySummary,
  type DemandeMessageRow,
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
import { getGoalTitles, getGoalsPayload, type GoalsPayload } from "@/lib/team-goals/server";
import { TeamError, setMemberLevel } from "@/lib/staff-team-server";

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
  // The title is the staff level from Clerk, like every other admin guard.
  const title = userType === "founder" ? null : titleFromStaffLevel(String(clerkUser.publicMetadata?.staffLevel ?? ""));
  const level = levelFor(userType, title);
  const fullName = user.full_name || clerkUser.fullName || null;
  return {
    ...toPerson({ id: user.id, full_name: fullName, email: user.email }, level),
    isFounder: level === "fondateur",
  };
}

type PeopleResult = { people: Person[]; titlesReady: boolean };

async function loadPeople(viewer: Viewer): Promise<PeopleResult> {
  const users = await supabaseAdmin
    .from("users")
    .select("id, full_name, email, user_type, staff_level")
    .in("user_type", STAFF_TYPES)
    .limit(200);
  if (users.error) throw users.error;
  // Titles are the staff levels (users.staff_level), always available since 089_staff_levels.
  const titlesReady = true;
  // Test accounts (Clerk test users, example.com) are not people on the team.
  const isTestAccount = (email: string | null) => /\+clerk_test|@example\.(com|org)$/i.test(email ?? "");
  const people = (users.data ?? []).filter((row) => !isTestAccount(row.email as string | null)).map((row) =>
    toPerson(row, levelFor(row.user_type, titleFromStaffLevel(row.staff_level))),
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
  /** Thread messages of the demandes in `rows` (092). */
  messages: DemandeMessageRow[];
  auto: BriefingItem[];
  items: BriefingItem[];
  failedSources: string[];
};

async function loadMessages(rows: StaffTaskRow[]): Promise<DemandeMessageRow[]> {
  const ids = rows.filter((row) => row.kind === "demande").map((row) => row.id);
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin
    .from("staff_task_messages")
    .select("id, task_id, author_id, body, created_at")
    .in("task_id", ids.slice(0, 300))
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    if (!isMissingTable(error)) console.error("[team-tasks] demande messages failed", { code: error.code });
    return [];
  }
  return (data ?? []) as DemandeMessageRow[];
}

async function snapshot(viewer: Viewer, now = new Date()): Promise<Snapshot> {
  const [{ people, titlesReady }, { rows, ready }, goalTitles] = await Promise.all([
    loadPeople(viewer),
    loadTaskRows(now),
    getGoalTitles(),
  ]);
  const messages = await loadMessages(rows);
  const todayKey = dayKey(now);
  const { items: auto, failed } = await loadAutoItems({
    now,
    todayKey,
    week: weekBounds(todayKey),
    staffIds: new Set(people.map((p) => p.id)),
  });
  const names = namesOf(people);
  const stored = rows.map((row) => rowToItem(row, names, goalTitles)).filter((item): item is BriefingItem => !!item);
  return {
    now,
    people,
    titlesReady,
    tasksReady: ready,
    rows,
    messages,
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
  /** Founder only: asks waiting for an answer, open threads, plus those handled today. */
  asks: DemandeView[];
  /** Directeur only: the asks they sent recently. */
  myAsks: DemandeView[];
  /** Asks with something new from the other side (« Réponse de Salif »), for the badge. */
  unreadAsks: number;
  /** Team goals (091). ready is false until the migration runs. */
  goals: GoalsPayload | null;
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

/** Open for the founder: waiting for an answer (a snooze that ended included) or in a thread. */
function askIsOpen(row: StaffTaskRow, todayKey: string) {
  const state = demandeState(row, todayKey);
  return state === "pending" || state === "thread";
}

export function demandesFor(viewer: Viewer, rows: StaffTaskRow[], names: PersonNames, now: Date, messages: DemandeMessageRow[] = []) {
  const todayKey = dayKey(now);
  const recent = addDays(todayKey, -14);
  const demandes = rows.filter((row) => row.kind === "demande");
  const asks = viewer.isFounder
    ? demandes
        .filter((row) => row.owner_id === viewer.id)
        .filter((row) => askIsOpen(row, todayKey) || dayKey(new Date(row.updated_at)) === todayKey)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        .map((row) => toDemandeView(row, names, now, messages, viewer.id))
    : [];
  const myAsks = demandes
    .filter((row) => row.created_by === viewer.id && row.owner_id !== viewer.id)
    .map((row) => toDemandeView(row, names, now, messages, viewer.id))
    .filter((ask) => ask.unread || !["done", "approved", "settled"].includes(ask.state) || dayKey(new Date(rows.find((r) => r.id === ask.id)!.updated_at)) >= recent)
    .sort((a, b) => Number(b.unread) - Number(a.unread) || (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10);
  const unread = [...asks, ...myAsks].filter((ask) => ask.unread).length;
  return { asks, myAsks, unread };
}

export async function getBriefingPayload(viewer: Viewer, now = new Date()): Promise<BriefingPayload> {
  const snap = await snapshot(viewer, now);
  const [notices, goals] = await Promise.all([
    fieldNoticesToday(viewer.id, snap.people, now).catch((error) => {
      console.error("[team-tasks] field notices failed", { code: error?.code, message: error?.message });
      return [];
    }),
    getGoalsPayload(viewer, snap.people, now).catch((error) => {
      console.error("[team-tasks] goals failed", { code: error?.code, message: error?.message });
      return null;
    }),
  ]);
  return briefingFromSnapshot(viewer, snap, notices, goals);
}

/** Pure assembly of the briefing from loaded data (also used with mocked data in development). */
export function briefingFromSnapshot(
  viewer: Viewer,
  snap: Snapshot,
  fieldNotices: FieldNotice[] = [],
  goals: GoalsPayload | null = null,
): BriefingPayload {
  const now = snap.now;
  const mine = snap.items.filter((item) => item.ownerId === viewer.id);
  const parts = buildBriefing(mine, now);
  const names = namesOf(snap.people);
  const { asks, myAsks, unread } = demandesFor(viewer, snap.rows, names, now, snap.messages ?? []);
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
    unreadAsks: unread,
    goals,
    people: composerPeople(viewer, snap.people, snap.items, now),
    canSeeTeam,
    unassignedCount: canSeeTeam ? snap.items.filter((item) => !item.ownerId && isOpen(item)).length : 0,
    tasksReady: snap.tasksReady,
    failedSources: snap.failedSources,
    fieldNotices,
  };
}

/** Open items for the viewer today (late included) and unread answers on demandes: the numbers on "Accueil". */
export async function getOpenCount(viewer: Viewer, now = new Date()): Promise<{ open: number; unread: number }> {
  const snap = await snapshot(viewer, now);
  const { unread } = demandesFor(viewer, snap.rows, namesOf(snap.people), now, snap.messages ?? []);
  return { open: buildBriefing(snap.items.filter((item) => item.ownerId === viewer.id), now).open, unread };
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
          .filter((row) => askIsOpen(row, todayKey) || dayKey(new Date(row.updated_at)) === todayKey)
          .map((row) => toDemandeView(row, names, now, snap.messages ?? [], viewer.id))
      : [];
    const column = buildColumn(
      person,
      snap.items.filter((item) => item.ownerId === person.id),
      now,
      asks.filter((ask) => ask.state === "pending" || ask.state === "thread").length,
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
  if (input.leverId) {
    const { data: lever, error: leverError } = await supabaseAdmin
      .from("team_goal_levers")
      .select("id, goal_id")
      .eq("id", input.leverId)
      .maybeSingle();
    if (leverError) return writeError(leverError, "lever lookup");
    if (!lever || lever.goal_id !== input.goalId) return fail(400, "Ce levier ne fait pas partie de cet objectif.");
  } else if (input.goalId) {
    const { data: goal, error: goalError } = await supabaseAdmin.from("team_goals").select("id").eq("id", input.goalId).maybeSingle();
    if (goalError) return writeError(goalError, "goal lookup");
    if (!goal) return fail(400, "Cet objectif n’existe plus.");
  }
  // Columns of 091/092 are only sent when used, so plain tasks keep working
  // before those migrations run.
  const extra: Record<string, unknown> = {};
  if (input.goalId) extra.goal_id = input.goalId;
  if (input.leverId) extra.lever_id = input.leverId;
  if (input.isCall && kind !== "demande") {
    extra.is_call = true;
    if (input.callPhone) extra.call_phone = input.callPhone;
    if (input.callSubject) extra.call_subject = input.callSubject;
  }
  if (input.propertyRequestId) extra.property_request_id = input.propertyRequestId;
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
      ...extra,
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
  | { action: "approve" }
  | { action: "snooze"; until: string }
  | { action: "message"; text: string }
  | { action: "settle" }
  | { action: "seen" };

/** True when a call note exists for the task (092). */
export async function hasCallNote(taskId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("staff_call_notes").select("id").eq("task_id", taskId).limit(1);
  if (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
  return (data ?? []).length > 0;
}

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
      if (body.action === "done") {
        // Rule approved by Salif (2026-10-16): no ticking a call task before its result is noted.
        const refusal = callDoneError(row, row.is_call ? await hasCallNote(row.id) : false);
        if (refusal) return fail(409, refusal);
        patch = { status: "fait", completed_at: nowIso, completed_by: viewer.id };
      }
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
    case "approve":
    case "snooze":
    case "message":
    case "settle":
    case "seen": {
      if (row.kind !== "demande") return fail(400, "Ce n’est pas une demande.");
      const today = dayKey(now);
      const role = demandeRole(row, viewer.id);
      // The founder addressed must really be the founder (a title change cannot make anyone else answer).
      const effectiveRole = role === "owner" && !viewer.isFounder ? "other" : role;
      if (body.action === "accept" && row.accepted_at && effectiveRole === "owner") return { ok: true, value: { id } };
      const refusal = demandeActionError(demandeState(row, today), body.action, effectiveRole);
      if (refusal) return fail(effectiveRole === "other" || (effectiveRole === "sender" && body.action !== "message" && body.action !== "settle") ? 403 : 409, refusal);
      const seenField = effectiveRole === "owner" ? "owner_seen_at" : "sender_seen_at";
      if (body.action === "accept") {
        patch = { accepted_at: nowIso, due_date: row.due_date < today ? today : row.due_date, snoozed_until: null };
      } else if (body.action === "approve") {
        patch = { decision: "approved", decided_at: nowIso, status: "fait", completed_at: nowIso, completed_by: viewer.id, snoozed_until: null };
      } else if (body.action === "snooze") {
        const until = parseSnoozeDate((body as { until?: unknown }).until, today);
        if ("error" in until) return fail(400, until.error);
        patch = { snoozed_until: until.value, snoozed_at: nowIso };
      } else if (body.action === "settle") {
        patch = { settled_at: nowIso, settled_by: viewer.id, status: "fait", completed_at: nowIso, completed_by: viewer.id, [seenField]: nowIso };
      } else if (body.action === "seen") {
        patch = { [seenField]: nowIso };
      } else {
        const text = typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text.trim() : "";
        if (!text) return fail(400, "Écrivez votre message.");
        if (text.length > 1000) return fail(400, "Le message est trop long (1000 caractères au plus).");
        const { error: messageError } = await supabaseAdmin.from("staff_task_messages").insert({ task_id: id, author_id: viewer.id, body: text });
        if (messageError) {
          if (isMissingTable(messageError)) return fail(503, "Les réponses écrites ne sont pas encore installées (migration 092 à lancer).");
          return writeError(messageError, "demande message");
        }
        patch = { [seenField]: nowIso, ...(row.thread_started_at ? {} : { thread_started_at: nowIso, snoozed_until: null }) };
      }
      break;
    }
    default:
      return fail(400, "Action inconnue.");
  }

  const { error: updateError } = await supabaseAdmin.from("staff_tasks").update(patch).eq("id", id);
  if (updateError) {
    if (updateError.code === "42703" || updateError.code === "PGRST204") {
      return fail(503, "Cette réponse n’est pas encore installée (migration 092 à lancer).");
    }
    return writeError(updateError, body.action);
  }
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
  // A title change is a staff level change: same rules, Clerk and users row
  // kept in step, and a line in the access journal (lib/staff-team-server.ts).
  try {
    await setMemberLevel(
      { userId: viewer.id, fullName: viewer.fullName, level: "founder" },
      userId,
      STAFF_LEVEL_BY_TITLE[title],
      "Titre changé depuis L’équipe",
    );
  } catch (error) {
    if (error instanceof TeamError) return fail(error.status, error.message);
    throw error;
  }
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
  if (type === "request") {
    let query = supabaseAdmin
      .from("property_requests")
      .select("id, title, neighborhood, city, listing_type, status")
      .order("created_at", { ascending: false })
      .limit(15);
    if (term) query = query.or(`title.ilike.%${term}%,neighborhood.ilike.%${term}%,city.ilike.%${term}%`);
    const { data, error } = await query;
    if (error) return writeError(error, "links request");
    return {
      ok: true,
      value: (data ?? []).map((row) => ({
        id: row.id as string,
        label: row.title as string,
        sub: [row.listing_type === "vendre" ? "Achat" : "Location", row.neighborhood, row.city].filter(Boolean).join(" · "),
      })),
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
