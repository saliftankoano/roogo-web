// Server side of « Fin de journée » (migration 099): the person's own report
// from Mon espace, absences declared by the Directeur or the Fondateur, and
// the team view on L'équipe. Every read and write uses the service role, like
// the staff tasks; who may read or write what is checked here with the pure
// helpers of ./day-reports.ts, never trusted from the browser.
//
// Before migration 099 runs, reads come back with ready: false and writes
// answer 503 with a French message, so merging before the migration is safe.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { capitalize, dayKey, isDirectorOrFounder, longDayLabel, shortDayLabel, weekdayAndDate } from "./core";
import {
  ABSENCE_CATEGORIES,
  canDeclareAbsence,
  eodWindow,
  ownReportPatch,
  planActions,
  reportChip,
  reportWeekDays,
  toReportView,
  tomorrowKey,
  weekImprovements,
  weekSummary,
  type AbsenceCategory,
  type AbsenceInput,
  type DayReportInput,
  type DayReportRow,
  type DayReportView,
  type EodWindow,
  type ReportChip,
  type StoredAction,
  type WeekReportSummary,
} from "./day-reports";
import { getTeamPeople, type ServiceResult, type Viewer } from "./server";

const TABLE = "staff_day_reports";
export const NOT_READY_MESSAGE = "Le compte rendu de fin de journée n’est pas encore installé (migration 099 à lancer).";

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message ?? "");
}

function writeError(error: { code?: string; message?: string }, context: string) {
  if (isMissingTable(error)) return fail(503, NOT_READY_MESSAGE);
  console.error(`[day-reports] ${context} failed`, { code: error.code, message: error.message });
  return fail(500, "L’enregistrement a échoué. Réessayez.");
}

// ---------------------------------------------------------------------------
// Mon espace
// ---------------------------------------------------------------------------

export type MyDayReportPayload = {
  ready: boolean;
  todayKey: string;
  todayLabel: string;
  nowIso: string;
  window: EodWindow;
  report: DayReportView | null;
  /** Titles of the tasks the person ticked today (read-only in the form). */
  doneToday: string[];
  tomorrowKey: string;
  tomorrowLabel: string;
};

async function doneTodayTitles(userId: string, now: Date): Promise<string[]> {
  const today = dayKey(now);
  const { data, error } = await supabaseAdmin
    .from("staff_tasks")
    .select("title, completed_at")
    .eq("owner_id", userId)
    .eq("status", "fait")
    .gte("completed_at", `${today}T00:00:00.000Z`)
    .order("completed_at", { ascending: true })
    .limit(60);
  if (error) {
    if (!isMissingTable(error)) console.error("[day-reports] done tasks failed", { code: error.code });
    return [];
  }
  return (data ?? []).map((row) => row.title as string);
}

async function loadOwnRow(userId: string, date: string): Promise<{ ready: boolean; row: DayReportRow | null; error?: { code?: string; message?: string } }> {
  const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("user_id", userId).eq("report_date", date).maybeSingle<DayReportRow>();
  if (error) {
    if (isMissingTable(error)) return { ready: false, row: null };
    return { ready: true, row: null, error };
  }
  return { ready: true, row: data ?? null };
}

export async function getMyDayReport(viewer: Viewer, now = new Date()): Promise<MyDayReportPayload> {
  const todayKey = dayKey(now);
  const [own, doneToday] = await Promise.all([loadOwnRow(viewer.id, todayKey), doneTodayTitles(viewer.id, now)]);
  if (own.error) throw own.error;
  const tomorrow = tomorrowKey(todayKey);
  return {
    ready: own.ready,
    todayKey,
    todayLabel: capitalize(longDayLabel(todayKey)),
    nowIso: now.toISOString(),
    window: eodWindow(now),
    report: own.row ? toReportView(viewer, own.row) : null,
    doneToday,
    tomorrowKey: tomorrow,
    tomorrowLabel: capitalize(weekdayAndDate(tomorrow)),
  };
}

/** Sends (or edits, the same day) the person's own report and turns « Mes actions pour demain » into tasks. */
export async function submitMyReport(viewer: Viewer, input: DayReportInput, now = new Date()): Promise<ServiceResult<{ id: string; created: number }>> {
  if (eodWindow(now) === "closed") return fail(409, "Le compte rendu s’ouvre à 15:00.");
  const todayKey = dayKey(now);
  const own = await loadOwnRow(viewer.id, todayKey);
  if (!own.ready) return fail(503, NOT_READY_MESSAGE);
  if (own.error) return writeError(own.error, "load own");
  const existing = own.row;

  const plan = planActions(input.tomorrowActions, (existing?.tomorrow_actions ?? []) as StoredAction[]);
  const due = tomorrowKey(todayKey);
  let created: StoredAction[] = [];
  if (plan.create.length) {
    const { data, error } = await supabaseAdmin
      .from("staff_tasks")
      .insert(
        plan.create.map((title) => ({
          owner_id: viewer.id,
          created_by: viewer.id,
          kind: "manuel",
          title,
          note: `Depuis mon compte rendu du ${shortDayLabel(todayKey)}.`,
          due_date: due,
        })),
      )
      .select("id, title");
    if (error) return writeError(error, "create tomorrow tasks");
    created = (data ?? []).map((row) => ({ title: row.title as string, task_id: row.id as string }));
  }

  const patch = {
    ...ownReportPatch(input, existing, viewer.id, (await doneTodayTitles(viewer.id, now)).map((title) => ({ title })), now.toISOString()),
    tomorrow_actions: [...plan.keep, ...created],
  };
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert({ user_id: viewer.id, report_date: todayKey, ...patch }, { onConflict: "user_id,report_date" })
    .select("id")
    .single();
  if (error || !data) {
    // Do not leave tasks for a report that was not saved.
    if (created.length) await supabaseAdmin.from("staff_tasks").delete().in("id", created.map((c) => c.task_id!));
    return writeError(error ?? {}, "upsert own");
  }

  // Lines taken out of the list: their task goes, unless it was already done or moved.
  if (plan.remove.length) {
    const { error: removeError } = await supabaseAdmin
      .from("staff_tasks")
      .delete()
      .in("id", plan.remove)
      .eq("owner_id", viewer.id)
      .eq("status", "a_faire");
    if (removeError) console.error("[day-reports] remove old actions failed", { code: removeError.code });
  }
  return { ok: true, value: { id: data.id as string, created: created.length } };
}

// ---------------------------------------------------------------------------
// « Déclarer une absence » (Directeur, Fondateur)
// ---------------------------------------------------------------------------

export async function declareAbsence(viewer: Viewer, input: AbsenceInput, now = new Date()): Promise<ServiceResult<{ id: string }>> {
  if (!isDirectorOrFounder(viewer.level)) return fail(403, "Seuls le Directeur et le Fondateur déclarent une absence pour quelqu’un.");
  const people = await getTeamPeople(viewer);
  const target = people.find((p) => p.id === input.userId);
  if (!target) return fail(404, "Cette personne ne fait pas partie de l’équipe.");
  if (!canDeclareAbsence(viewer, target)) return fail(403, "Vous ne pouvez pas déclarer une absence pour cette personne.");
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(
      {
        user_id: target.id,
        report_date: input.date,
        absent: true,
        absence_category: input.category,
        absence_note: input.note,
        declared_by: viewer.id,
      },
      { onConflict: "user_id,report_date" },
    )
    .select("id")
    .single();
  if (error || !data) return writeError(error ?? {}, "declare absence");
  console.info("[day-reports] absence declared", { by: viewer.id, for: target.id, date: input.date, at: now.toISOString() });
  return { ok: true, value: { id: data.id as string } };
}

/** Takes an absence back (declared by mistake). A row with no report of its own is removed. */
export async function clearAbsence(viewer: Viewer, userId: string, date: string): Promise<ServiceResult<{ id: string | null }>> {
  if (!isDirectorOrFounder(viewer.level)) return fail(403, "Seuls le Directeur et le Fondateur retirent une absence.");
  const { data: row, error } = await supabaseAdmin.from(TABLE).select("id, submitted_at").eq("user_id", userId).eq("report_date", date).maybeSingle();
  if (error) return writeError(error, "load absence");
  if (!row) return { ok: true, value: { id: null } };
  const result = row.submitted_at
    ? await supabaseAdmin.from(TABLE).update({ absent: false, absence_category: null, absence_note: null, declared_by: null }).eq("id", row.id)
    : await supabaseAdmin.from(TABLE).delete().eq("id", row.id);
  if (result.error) return writeError(result.error, "clear absence");
  return { ok: true, value: { id: row.id as string } };
}

// ---------------------------------------------------------------------------
// L'équipe
// ---------------------------------------------------------------------------

export type TeamReportPerson = {
  personId: string;
  firstName: string;
  initials: string;
  levelLabel: string;
  isFounder: boolean;
  isMe: boolean;
  chip: ReportChip;
  today: DayReportView | null;
  week: WeekReportSummary;
};

export type TeamDayReports = {
  ready: boolean;
  todayKey: string;
  todayLabel: string;
  weekLabel: string;
  people: TeamReportPerson[];
  absencesByCategory: Record<AbsenceCategory, number>;
  /** The week's « Comment on pourrait faire mieux », newest first. */
  improvements: { id: string; name: string; dayLabel: string; text: string }[];
  /** People this viewer may declare absent. */
  declarable: { id: string; firstName: string; initials: string; levelLabel: string; isMe: boolean }[];
};

export function emptyTeamReports(todayKey: string, ready = false): TeamDayReports {
  const days = reportWeekDays(todayKey);
  return {
    ready,
    todayKey,
    todayLabel: capitalize(weekdayAndDate(todayKey)),
    weekLabel: `du ${shortDayLabel(days[0])} au ${shortDayLabel(days[5])}`,
    people: [],
    absencesByCategory: Object.fromEntries(ABSENCE_CATEGORIES.map((c) => [c, 0])) as Record<AbsenceCategory, number>,
    improvements: [],
    declarable: [],
  };
}

/** Pure assembly (also used with mocked data in development). Founder rows are shown only when he wrote one. */
export function teamReportsFrom(
  viewer: Viewer,
  people: { id: string; firstName: string; initials: string; levelLabel: string; level: Viewer["level"] }[],
  rows: DayReportRow[],
  now: Date,
  ready = true,
): TeamDayReports {
  const todayKey = dayKey(now);
  const base = emptyTeamReports(todayKey, ready);
  const names = new Map(people.map((p) => [p.id, { firstName: p.firstName }]));
  const reporters = people.filter((p) => p.level !== "fondateur" || rows.some((r) => r.user_id === p.id));
  const summary = weekSummary(reporters.map((p) => p.id), rows, todayKey);
  return {
    ...base,
    people: reporters.map((person) => {
      const todayRow = rows.find((r) => r.user_id === person.id && r.report_date === todayKey) ?? null;
      return {
        personId: person.id,
        firstName: person.firstName,
        initials: person.initials,
        levelLabel: person.levelLabel,
        isFounder: person.level === "fondateur",
        isMe: person.id === viewer.id,
        chip: reportChip(todayRow),
        today: todayRow ? toReportView(viewer, todayRow, names) : null,
        week: summary.people.find((p) => p.userId === person.id)!,
      };
    }),
    absencesByCategory: summary.absencesByCategory,
    improvements: weekImprovements(rows, todayKey).map((idea, index) => ({
      id: `${idea.userId}:${idea.date}:${index}`,
      name: names.get(idea.userId)?.firstName ?? "Ancien membre",
      dayLabel: capitalize(shortDayLabel(idea.date)),
      text: idea.text,
    })),
    declarable: people
      .filter((p) => canDeclareAbsence(viewer, p))
      .map((p) => ({ id: p.id, firstName: p.firstName, initials: p.initials, levelLabel: p.levelLabel, isMe: p.id === viewer.id })),
  };
}

export async function getTeamDayReports(viewer: Viewer, now = new Date()): Promise<ServiceResult<TeamDayReports>> {
  if (!isDirectorOrFounder(viewer.level)) return fail(403, "Les comptes rendus de l’équipe sont réservés au Directeur et au Fondateur.");
  const todayKey = dayKey(now);
  const days = reportWeekDays(todayKey);
  const [people, result] = await Promise.all([
    getTeamPeople(viewer),
    supabaseAdmin.from(TABLE).select("*").gte("report_date", days[0]).lte("report_date", days[5]).limit(1000),
  ]);
  if (result.error) {
    if (isMissingTable(result.error)) return { ok: true, value: { ...teamReportsFrom(viewer, people, [], now, false) } };
    throw result.error;
  }
  return { ok: true, value: teamReportsFrom(viewer, people, (result.data ?? []) as DayReportRow[], now) };
}
