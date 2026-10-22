// Studio > Réseaux: the team's reply deadline (rule set by Salif on 2026-10-21).
//
// Every comment and direct message « À répondre » gets an answer within 24
// BUSINESS hours. The clock runs all 24 hours of a working day and pauses on
// the other days. Working days are Monday to Friday, Ouagadougou time, which
// is UTC all year (no daylight saving), so every computation here is in UTC.
//
//   received Tuesday 10:00  -> due Wednesday 10:00
//   received Friday 18:00   -> due Monday 18:00
//   received Saturday 15:00 -> due Tuesday 00:00 (the clock starts Monday 00:00)
//
// This is the team's deadline. It is separate from Meta's messaging window
// (lib/social/inbox.ts messagingWindow: whether Meta still lets the Page
// answer a direct message), which runs on wall-clock time.
//
// No runtime imports, so node:test loads this file directly (sla.test.mjs).

/** Working days, as Date.getUTCDay() numbers (0 = Sunday). Add 6 to count Saturday. */
export const BUSINESS_DAYS: readonly number[] = [1, 2, 3, 4, 5];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The reply deadline, in business time. */
export const REPLY_SLA_MS = 24 * HOUR_MS;

function toMs(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : new Date(value).getTime();
}

function dayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function isBusinessDay(ms: number, days: readonly number[]): boolean {
  return days.includes(new Date(ms).getUTCDay());
}

/**
 * The instant when `businessMs` of business time have run from `start`. When
 * the start falls on a day off, the clock starts at the next working day's
 * 00:00. A deadline that lands exactly at the end of a working day is that
 * midnight (Friday 24:00 shows as « sam. 00:00 »), never pushed to Monday.
 */
export function addBusinessMs(start: Date | string | number, businessMs: number, days: readonly number[] = BUSINESS_DAYS): Date {
  let cursor = toMs(start);
  if (!Number.isFinite(cursor)) return new Date(NaN);
  if (!days.length) return new Date(NaN);
  let left = Math.max(0, businessMs);
  // Bounded: at most 7 empty days between two working days.
  for (;;) {
    if (!isBusinessDay(cursor, days)) {
      cursor = dayStart(cursor) + DAY_MS;
      continue;
    }
    const end = dayStart(cursor) + DAY_MS;
    if (left <= end - cursor) return new Date(cursor + left);
    left -= end - cursor;
    cursor = end;
  }
}

/** The reply deadline: 24 business hours after `receivedAt`. */
export function replyDueAt(receivedAt: Date | string | number, days: readonly number[] = BUSINESS_DAYS): Date {
  return addBusinessMs(receivedAt, REPLY_SLA_MS, days);
}

/** Business time between a and b, in milliseconds (0 when b is not after a). */
export function businessMsBetween(a: Date | string | number, b: Date | string | number, days: readonly number[] = BUSINESS_DAYS): number {
  const from = toMs(a);
  const to = toMs(b);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  let total = 0;
  // Whole weeks first, then the remaining days one by one.
  const weeks = Math.floor((to - from) / (7 * DAY_MS));
  let cursor = from;
  if (weeks > 0) {
    total += weeks * days.length * DAY_MS;
    cursor += weeks * 7 * DAY_MS;
  }
  while (cursor < to) {
    const end = Math.min(dayStart(cursor) + DAY_MS, to);
    if (isBusinessDay(cursor, days)) total += end - cursor;
    cursor = end;
  }
  return total;
}

/** Business hours between a and b (fractional). */
export function businessHoursBetween(a: Date | string | number, b: Date | string | number, days: readonly number[] = BUSINESS_DAYS): number {
  return businessMsBetween(a, b, days) / HOUR_MS;
}

// --- One item ---------------------------------------------------------------------

export type SlaItem = {
  kind: "comment" | "message";
  status: "a_repondre" | "repondu" | "ignore";
  /** Comment: when it was written. Message: the conversation's last activity. */
  at: string;
  /** Message: the person's last message. */
  lastUserMessageAt?: string | null;
};

/**
 * Overdue: `lateMs` is BUSINESS time since the deadline, so a reply late on
 * Friday evening does not grow over the weekend. On time: `remainingMs` is
 * business time left.
 */
export type SlaState =
  | { startAt: string; dueAt: string; overdue: false; remainingMs: number }
  | { startAt: string; dueAt: string; overdue: true; lateMs: number };

/** When the deadline starts: the comment time, or the person's last message. */
export function slaStart(item: Pick<SlaItem, "kind" | "at" | "lastUserMessageAt">): string | null {
  const start = item.kind === "message" ? item.lastUserMessageAt || item.at : item.at;
  return start && Number.isFinite(new Date(start).getTime()) ? start : null;
}

/** The deadline for an item « À répondre ». Répondu and Ignoré have none (null). */
export function slaState(item: SlaItem, now: Date | number, days: readonly number[] = BUSINESS_DAYS): SlaState | null {
  if (item.status !== "a_repondre") return null;
  const start = slaStart(item);
  if (!start) return null;
  const due = replyDueAt(start, days);
  const dueMs = due.getTime();
  if (!Number.isFinite(dueMs)) return null;
  const nowMs = toMs(now);
  const startAt = new Date(start).toISOString();
  const dueAt = due.toISOString();
  // Answering at exactly 24 business hours is on time.
  if (nowMs > dueMs) return { startAt, dueAt, overdue: true, lateMs: businessMsBetween(dueMs, nowMs, days) };
  return { startAt, dueAt, overdue: false, remainingMs: businessMsBetween(nowMs, dueMs, days) };
}

/** Overdue first (most late first), then the nearest deadline. Items without a deadline last. */
export function compareSla(a: SlaState | null, b: SlaState | null): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.overdue && b.overdue && a.lateMs !== b.lateMs) return b.lateMs - a.lateMs;
  return a.dueAt.localeCompare(b.dueAt);
}

// --- Labels (Ouagadougou time = UTC) -----------------------------------------------

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** « lun. 18:00 » in Ouagadougou time. */
export function shortWeekdayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${WEEKDAYS[d.getUTCDay()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * The chip on a card « À répondre »: « À répondre avant lun. 18:00 », or when
 * late « En retard de 3 h » / « En retard de 2 j ». The late count is in
 * business time (hours, then whole 24-hour business days): the weekend does
 * not add to it.
 */
export function slaLabel(state: SlaState): string {
  if (!state.overdue) return `À répondre avant ${shortWeekdayTime(state.dueAt)}`;
  return `En retard de ${lateAmount(state.lateMs)}`;
}

function lateAmount(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

/** A business duration for the summary: « 45 min », « 3 h 20 », « 1 j 2 h ». */
export function businessDurationLabel(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (hours < 24) return rest ? `${hours} h ${pad(rest)}` : `${hours} h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d} j ${h} h` : `${d} j`;
}

// --- Response time ---------------------------------------------------------------------

/** Monday 00:00 (Ouagadougou) of the week that contains `now`. */
export function weekStart(now: Date | number): Date {
  const ms = toMs(now);
  const start = dayStart(ms);
  const day = new Date(start).getUTCDay();
  return new Date(start - ((day + 6) % 7) * DAY_MS);
}

/**
 * One row of social_inbox_items, as needed here. Migration 101 keeps only the
 * LAST reply of an item (replied_by, replied_at): earlier rounds of a
 * conversation that was reopened by a new message cannot be measured.
 */
export type ResponseRow = {
  kind: "comment" | "message";
  status: "a_repondre" | "repondu" | "ignore";
  at: string;
  lastUserMessageAt: string | null;
  repliedAt: string | null;
  repliedById: string | null;
  repliedByName: string | null;
  repliedExternally: boolean;
  statusChangedAt: string | null;
};

export type StaffResponseStats = {
  staffId: string;
  name: string;
  replies: number;
  medianMs: number;
  maxMs: number;
  late: number;
};

export type ResponseSummary = {
  weekStart: string;
  /** Replies measured this week (from Roogo or « Marquer comme répondu »). */
  measured: number;
  onTime: number;
  /** onTime / measured, rounded; null when nothing was measured. */
  onTimePct: number | null;
  staff: StaffResponseStats[];
  /** Answered directly in the Meta apps this week: no reply time, no person. */
  external: number;
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * « Délai de réponse » for the current week: items marked « Répondu » by a
 * staff member whose reply time falls between Monday 00:00 and now. The delay
 * is business time from the start of the deadline (comment time or the
 * person's last message) to replied_at.
 */
export function responseSummary(rows: ResponseRow[], now: Date | number, days: readonly number[] = BUSINESS_DAYS): ResponseSummary {
  const from = weekStart(now).getTime();
  const to = toMs(now);
  const inWeek = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= from && t <= to;
  };
  const byStaff = new Map<string, { name: string; delays: number[] }>();
  let external = 0;
  for (const row of rows) {
    if (row.status !== "repondu") continue;
    if (!row.repliedById) {
      if (row.repliedExternally && inWeek(row.statusChangedAt)) external += 1;
      continue;
    }
    if (!inWeek(row.repliedAt)) continue;
    const start = slaStart(row);
    if (!start) continue;
    const startMs = new Date(start).getTime();
    const repliedMs = new Date(row.repliedAt as string).getTime();
    // A new message after the reply: this round is not answered yet, skip it.
    if (startMs > repliedMs) continue;
    const entry = byStaff.get(row.repliedById) ?? { name: row.repliedByName ?? "Sans nom", delays: [] };
    entry.delays.push(businessMsBetween(startMs, repliedMs, days));
    byStaff.set(row.repliedById, entry);
  }
  const staff: StaffResponseStats[] = [...byStaff.entries()]
    .map(([staffId, { name, delays }]) => ({
      staffId,
      name,
      replies: delays.length,
      medianMs: median(delays),
      maxMs: Math.max(...delays),
      late: delays.filter((d) => d > REPLY_SLA_MS).length,
    }))
    .sort((a, b) => b.replies - a.replies || a.name.localeCompare(b.name, "fr"));
  const measured = staff.reduce((n, s) => n + s.replies, 0);
  const onTime = measured - staff.reduce((n, s) => n + s.late, 0);
  return {
    weekStart: new Date(from).toISOString(),
    measured,
    onTime,
    onTimePct: measured ? Math.round((onTime / measured) * 100) : null,
    staff,
    external,
  };
}
