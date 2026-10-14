// Dates for the staff briefing and team board. Ouagadougou (Africa/Ouagadougou)
// is UTC all year with no daylight saving, so every computation here uses the
// UTC getters: a "day key" is the Ouagadougou calendar date, YYYY-MM-DD.
//
// The working week runs Monday to Saturday. On Sunday the week that just
// ended is already bundled, so Sunday belongs to the week that starts the
// next morning.

export const OUAGA_TIME_ZONE = "Africa/Ouagadougou";

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WEEKDAYS_SHORT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** The Ouagadougou calendar date of an instant, as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Midnight (Ouagadougou) of a day key. */
export function dayStart(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(key: string, days: number): string {
  return dayKey(new Date(dayStart(key).getTime() + days * DAY_MS));
}

/** HH:MM of an instant in Ouagadougou. */
export function timeOf(date: Date): string {
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Accepts "HH:MM" or "HH:MM:SS" (Postgres TIME) and returns "HH:MM", or null. */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayKey(dayStart(value)) === value;
}

/** Monday of the Monday-to-Saturday week a day belongs to (Sunday → next Monday). */
export function weekStartKey(key: string): string {
  const weekday = dayStart(key).getUTCDay(); // 0 = Sunday
  if (weekday === 0) return addDays(key, 1);
  return addDays(key, 1 - weekday);
}

export type WeekBounds = {
  /** Monday, YYYY-MM-DD. */
  startKey: string;
  /** Saturday, YYYY-MM-DD. */
  endKey: string;
  /** Monday to Saturday. */
  days: string[];
  /** Monday 00:00. */
  start: Date;
  /** Sunday 00:00, exclusive end (so Saturday 23:59:59 is inside). */
  endExclusive: Date;
};

export function weekBounds(key: string): WeekBounds {
  const startKey = weekStartKey(key);
  const days = Array.from({ length: 6 }, (_, index) => addDays(startKey, index));
  return {
    startKey,
    endKey: days[5],
    days,
    start: dayStart(startKey),
    endExclusive: dayStart(addDays(startKey, 6)),
  };
}

/** "mercredi 14 octobre" */
export function longDayLabel(key: string): string {
  const date = dayStart(key);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "mer 14" */
export function shortDayLabel(key: string): string {
  const date = dayStart(key);
  return `${WEEKDAYS_SHORT[date.getUTCDay()]} ${date.getUTCDate()}`;
}

/** "jeudi 15" */
export function weekdayAndDate(key: string): string {
  const date = dayStart(key);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}`;
}

/** "du 5 au 10 octobre", "du 28 septembre au 3 octobre", "du 29 décembre 2025 au 3 janvier 2026" */
export function rangeLabel(startKey: string, endKey: string): string {
  const a = dayStart(startKey);
  const b = dayStart(endKey);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  const left = sameMonth
    ? `${a.getUTCDate()}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}${sameYear ? "" : ` ${a.getUTCFullYear()}`}`;
  const right = `${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}${sameYear ? "" : ` ${b.getUTCFullYear()}`}`;
  return `du ${left} au ${right}`;
}

/** "Semaine du 5 au 10 octobre" for the week containing the key. */
export function weekLabel(key: string): string {
  const week = weekBounds(key);
  return `Semaine ${rangeLabel(week.startKey, week.endKey)}`;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
// Code had only two staff levels (Clerk userType "staff" and "founder"). The
// vault-approved titles (2026-10-11) add Directeur, Assistant, Conseillère and
// Stagiaire. Fondateur stays the Clerk userType; the other titles live in the
// staff_titles table (migration 089). No row means Conseillère.

export const STAFF_TITLES = ["directeur", "assistant", "conseillere", "stagiaire"] as const;
export type StaffTitle = (typeof STAFF_TITLES)[number];
export type StaffLevel = "fondateur" | StaffTitle;
export const DEFAULT_STAFF_TITLE: StaffTitle = "conseillere";

export const LEVEL_LABELS: Record<StaffLevel, string> = {
  fondateur: "Fondateur",
  directeur: "Directeur",
  assistant: "Assistant commercial",
  conseillere: "Conseillère",
  stagiaire: "Stagiaire",
};

export function isStaffTitle(value: unknown): value is StaffTitle {
  return typeof value === "string" && (STAFF_TITLES as readonly string[]).includes(value);
}

export function levelFor(userType: string | null | undefined, title: string | null | undefined): StaffLevel {
  if ((userType ?? "").toLowerCase() === "founder") return "fondateur";
  return isStaffTitle(title) ? title : DEFAULT_STAFF_TITLE;
}

export function isDirectorOrFounder(level: StaffLevel | null | undefined): boolean {
  return level === "fondateur" || level === "directeur";
}

export type Actor = { id: string; level: StaffLevel };

/**
 * What kind of task `actor` may give `target`, or null when not allowed.
 * Everyone may add a task for themselves. Directeur and Fondateur may give a
 * task to anyone, except that a Directeur reaches the founder only through a
 * demande. Nobody else can ever give the founder anything.
 */
export function assignmentKind(actor: Actor, target: Actor): "manuel" | "demande" | null {
  if (actor.id === target.id) return "manuel";
  if (target.level === "fondateur") {
    if (actor.level === "fondateur") return "manuel";
    if (actor.level === "directeur") return "demande";
    return null;
  }
  return isDirectorOrFounder(actor.level) ? "manuel" : null;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type TaskStatus = "a_faire" | "fait" | "reportee";
export type TaskOrigin = "manuel" | "demande" | "auto";
export type TaskTone = "blue" | "orange" | "grey" | "red" | "dark" | "green";
/** at = at a set time, before = "avant HH:MM", asap = as soon as possible, day = some time that day. */
export type TimeMode = "at" | "before" | "asap" | "day";

export type BriefingItem = {
  /** Stable key: "task:<uuid>" for a stored task, else the source key. */
  key: string;
  origin: TaskOrigin;
  taskId: string | null;
  sourceKey: string | null;
  kindLabel: string;
  tone: TaskTone;
  title: string;
  sub: string;
  ownerId: string | null;
  fromId: string | null;
  fromName: string | null;
  dueDate: string;
  dueTime: string | null;
  timeMode: TimeMode;
  status: TaskStatus;
  completedAt: string | null;
  href: string | null;
  actionLabel: string;
  /** True when ticking it is recorded here (manual tasks, and automatic items without their own status). */
  canCheck: boolean;
  note: string | null;
  propertyId: string | null;
  visitRequestId: string | null;
  studioProjectId: string | null;
};

export type StaffTaskRow = {
  id: string;
  owner_id: string;
  created_by: string | null;
  kind: TaskOrigin;
  title: string;
  note: string | null;
  due_date: string;
  due_time: string | null;
  status: TaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  property_id: string | null;
  visit_request_id: string | null;
  studio_project_id: string | null;
  source_key: string | null;
  source_href: string | null;
  reason: string | null;
  reply_text: string | null;
  replied_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isOpen(item: Pick<BriefingItem, "status">) {
  return item.status !== "fait";
}

/** Due before now and not done. A task without a time is late the day after. */
export function isLate(item: Pick<BriefingItem, "status" | "dueDate" | "dueTime" | "timeMode">, now: Date): boolean {
  if (!isOpen(item)) return false;
  const today = dayKey(now);
  if (item.dueDate < today) return true;
  if (item.dueDate > today) return false;
  if ((item.timeMode === "at" || item.timeMode === "before") && item.dueTime) {
    return timeOf(now) > item.dueTime;
  }
  return false;
}

function sortMinutes(item: Pick<BriefingItem, "timeMode" | "dueTime">) {
  if (item.timeMode === "asap") return -1;
  if (item.dueTime) {
    const [h, m] = item.dueTime.split(":").map(Number);
    return h * 60 + m;
  }
  return 24 * 60;
}

export function compareItems(a: BriefingItem, b: BriefingItem) {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  const diff = sortMinutes(a) - sortMinutes(b);
  if (diff) return diff;
  return a.title.localeCompare(b.title, "fr");
}

function timePart(item: Pick<BriefingItem, "timeMode" | "dueTime">) {
  if (!item.dueTime) return "";
  return item.timeMode === "before" ? `avant ${item.dueTime}` : item.dueTime;
}

/** Short "when" shown next to a task: "10:00", "Avant 18:00", "Hier 16:00", "Jeu 15 10:00", "Reportée · lun 5". */
export function whenLabel(item: BriefingItem, now: Date): string {
  const today = dayKey(now);
  const time = timePart(item);
  let label: string;
  if (item.dueDate === today) {
    if (time) label = capitalize(time);
    else label = item.timeMode === "asap" ? "Dès que possible" : "Aujourd’hui";
  } else if (item.dueDate === addDays(today, -1)) {
    label = time ? `Hier ${time}` : "Hier";
  } else if (item.dueDate === addDays(today, 1)) {
    label = time ? `Demain ${time}` : "Demain";
  } else if (isOpen(item) && item.dueDate < weekBounds(today).startKey) {
    return `Reportée · ${shortDayLabel(item.dueDate)}`;
  } else {
    label = capitalize(shortDayLabel(item.dueDate)) + (time ? ` ${time}` : "");
  }
  return item.status === "reportee" ? `${label} · reportée` : label;
}

/** "hier 16:00", "lun 12", "aujourd’hui 09:00": the lowercase form used after "En retard ·". */
export function lateLabel(item: BriefingItem, now: Date): string {
  const today = dayKey(now);
  const time = item.dueTime ? ` ${item.dueTime}` : "";
  if (item.dueDate === today) return `aujourd’hui${time}`;
  if (item.dueDate === addDays(today, -1)) return `hier${time}`;
  return `${shortDayLabel(item.dueDate)}${time}`;
}

/** "Pour aujourd’hui", "Pour demain", "Pour vendredi", "Pour le 21 octobre". */
export function askDueLabel(dueDate: string, now: Date): string {
  const today = dayKey(now);
  if (dueDate <= today) return "Pour aujourd’hui";
  if (dueDate === addDays(today, 1)) return "Pour demain";
  if (dueDate <= weekBounds(today).endKey) return `Pour ${longDayLabel(dueDate).split(" ")[0]}`;
  const [, , day] = dueDate.split("-");
  return `Pour le ${Number(day)} ${longDayLabel(dueDate).split(" ")[2]}`;
}

/** Where the work linked to a manual task is done. */
export function linkHref(row: Pick<StaffTaskRow, "source_href" | "visit_request_id" | "property_id" | "studio_project_id">): string | null {
  if (row.source_href && row.source_href.startsWith("/admin")) return row.source_href;
  if (row.visit_request_id) return "/admin/demandes-de-visite";
  if (row.property_id) return `/admin/annonces/${row.property_id}`;
  if (row.studio_project_id) return "/admin/studio";
  return null;
}

function linkActionLabel(row: Pick<StaffTaskRow, "visit_request_id" | "property_id" | "studio_project_id" | "source_href">) {
  if (row.visit_request_id) return "Ouvrir la visite";
  if (row.property_id) return "Ouvrir l’annonce";
  if (row.studio_project_id) return "Ouvrir le Studio";
  return "Ouvrir";
}

export type PersonNames = Map<string, { firstName: string }>;

/** A stored task as a briefing item. Pending or answered demandes are not tasks yet and return null. */
export function rowToItem(row: StaffTaskRow, names: PersonNames): BriefingItem | null {
  if (row.kind === "demande" && !row.accepted_at) return null;
  const time = normalizeTime(row.due_time);
  const fromId = row.created_by && row.created_by !== row.owner_id ? row.created_by : null;
  const href = linkHref(row);
  return {
    key: `task:${row.id}`,
    origin: row.kind,
    taskId: row.id,
    sourceKey: row.source_key,
    kindLabel: row.kind === "demande" ? "Demande" : row.kind === "auto" ? "Fait" : "Tâche",
    tone: row.kind === "demande" ? "dark" : "grey",
    title: row.title,
    sub: row.kind === "demande" ? (row.reason ?? "") : (row.note ?? ""),
    ownerId: row.owner_id,
    fromId,
    fromName: fromId ? (names.get(fromId)?.firstName ?? null) : null,
    dueDate: row.due_date,
    dueTime: time,
    timeMode: time ? (row.kind === "auto" ? "at" : "before") : "day",
    status: row.status,
    completedAt: row.completed_at,
    href,
    actionLabel: href ? linkActionLabel(row) : "Commencer",
    canCheck: true,
    note: row.note,
    propertyId: row.property_id,
    visitRequestId: row.visit_request_id,
    studioProjectId: row.studio_project_id,
  };
}

/**
 * Automatic items stand for themselves until a stored task carries their
 * source key (someone was given the item, or ticked it). Then the stored task
 * is shown instead.
 */
export function mergeItems(stored: BriefingItem[], auto: BriefingItem[]): BriefingItem[] {
  const taken = new Set(stored.map((item) => item.sourceKey).filter(Boolean));
  return [...stored, ...auto.filter((item) => !item.sourceKey || !taken.has(item.sourceKey))];
}

// ---------------------------------------------------------------------------
// Briefing (one person, one day)
// ---------------------------------------------------------------------------

export type DaySummary = { key: string; label: string; total: number; done: number; isToday: boolean };

export type BriefingParts = {
  todayKey: string;
  late: BriefingItem[];
  next: BriefingItem | null;
  rest: BriefingItem[];
  tomorrowKey: string;
  tomorrow: BriefingItem[];
  total: number;
  done: number;
  open: number;
  week: DaySummary[];
};

function nextWorkingDay(key: string) {
  const next = addDays(key, 1);
  return dayStart(next).getUTCDay() === 0 ? addDays(next, 1) : next;
}

function completedDay(item: BriefingItem) {
  return item.completedAt ? dayKey(new Date(item.completedAt)) : null;
}

export function buildBriefing(items: BriefingItem[], now: Date): BriefingParts {
  const todayKey = dayKey(now);
  const sorted = [...items].sort(compareItems);
  const late = sorted.filter((item) => isLate(item, now));
  const lateKeys = new Set(late.map((item) => item.key));
  const today = sorted.filter((item) => {
    if (lateKeys.has(item.key)) return false;
    if (isOpen(item)) return item.dueDate === todayKey;
    return completedDay(item) === todayKey || item.dueDate === todayKey;
  });
  const next = today.find((item) => isOpen(item)) ?? null;
  const rest = today.filter((item) => item !== next);
  const tomorrowKey = nextWorkingDay(todayKey);
  const tomorrow = sorted.filter((item) => isOpen(item) && item.dueDate === tomorrowKey);
  const total = late.length + today.length;
  const done = today.filter((item) => !isOpen(item)).length;
  const week = weekBounds(todayKey).days.map((key) => {
    const ofDay = sorted.filter((item) =>
      isOpen(item) ? item.dueDate === key : (completedDay(item) ?? item.dueDate) === key,
    );
    return {
      key,
      label: shortDayLabel(key),
      total: ofDay.length,
      done: ofDay.filter((item) => !isOpen(item)).length,
      isToday: key === todayKey,
    };
  });
  return { todayKey, late, next, rest, tomorrowKey, tomorrow, total, done, open: total - done, week };
}

function lowerFirst(value: string) {
  if (value.length > 1 && value[1] === value[1].toUpperCase() && /[A-Z]/.test(value[1])) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function atPhrase(item: BriefingItem) {
  if (!item.dueTime) return "";
  return item.timeMode === "before" ? ` avant ${item.dueTime}` : ` à ${item.dueTime}`;
}

/** The one-sentence briefing under "Bonjour". */
export function briefingSentence(parts: Pick<BriefingParts, "late" | "next" | "total" | "open">): string {
  if (parts.total === 0) return "Rien de prévu pour aujourd’hui. Ajoutez une tâche si vous en avez une.";
  if (parts.open === 0) return "Tout est fait pour aujourd’hui. Bravo, et merci.";
  const count = `${parts.open} ${parts.open > 1 ? "tâches" : "tâche"} aujourd’hui`;
  const lateCount = parts.late.length;
  if (lateCount) {
    const head = `${count}, dont ${lateCount} en retard.`;
    const then = parts.next ? `, puis ${lowerFirst(parts.next.title)}${atPhrase(parts.next)}` : "";
    return `${head} Commencez par ${lateCount > 1 ? "les tâches" : "la tâche"} en retard${then}.`;
  }
  if (!parts.next) return `${count}.`;
  return `${count}. Prochaine : ${lowerFirst(parts.next.title)}${atPhrase(parts.next)}.`;
}

// ---------------------------------------------------------------------------
// Team board (week, Monday to Saturday)
// ---------------------------------------------------------------------------

export type Person = {
  id: string;
  fullName: string;
  firstName: string;
  initials: string;
  level: StaffLevel;
  levelLabel: string;
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : (parts[0][1] ?? "");
  return (first + last).toUpperCase();
}

const LEVEL_ORDER: Record<StaffLevel, number> = {
  fondateur: 0, directeur: 1, assistant: 2, conseillere: 2, stagiaire: 3,
};

/** Founder first, then Directeur, then everyone else by first name. */
export function orderPeople<T extends Pick<Person, "level" | "firstName">>(people: T[]): T[] {
  return [...people].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.firstName.localeCompare(b.firstName, "fr"),
  );
}

export type BoardOpenItem = BriefingItem & { when: string; late: boolean; current: boolean };
export type DoneDay = { key: string; label: string; items: { key: string; title: string }[] };
export type ColumnFlag = { label: string; tone: "red" | "amber" | "green" };

export type BoardColumn = {
  person: Person | null;
  todayDone: number;
  todayTotal: number;
  weekDone: number;
  open: BoardOpenItem[];
  doneDays: DoneDay[];
  flag: ColumnFlag | null;
};

function inWeek(iso: string | null, week: WeekBounds) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= week.start.getTime() && t < week.endExclusive.getTime();
}

export function buildColumn(person: Person | null, items: BriefingItem[], now: Date, pendingAsks = 0): BoardColumn {
  const todayKey = dayKey(now);
  const week = weekBounds(todayKey);
  const parts = buildBriefing(items, now);
  const open = items
    .filter((item) => isOpen(item) && item.dueDate <= week.endKey)
    .sort(compareItems)
    .map((item) => ({
      ...item,
      when: whenLabel(item, now),
      late: isLate(item, now),
      current: parts.next?.key === item.key,
    }));
  const doneThisWeek = items
    .filter((item) => !isOpen(item) && inWeek(item.completedAt, week))
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));
  const byDay = new Map<string, DoneDay>();
  for (const item of doneThisWeek) {
    const key = dayKey(new Date(item.completedAt!));
    if (!byDay.has(key)) byDay.set(key, { key, label: capitalize(shortDayLabel(key)), items: [] });
    byDay.get(key)!.items.push({ key: item.key, title: item.title });
  }
  const lateCount = open.filter((item) => item.late).length;
  let flag: ColumnFlag | null = null;
  if (!person) flag = open.length ? { label: String(open.length), tone: "amber" } : null;
  else if (pendingAsks) flag = { label: `${pendingAsks} ${pendingAsks > 1 ? "demandes" : "demande"}`, tone: "amber" };
  else if (lateCount) flag = { label: `${lateCount} en retard`, tone: "red" };
  else if (parts.total > 0 && parts.open === 0) flag = { label: "À jour", tone: "green" };
  return {
    person,
    todayDone: parts.done,
    todayTotal: parts.total,
    weekDone: doneThisWeek.length,
    open,
    doneDays: [...byDay.values()],
    flag,
  };
}

export type PastWeek = {
  id: string;
  label: string;
  total: number;
  people: { personId: string; name: string; count: number; items: string[] }[];
};

/**
 * Completed work from before the current week, bundled by the week of its
 * completion time. No cron: the bundles are computed when the board is read,
 * so a week becomes a bundle at Saturday 23:59 Ouagadougou on its own.
 */
export function bundlePastWeeks(
  doneItems: BriefingItem[],
  people: Pick<Person, "id" | "firstName" | "level">[],
  now: Date,
  maxItemsPerPerson = 8,
): PastWeek[] {
  const currentStart = weekBounds(dayKey(now)).start.getTime();
  const order = orderPeople(people);
  const names = new Map(order.map((p) => [p.id, p.firstName]));
  const weeks = new Map<string, Map<string, BriefingItem[]>>();
  for (const item of doneItems) {
    if (isOpen(item) || !item.completedAt || !item.ownerId) continue;
    if (new Date(item.completedAt).getTime() >= currentStart) continue;
    const id = weekStartKey(dayKey(new Date(item.completedAt)));
    if (!weeks.has(id)) weeks.set(id, new Map());
    const byPerson = weeks.get(id)!;
    if (!byPerson.has(item.ownerId)) byPerson.set(item.ownerId, []);
    byPerson.get(item.ownerId)!.push(item);
  }
  const rank = new Map(order.map((p, index) => [p.id, index]));
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([id, byPerson]) => {
      const list = [...byPerson.entries()]
        .sort(([a], [b]) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99))
        .map(([personId, done]) => ({
          personId,
          name: names.get(personId) ?? "Ancien membre",
          count: done.length,
          items: done
            .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
            .slice(0, maxItemsPerPerson)
            .map((item) => item.title),
        }));
      return {
        id,
        label: weekLabel(id),
        total: list.reduce((sum, p) => sum + p.count, 0),
        people: list,
      };
    });
}

// ---------------------------------------------------------------------------
// Demandes (asks from a Directeur to the founder)
// ---------------------------------------------------------------------------

export type DemandeState = "pending" | "accepted" | "replied" | "done";

export type DemandeView = {
  id: string;
  title: string;
  reason: string;
  when: string;
  fromId: string | null;
  fromName: string | null;
  toName: string | null;
  state: DemandeState;
  replyText: string | null;
  createdAt: string;
};

export function demandeState(row: Pick<StaffTaskRow, "status" | "accepted_at" | "replied_at">): DemandeState {
  if (row.status === "fait") return "done";
  if (row.accepted_at) return "accepted";
  if (row.replied_at) return "replied";
  return "pending";
}

export function toDemandeView(row: StaffTaskRow, names: PersonNames, now: Date): DemandeView {
  return {
    id: row.id,
    title: row.title,
    reason: row.reason ?? "",
    when: askDueLabel(row.due_date, now),
    fromId: row.created_by,
    fromName: row.created_by ? (names.get(row.created_by)?.firstName ?? null) : null,
    toName: names.get(row.owner_id)?.firstName ?? null,
    state: demandeState(row),
    replyText: row.reply_text,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Input checks shared by the API routes
// ---------------------------------------------------------------------------

export type NewTaskInput = {
  ownerId: string;
  title: string;
  dueDate: string;
  dueTime: string | null;
  note: string | null;
  reason: string | null;
  propertyId: string | null;
  visitRequestId: string | null;
  studioProjectId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

function optionalUuid(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  return isUuid(value) ? value : undefined;
}

/** Validates the body of a new task. Returns a French error message or the clean input. */
export function parseNewTask(body: unknown, today: string): { error: string } | { value: NewTaskInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(b.ownerId)) return { error: "Choisissez pour qui est la tâche." };
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { error: "Écrivez ce qu’il faut faire." };
  if (title.length > 200) return { error: "Le titre est trop long (200 caractères au plus)." };
  if (!isDayKey(b.dueDate)) return { error: "Choisissez une date." };
  if (b.dueDate < addDays(today, -1)) return { error: "La date est déjà passée." };
  const rawTime = b.dueTime == null || b.dueTime === "" ? null : normalizeTime(String(b.dueTime));
  if (b.dueTime != null && b.dueTime !== "" && !rawTime) return { error: "L’heure doit avoir la forme HH:MM." };
  const note = optionalText(b.note, 2000);
  if (note === undefined) return { error: "La note est trop longue (2000 caractères au plus)." };
  const reason = optionalText(b.reason, 2000);
  if (reason === undefined) return { error: "Le pourquoi est trop long (2000 caractères au plus)." };
  const propertyId = optionalUuid(b.propertyId);
  const visitRequestId = optionalUuid(b.visitRequestId);
  const studioProjectId = optionalUuid(b.studioProjectId);
  if (propertyId === undefined || visitRequestId === undefined || studioProjectId === undefined) {
    return { error: "Le lien choisi n’est pas valide." };
  }
  return {
    value: {
      ownerId: b.ownerId,
      title,
      dueDate: b.dueDate,
      dueTime: rawTime,
      note,
      reason,
      propertyId,
      visitRequestId,
      studioProjectId,
    },
  };
}
