// « Fin de journée »: the end-of-day report each staff member sends from Mon
// espace, and the absences they (or the Directeur / Fondateur) declare.
// Approved design: Salif, 2026-10-19 (council recommendation).
//
// Pure functions only (no imports with side effects), so the browser, the
// server and node:test share one source. Ouagadougou is UTC all year with no
// daylight saving, so the UTC getters give Ouagadougou time.

import type { StaffLevel } from "./core.ts";

// ---------------------------------------------------------------------------
// Time window
// ---------------------------------------------------------------------------

/** The form opens at 15:00 Ouagadougou. */
export const EOD_OPENS_AT = "15:00";
/** From 17:30 the card is highlighted (in-app reminder, no WhatsApp or SMS). */
export const EOD_DUE_AT = "17:30";

export type EodWindow = "closed" | "open" | "due";

function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** closed before 15:00, open from 15:00, due (highlighted) from 17:30, until midnight. */
export function eodWindow(now: Date): EodWindow {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minutes < minutesOf(EOD_OPENS_AT)) return "closed";
  if (minutes < minutesOf(EOD_DUE_AT)) return "open";
  return "due";
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** The Ouagadougou calendar date of an instant, YYYY-MM-DD (same as core.dayKey). */
export function ouagaDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function shiftDay(key: string, days: number) {
  return ouagaDay(new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * 86400000));
}

function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return ouagaDay(new Date(`${value}T00:00:00.000Z`)) === value;
}

// ---------------------------------------------------------------------------
// Absence categories
// ---------------------------------------------------------------------------

// Never ask for medical details: « Maladie » is enough.
export const ABSENCE_CATEGORIES = ["maladie", "urgence_familiale", "conge", "autre"] as const;
export type AbsenceCategory = (typeof ABSENCE_CATEGORIES)[number];

export const ABSENCE_LABELS: Record<AbsenceCategory, string> = {
  maladie: "Maladie",
  urgence_familiale: "Urgence familiale",
  conge: "Congé",
  autre: "Autre",
};

export function isAbsenceCategory(value: unknown): value is AbsenceCategory {
  return typeof value === "string" && (ABSENCE_CATEGORIES as readonly string[]).includes(value);
}

export const MEDICAL_HINT = "N’écrivez pas de détails médicaux.";
export const PRIVATE_NOTE_HINT = "Visible seulement par le Directeur et le Fondateur.";

// ---------------------------------------------------------------------------
// Rows and permissions
// ---------------------------------------------------------------------------

export type DayReportRow = {
  id: string;
  user_id: string;
  report_date: string;
  done_items: { title: string }[] | null;
  done_extra: string | null;
  /** « Mes actions pour demain »: each one became a staff task (task_id), 1 to 5 lines. */
  tomorrow_actions: { title: string; task_id: string | null }[] | null;
  /** « Ce qui n’a pas marché aujourd’hui ». */
  went_wrong: string | null;
  /** « Comment on pourrait faire mieux ». */
  improvement: string | null;
  absent: boolean;
  absence_category: AbsenceCategory | null;
  absence_note: string | null;
  declared_by: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportActor = { id: string; level: StaffLevel };

function leads(level: StaffLevel) {
  return level === "fondateur" || level === "directeur";
}

/** Conseiller(ère), Assistant(e) and Stagiaire read only their own report; Directeur and Fondateur read the team. */
export function canReadReport(viewer: ReportActor, row: Pick<DayReportRow, "user_id">): boolean {
  return row.user_id === viewer.id || leads(viewer.level);
}

/**
 * The private absence note is read by the Directeur and the Fondateur, and by
 * the person it is about only when they wrote it themselves. Nobody else ever
 * sees another person's note.
 */
export function canSeeAbsenceNote(viewer: ReportActor, row: Pick<DayReportRow, "user_id" | "declared_by">): boolean {
  if (leads(viewer.level)) return true;
  return row.user_id === viewer.id && (row.declared_by === null || row.declared_by === viewer.id);
}

/**
 * Who may declare an absence for someone else: the Directeur and the
 * Fondateur. Nobody declares an absence for the Fondateur but himself.
 */
export function canDeclareAbsence(actor: ReportActor, target: ReportActor): boolean {
  if (!leads(actor.level)) return false;
  if (target.level === "fondateur") return actor.id === target.id;
  return true;
}

// ---------------------------------------------------------------------------
// Status chip
// ---------------------------------------------------------------------------

export type ReportStatus = "sent" | "pending" | "absent";
export type ReportChip = { status: ReportStatus; label: string; tone: "green" | "amber" | "grey" };

/** « Compte rendu envoyé », « Pas encore envoyé » or « Absent (catégorie) ». An absence wins. */
export function reportChip(row: Pick<DayReportRow, "absent" | "absence_category" | "submitted_at"> | null): ReportChip {
  if (row?.absent) {
    const category = row.absence_category ? ABSENCE_LABELS[row.absence_category].toLowerCase() : "autre";
    return { status: "absent", label: `Absent (${category})`, tone: "grey" };
  }
  if (row?.submitted_at) return { status: "sent", label: "Compte rendu envoyé", tone: "green" };
  return { status: "pending", label: "Pas encore envoyé", tone: "amber" };
}

// ---------------------------------------------------------------------------
// What the browser receives
// ---------------------------------------------------------------------------

export type DayReportView = {
  id: string;
  userId: string;
  date: string;
  doneItems: string[];
  doneExtra: string | null;
  tomorrowActions: string[];
  wentWrong: string | null;
  improvement: string | null;
  absent: boolean;
  absenceCategory: AbsenceCategory | null;
  /** Null when the viewer may not read it (see canSeeAbsenceNote). */
  absenceNote: string | null;
  /** True when a note exists but is hidden from this viewer. */
  absenceNoteHidden: boolean;
  declaredById: string | null;
  declaredByName: string | null;
  /** Declared by someone else (Directeur or Fondateur). */
  declaredForThem: boolean;
  submittedAt: string | null;
  /** « 17:42 » in Ouagadougou. */
  submittedTime: string | null;
  chip: ReportChip;
};

/** The report as one viewer may see it. Returns null when the viewer may not read it at all. */
export function toReportView(
  viewer: ReportActor,
  row: DayReportRow,
  names: Map<string, { firstName: string }> = new Map(),
): DayReportView | null {
  if (!canReadReport(viewer, row)) return null;
  const noteVisible = canSeeAbsenceNote(viewer, row);
  const submitted = row.submitted_at ? new Date(row.submitted_at) : null;
  return {
    id: row.id,
    userId: row.user_id,
    date: row.report_date,
    doneItems: (row.done_items ?? []).map((item) => item.title).filter(Boolean),
    doneExtra: row.done_extra,
    tomorrowActions: (row.tomorrow_actions ?? []).map((action) => action.title).filter(Boolean),
    wentWrong: row.went_wrong,
    improvement: row.improvement,
    absent: row.absent,
    absenceCategory: row.absent ? row.absence_category : null,
    absenceNote: row.absent && noteVisible ? row.absence_note : null,
    absenceNoteHidden: row.absent && !noteVisible && !!row.absence_note,
    declaredById: row.declared_by,
    declaredByName: row.declared_by ? (names.get(row.declared_by)?.firstName ?? null) : null,
    declaredForThem: !!row.declared_by && row.declared_by !== row.user_id,
    submittedAt: row.submitted_at,
    submittedTime: submitted ? `${pad(submitted.getUTCHours())}:${pad(submitted.getUTCMinutes())}` : null,
    chip: reportChip(row),
  };
}

// ---------------------------------------------------------------------------
// Weekly summary (Monday to Friday counts toward x/5)
// ---------------------------------------------------------------------------

export const REPORT_DAYS_PER_WEEK = 5;

export type WeekReportSummary = {
  userId: string;
  /** Reports sent Monday to Friday (an absence day is not a sent report). */
  sent: number;
  expected: number;
  absences: Partial<Record<AbsenceCategory, number>>;
  absenceDays: number;
};

/** Monday of the week of `todayKey` (Sunday belongs to the next week, like the board). */
export function reportWeekStart(todayKey: string): string {
  const weekday = new Date(`${todayKey}T00:00:00.000Z`).getUTCDay();
  if (weekday === 0) return shiftDay(todayKey, 1);
  return shiftDay(todayKey, 1 - weekday);
}

/** Monday to Saturday keys of the report week. */
export function reportWeekDays(todayKey: string): string[] {
  const start = reportWeekStart(todayKey);
  return Array.from({ length: 6 }, (_, index) => shiftDay(start, index));
}

export function weekSummary(userIds: string[], rows: Pick<DayReportRow, "user_id" | "report_date" | "absent" | "absence_category" | "submitted_at">[], todayKey: string) {
  const days = reportWeekDays(todayKey);
  const weekdays = new Set(days.slice(0, REPORT_DAYS_PER_WEEK));
  const inWeek = new Set(days);
  const people: WeekReportSummary[] = userIds.map((userId) => {
    const mine = rows.filter((row) => row.user_id === userId && inWeek.has(row.report_date));
    const absences: Partial<Record<AbsenceCategory, number>> = {};
    let absenceDays = 0;
    for (const row of mine) {
      if (!row.absent) continue;
      absenceDays += 1;
      const category = row.absence_category ?? "autre";
      absences[category] = (absences[category] ?? 0) + 1;
    }
    return {
      userId,
      sent: mine.filter((row) => !row.absent && !!row.submitted_at && weekdays.has(row.report_date)).length,
      expected: REPORT_DAYS_PER_WEEK,
      absences,
      absenceDays,
    };
  });
  const totals: Record<AbsenceCategory, number> = { maladie: 0, urgence_familiale: 0, conge: 0, autre: 0 };
  for (const person of people) {
    for (const category of ABSENCE_CATEGORIES) totals[category] += person.absences[category] ?? 0;
  }
  return { weekStart: days[0], weekEnd: days[5], people, absencesByCategory: totals };
}

/** « 1 urgence familiale », « 2 maladies ». */
export function absenceCountLabel(category: AbsenceCategory, count: number): string {
  const label = ABSENCE_LABELS[category].toLowerCase();
  if (count <= 1) return `${count} ${label}`;
  const plural = { maladie: "maladies", urgence_familiale: "urgences familiales", conge: "congés", autre: "autres" }[category];
  return `${count} ${plural}`;
}

// ---------------------------------------------------------------------------
// Input checks shared by the API routes
// ---------------------------------------------------------------------------

export const LIMITS = { doneExtra: 1000, action: 200, actionsMax: 5, wentWrong: 600, improvement: 600, note: 500 } as const;

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

export const WENT_WRONG_HINT = "Un obstacle, une erreur, une perte de temps.";
export const IMPROVEMENT_HINT = "Une idée, même petite, pour que demain se passe mieux.";

export type DayReportInput = {
  doneExtra: string | null;
  /** 1 to 5 one-line actions (none required when absent). */
  tomorrowActions: string[];
  wentWrong: string | null;
  improvement: string | null;
  absent: boolean;
  absenceCategory: AbsenceCategory | null;
  absenceNote: string | null;
};

/** Cleans the « Mes actions pour demain » lines: one line each, blanks and repeats dropped. */
export function cleanActions(value: unknown): { error: string } | { value: string[] } {
  if (value == null) return { value: [] };
  if (!Array.isArray(value)) return { error: "Les actions pour demain ne sont pas valides." };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") return { error: "Les actions pour demain ne sont pas valides." };
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (line.length > LIMITS.action) return { error: `Une action est trop longue (${LIMITS.action} caractères au plus).` };
    const key = line.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  if (out.length > LIMITS.actionsMax) return { error: `${LIMITS.actionsMax} actions au plus pour demain.` };
  return { value: out };
}

/** The person's own report, for today only. Returns a French error or the clean input. */
export function parseDayReport(body: unknown): { error: string } | { value: DayReportInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  const doneExtra = optionalText(b.doneExtra, LIMITS.doneExtra);
  if (doneExtra === undefined) return { error: `Le travail en plus est trop long (${LIMITS.doneExtra} caractères au plus).` };
  const actions = cleanActions(b.tomorrowActions);
  if ("error" in actions) return actions;
  const wentWrong = optionalText(b.wentWrong, LIMITS.wentWrong);
  if (wentWrong === undefined) return { error: `« Ce qui n’a pas marché » est trop long (${LIMITS.wentWrong} caractères au plus).` };
  const improvement = optionalText(b.improvement, LIMITS.improvement);
  if (improvement === undefined) return { error: `« Comment faire mieux » est trop long (${LIMITS.improvement} caractères au plus).` };
  const absent = b.absent === true;
  const note = optionalText(b.absenceNote, LIMITS.note);
  if (note === undefined) return { error: `La note est trop longue (${LIMITS.note} caractères au plus).` };
  if (absent && !isAbsenceCategory(b.absenceCategory)) return { error: "Choisissez la raison de l’absence." };
  if (!absent && actions.value.length === 0) return { error: "Écrivez au moins une action pour demain." };
  return {
    value: {
      doneExtra,
      tomorrowActions: actions.value,
      wentWrong,
      improvement,
      absent,
      absenceCategory: absent ? (b.absenceCategory as AbsenceCategory) : null,
      absenceNote: absent ? note : null,
    },
  };
}

export type StoredAction = { title: string; task_id: string | null };

/**
 * Editing the report the same day must not duplicate tomorrow's tasks. Lines
 * already sent keep their task; new lines need a task; lines taken out lose
 * theirs (the server deletes it only while it is still « à faire »).
 */
export function planActions(next: string[], previous: StoredAction[] | null) {
  const before = new Map((previous ?? []).map((action) => [action.title.toLocaleLowerCase("fr"), action]));
  const keep: StoredAction[] = [];
  const create: string[] = [];
  for (const title of next) {
    const found = before.get(title.toLocaleLowerCase("fr"));
    if (found && found.task_id) {
      keep.push({ title, task_id: found.task_id });
      before.delete(title.toLocaleLowerCase("fr"));
    } else create.push(title);
  }
  const remove = [...before.values()].map((action) => action.task_id).filter((id): id is string => !!id);
  return { keep, create, remove };
}

/** Next working day (Sunday skipped), like « Demain » in the briefing. */
export function tomorrowKey(todayKey: string): string {
  const next = shiftDay(todayKey, 1);
  return new Date(`${next}T00:00:00.000Z`).getUTCDay() === 0 ? shiftDay(next, 1) : next;
}

export type AbsenceInput = {
  userId: string;
  date: string;
  category: AbsenceCategory;
  note: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Days a Directeur or Fondateur may declare: two weeks back (a forgotten call) to a month ahead (a planned leave). */
export const DECLARE_DAYS_BACK = 14;
export const DECLARE_DAYS_AHEAD = 31;

/** An absence declared by a Directeur or the Fondateur for someone. */
export function parseAbsence(body: unknown, todayKey: string): { error: string } | { value: AbsenceInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.userId !== "string" || !UUID.test(b.userId)) return { error: "Choisissez la personne absente." };
  if (!isDayKey(b.date)) return { error: "Choisissez le jour de l’absence." };
  if (b.date < shiftDay(todayKey, -DECLARE_DAYS_BACK)) return { error: "Deux semaines en arrière au plus." };
  if (b.date > shiftDay(todayKey, DECLARE_DAYS_AHEAD)) return { error: "Un mois à l’avance au plus." };
  if (!isAbsenceCategory(b.category)) return { error: "Choisissez la raison de l’absence." };
  const note = optionalText(b.note, LIMITS.note);
  if (note === undefined) return { error: `La note est trop longue (${LIMITS.note} caractères au plus).` };
  return { value: { userId: b.userId, date: b.date, category: b.category, note } };
}

/**
 * What a person's own submission writes (tomorrow_actions is filled by the
 * server once the tasks exist). When a Directeur or the Fondateur declared the
 * absence and the person keeps it, their hidden note and the name of who
 * declared it stay as they were.
 */
export function ownReportPatch(
  input: DayReportInput,
  existing: Pick<DayReportRow, "absent" | "absence_note" | "declared_by"> | null,
  viewerId: string,
  doneItems: { title: string }[],
  nowIso: string,
) {
  const keepDeclared = !!existing?.absent && input.absent && !!existing.declared_by && existing.declared_by !== viewerId;
  return {
    done_items: doneItems.slice(0, 60).map((item) => ({ title: item.title.slice(0, 200) })),
    done_extra: input.doneExtra,
    went_wrong: input.wentWrong,
    improvement: input.improvement,
    absent: input.absent,
    absence_category: input.absenceCategory,
    absence_note: keepDeclared ? (input.absenceNote ?? existing!.absence_note) : input.absenceNote,
    declared_by: input.absent ? (keepDeclared ? existing!.declared_by : viewerId) : null,
    submitted_at: nowIso,
  };
}

export type ImprovementIdea = { userId: string; date: string; text: string };

/** The week's « Comment on pourrait faire mieux », newest first, for Salif to read in one place. */
export function weekImprovements(
  rows: Pick<DayReportRow, "user_id" | "report_date" | "improvement">[],
  todayKey: string,
): ImprovementIdea[] {
  const days = new Set(reportWeekDays(todayKey));
  return rows
    .filter((row) => days.has(row.report_date) && !!row.improvement?.trim())
    .map((row) => ({ userId: row.user_id, date: row.report_date, text: row.improvement!.trim() }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
