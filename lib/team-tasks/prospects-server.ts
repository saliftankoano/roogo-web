// Visites 3D call tracking on the server (migration 111): businesses, logging
// a 3D call with its five points, the three-contact sequence and the daily
// call goal. Every check is here. The rules themselves are in ./prospects.ts.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { dayKey, isDirectorOrFounder, type Person } from "./core";
import {
  ANSWERED_BY_LABELS,
  CALL_RESULT_LABELS,
  INTEREST_LABELS,
  OBJECTION_LABELS,
  PROBLEM_ANSWER_LABELS,
  PROSPECT_KIND_LABELS,
  SHOOT_CALENDAR_URL,
  canSeeProspectNote,
  countCalls,
  followUpTitle,
  legacyColumns,
  sequenceLabel,
  sequencePlan,
  whatsappMessage,
  workWeek,
  type AnsweredBy,
  type CallCount,
  type CallResult,
  type Channel,
  type Interest,
  type Objection,
  type ProblemAnswer,
  type ProspectCallInput,
  type ProspectInput,
  type ProspectKind,
  type SequenceState,
} from "./prospects";
import { getTeamPeople, type ServiceResult, type Viewer } from "./server";

export const NOT_READY = "Le journal des appels 3D n’est pas encore installé (migration 111 à lancer).";

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

export function isMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /does not exist|Could not find/i.test(error.message ?? "");
}

function dbError(error: { code?: string; message?: string } | null | undefined, context: string) {
  if (isMissing(error)) return fail(503, NOT_READY);
  console.error(`[prospects] ${context} failed`, { code: error?.code, message: error?.message });
  return fail(500, "L’enregistrement a échoué. Réessayez.");
}

export type ProspectRow = {
  id: string;
  name: string;
  kind: ProspectKind;
  phone: string | null;
  phone_digits: string | null;
  quartier: string | null;
  city: string | null;
  maps_url: string | null;
  created_by: string | null;
  sequence_state: SequenceState;
  contacts_count: number;
  first_contact_on: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProspectNoteRow = {
  id: string;
  task_id: string | null;
  prospect_id: string | null;
  author_id: string;
  contact_number: number | null;
  channel: Channel | null;
  answered_by: AnsweredBy | null;
  problem_answer: ProblemAnswer | null;
  problem_words: string | null;
  objection: Objection | null;
  objection_words: string | null;
  interest: Interest | null;
  result: CallResult | null;
  notes: string | null;
  created_at: string;
};

export type ProspectView = {
  id: string;
  name: string;
  kind: ProspectKind;
  kindLabel: string;
  phone: string | null;
  place: string;
  mapsUrl: string | null;
  state: SequenceState;
  stateLabel: string;
  contacts: number;
  /** « Moubarak » when someone else added it. */
  addedBy: string | null;
  mine: boolean;
};

export type ProspectCallView = {
  id: string;
  contactNumber: number;
  channel: Channel;
  authorName: string;
  authorInitials: string;
  when: string;
  dateKey: string;
  answeredBy: string | null;
  noAnswer: boolean;
  problem: string | null;
  problemWords: string | null;
  objection: string | null;
  objectionWords: string | null;
  interest: string | null;
  result: CallResult | null;
  resultLabel: string | null;
  notes: string | null;
};

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function whenOf(iso: string, now: Date) {
  const d = new Date(iso);
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const key = dayKey(d);
  if (key === dayKey(now)) return `aujourd’hui ${time}`;
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return `hier ${time}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${time}`;
}

export function toProspectView(row: ProspectRow, viewer: Viewer, people: Person[]): ProspectView {
  const adder = row.created_by && row.created_by !== viewer.id ? people.find((p) => p.id === row.created_by)?.firstName ?? null : null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    kindLabel: PROSPECT_KIND_LABELS[row.kind] ?? "Autre",
    phone: row.phone,
    place: [row.quartier, row.city].filter(Boolean).join(", "),
    mapsUrl: row.maps_url,
    state: row.sequence_state,
    stateLabel: sequenceLabel(row.sequence_state, row.contacts_count),
    contacts: row.contacts_count,
    addedBy: adder,
    mine: row.created_by === viewer.id,
  };
}

export function toProspectCallView(note: ProspectNoteRow, people: Person[], now: Date): ProspectCallView {
  const author = people.find((p) => p.id === note.author_id);
  return {
    id: note.id,
    contactNumber: note.contact_number ?? 1,
    channel: note.channel ?? "appel",
    authorName: author?.firstName ?? "Ancien membre",
    authorInitials: author?.initials ?? "?",
    when: whenOf(note.created_at, now),
    dateKey: dayKey(new Date(note.created_at)),
    answeredBy: note.answered_by ? ANSWERED_BY_LABELS[note.answered_by] : null,
    noAnswer: note.answered_by === "pas_de_reponse",
    problem: note.problem_answer ? PROBLEM_ANSWER_LABELS[note.problem_answer] : null,
    problemWords: note.problem_words,
    objection: note.objection ? OBJECTION_LABELS[note.objection] : null,
    objectionWords: note.objection_words,
    interest: note.interest ? INTEREST_LABELS[note.interest] : null,
    result: note.result,
    resultLabel: note.result ? CALL_RESULT_LABELS[note.result] : null,
    notes: note.notes,
  };
}

async function ownProspectIds(viewer: Viewer): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("staff_call_notes")
    .select("prospect_id")
    .eq("author_id", viewer.id)
    .not("prospect_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.prospect_id as string))];
}

export type ProspectList = { ready: boolean; prospects: ProspectView[] };

/**
 * The businesses a caller can pick: the ones they added or called (everyone's
 * for the Directeur and the founder), most recent first, filtered by name.
 */
export async function listProspects(viewer: Viewer, query: string): Promise<ServiceResult<ProspectList>> {
  const q = query.trim().slice(0, 60).replace(/[%,()]/g, " ");
  let request = supabaseAdmin.from("staff_prospects").select("*").order("updated_at", { ascending: false }).limit(40);
  if (q) request = request.ilike("name", `%${q}%`);
  if (!isDirectorOrFounder(viewer.level)) {
    let ids: string[];
    try {
      ids = await ownProspectIds(viewer);
    } catch (error) {
      if (isMissing(error as { code?: string })) return { ok: true, value: { ready: false, prospects: [] } };
      throw error;
    }
    request = ids.length ? request.or(`created_by.eq.${viewer.id},id.in.(${ids.join(",")})`) : request.eq("created_by", viewer.id);
  }
  const [{ data, error }, people] = await Promise.all([request, getTeamPeople(viewer)]);
  if (error) {
    if (isMissing(error)) return { ok: true, value: { ready: false, prospects: [] } };
    return dbError(error, "list");
  }
  return { ok: true, value: { ready: true, prospects: ((data ?? []) as ProspectRow[]).map((row) => toProspectView(row, viewer, people)) } };
}

/** Businesses already in the list with the same number (PRD 1.3), whoever added them. */
export async function prospectsWithPhone(viewer: Viewer, digits: string): Promise<ServiceResult<ProspectView[]>> {
  const [{ data, error }, people] = await Promise.all([
    supabaseAdmin.from("staff_prospects").select("*").eq("phone_digits", digits).limit(5),
    getTeamPeople(viewer),
  ]);
  if (error) return dbError(error, "phone lookup");
  return { ok: true, value: ((data ?? []) as ProspectRow[]).map((row) => toProspectView(row, viewer, people)) };
}

/** Adds a business. Refused with the matches when the number is already known, unless `force`. */
export async function createProspect(
  viewer: Viewer,
  input: ProspectInput,
  force: boolean,
): Promise<ServiceResult<{ prospect: ProspectView; duplicates?: ProspectView[] }>> {
  if (input.phoneDigits && !force) {
    const dupes = await prospectsWithPhone(viewer, input.phoneDigits);
    if (!dupes.ok) return dupes;
    if (dupes.value.length) return fail(409, "Ce numéro est déjà enregistré pour une autre entreprise.");
  }
  const { data, error } = await supabaseAdmin
    .from("staff_prospects")
    .insert({
      name: input.name,
      kind: input.kind,
      phone: input.phone,
      phone_digits: input.phoneDigits,
      quartier: input.quartier,
      city: input.city,
      maps_url: input.mapsUrl,
      created_by: viewer.id,
    })
    .select("*")
    .single();
  if (error || !data) return dbError(error, "create");
  const people = await getTeamPeople(viewer);
  return { ok: true, value: { prospect: toProspectView(data as ProspectRow, viewer, people) } };
}

export type ProspectHistory = {
  prospect: ProspectView;
  calls: ProspectCallView[];
  /** Calls by others the viewer may not read (a caller sees only their own). */
  hiddenCalls: number;
  nextContact: number;
  openFollowUp: { title: string; dueDate: string } | null;
};

/** One business with its calls in order (PRD 1.6). */
export async function getProspectHistory(viewer: Viewer, id: string, now = new Date()): Promise<ServiceResult<ProspectHistory>> {
  const [{ data: row, error }, notes, tasks, people] = await Promise.all([
    supabaseAdmin.from("staff_prospects").select("*").eq("id", id).maybeSingle<ProspectRow>(),
    supabaseAdmin.from("staff_call_notes").select("*").eq("prospect_id", id).order("created_at", { ascending: true }).limit(50),
    supabaseAdmin.from("staff_tasks").select("title, due_date").eq("prospect_id", id).neq("status", "fait").order("due_date").limit(1),
    getTeamPeople(viewer),
  ]);
  if (error) return dbError(error, "history");
  if (!row) return fail(404, "Cette entreprise n’existe plus.");
  if (notes.error) return dbError(notes.error, "history notes");
  const all = (notes.data ?? []) as ProspectNoteRow[];
  const visible = all.filter((note) => canSeeProspectNote(viewer, note));
  const open = (tasks.data ?? [])[0] as { title: string; due_date: string } | undefined;
  return {
    ok: true,
    value: {
      prospect: toProspectView(row, viewer, people),
      calls: visible.map((note) => toProspectCallView(note, people, now)),
      hiddenCalls: all.length - visible.length,
      nextContact: all.length + 1,
      openFollowUp: open ? { title: open.title, dueDate: open.due_date } : null,
    },
  };
}

export type LoggedCall = {
  id: string;
  contactNumber: number;
  state: SequenceState;
  stateLabel: string;
  followUp: { title: string; dueDate: string } | null;
  calendarUrl: string | null;
};

/**
 * Logs one contact with a business: the five points, the contact number from
 * its earlier calls, and the next step of the three-contact sequence. Any
 * open follow-up of this business is replaced (one open step at a time), and
 * the task the call was opened from is closed.
 */
export async function logProspectCall(viewer: Viewer, input: ProspectCallInput, now = new Date()): Promise<ServiceResult<LoggedCall>> {
  const todayKey = dayKey(now);
  const { data: prospect, error } = await supabaseAdmin.from("staff_prospects").select("*").eq("id", input.prospectId).maybeSingle<ProspectRow>();
  if (error) return dbError(error, "load prospect");
  if (!prospect) return fail(404, "Cette entreprise n’existe plus.");

  if (input.taskId) {
    const { data: task, error: taskError } = await supabaseAdmin
      .from("staff_tasks")
      .select("id, owner_id, created_by, prospect_id, status")
      .eq("id", input.taskId)
      .maybeSingle();
    if (taskError) return dbError(taskError, "load task");
    if (!task || task.prospect_id !== prospect.id) return fail(400, "Cette tâche ne correspond pas à cette entreprise.");
    if (task.owner_id !== viewer.id && task.created_by !== viewer.id && !isDirectorOrFounder(viewer.level)) {
      return fail(403, "Cette tâche n’est pas la vôtre.");
    }
  }

  const { count, error: countError } = await supabaseAdmin
    .from("staff_call_notes")
    .select("id", { count: "exact", head: true })
    .eq("prospect_id", prospect.id);
  if (countError) return dbError(countError, "count contacts");
  const contactNumber = (count ?? 0) + 1;
  const firstContactOn = prospect.first_contact_on ?? todayKey;
  const plan = sequencePlan({ contactNumber, result: input.result, firstContactOn, todayKey });

  let followUpId: string | null = null;
  let followUp: LoggedCall["followUp"] = null;
  if (plan.followUp) {
    const title = followUpTitle(plan.followUp.step, prospect.name);
    const note =
      plan.followUp.step === 3
        ? `Dernier contact de la série. Message à copier :\n\n${whatsappMessage(prospect.name, viewer.firstName)}`
        : `Contact 2 sur 3. ${CALL_RESULT_LABELS[input.result]} au premier appel.${input.objection ? ` Objection : ${OBJECTION_LABELS[input.objection].toLowerCase()}.` : ""}`;
    const { data: task, error: taskError } = await supabaseAdmin
      .from("staff_tasks")
      .insert({
        owner_id: viewer.id,
        created_by: viewer.id,
        kind: "manuel",
        title,
        note: note.slice(0, 2000),
        due_date: plan.followUp.dueDate,
        is_call: true,
        call_phone: prospect.phone,
        prospect_id: prospect.id,
        prospect_step: plan.followUp.step,
      })
      .select("id")
      .single();
    if (taskError || !task) return dbError(taskError, "follow-up task");
    followUpId = task.id as string;
    followUp = { title, dueDate: plan.followUp.dueDate };
  }

  const legacy = legacyColumns({ answeredBy: input.answeredBy, followUp: plan.followUp });
  const { data: note, error: noteError } = await supabaseAdmin
    .from("staff_call_notes")
    .insert({
      task_id: input.taskId,
      prospect_id: prospect.id,
      subject_kind: "visite_3d",
      subject_label: prospect.name.slice(0, 200),
      author_id: viewer.id,
      outcome: legacy.outcome,
      next_step: legacy.nextStep,
      next_at: legacy.nextAt,
      follow_up_task_id: followUpId,
      notes: input.notes,
      contact_number: contactNumber,
      channel: input.channel,
      answered_by: input.answeredBy,
      problem_answer: input.problemAnswer,
      problem_words: input.problemWords,
      objection: input.objection,
      objection_words: input.objectionWords,
      interest: input.interest,
      result: input.result,
    })
    .select("id")
    .single();
  if (noteError || !note) {
    if (followUpId) await supabaseAdmin.from("staff_tasks").delete().eq("id", followUpId);
    return dbError(noteError, "insert note");
  }

  // Replace the open steps of this business: oui or non removes them all (PRD 3.3).
  let cleanup = supabaseAdmin.from("staff_tasks").delete().eq("prospect_id", prospect.id).neq("status", "fait");
  if (followUpId) cleanup = cleanup.neq("id", followUpId);
  if (input.taskId) cleanup = cleanup.neq("id", input.taskId);
  const { error: cleanupError } = await cleanup;
  if (cleanupError) console.error("[prospects] removing old follow-ups failed", { code: cleanupError.code, message: cleanupError.message });

  if (input.taskId) {
    const { error: doneError } = await supabaseAdmin
      .from("staff_tasks")
      .update({ status: "fait", completed_at: now.toISOString(), completed_by: viewer.id })
      .eq("id", input.taskId)
      .neq("status", "fait");
    if (doneError) console.error("[prospects] closing the task failed", { code: doneError.code, message: doneError.message });
  }

  const { error: updateError } = await supabaseAdmin
    .from("staff_prospects")
    .update({
      sequence_state: plan.state,
      contacts_count: contactNumber,
      first_contact_on: firstContactOn,
      last_contact_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", prospect.id);
  if (updateError) console.error("[prospects] sequence update failed", { code: updateError.code, message: updateError.message });

  return {
    ok: true,
    value: {
      id: note.id as string,
      contactNumber,
      state: plan.state,
      stateLabel: sequenceLabel(plan.state, contactNumber),
      followUp,
      calendarUrl: input.result === "oui" ? SHOOT_CALENDAR_URL : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Daily call goal
// ---------------------------------------------------------------------------

export type CallGoalRow = { person: Person; count: CallCount };
export type CallGoalsPayload = {
  ready: boolean;
  todayKey: string;
  me: CallCount;
  /** Directeur and founder: everyone with a goal or a call this week. */
  team: CallGoalRow[] | null;
  canManage: boolean;
  absencesCounted: boolean;
};

async function absentDaysByUser(weekKeys: string[]): Promise<{ ready: boolean; map: Map<string, string[]> }> {
  const map = new Map<string, string[]>();
  const { data, error } = await supabaseAdmin
    .from("staff_day_reports")
    .select("user_id, report_date")
    .eq("absent", true)
    .gte("report_date", weekKeys[0])
    .lte("report_date", weekKeys[4]);
  if (error) return { ready: false, map };
  for (const row of data ?? []) {
    const list = map.get(row.user_id as string) ?? [];
    list.push(row.report_date as string);
    map.set(row.user_id as string, list);
  }
  return { ready: true, map };
}

/** Today's and this week's logged calls against the goal (PRD 2.3, 2.4, 2.5). */
export async function getCallGoals(viewer: Viewer, now = new Date()): Promise<ServiceResult<CallGoalsPayload>> {
  const todayKey = dayKey(now);
  const week = workWeek(todayKey);
  const seeTeam = isDirectorOrFounder(viewer.level);
  const empty: CallCount = { goal: null, today: 0, week: 0, weekTarget: null, absentDays: 0 };

  let goalsRequest = supabaseAdmin.from("staff_call_goals").select("user_id, daily_target");
  if (!seeTeam) goalsRequest = goalsRequest.eq("user_id", viewer.id);
  let notesRequest = supabaseAdmin
    .from("staff_call_notes")
    .select("author_id, created_at")
    .gte("created_at", `${week[0]}T00:00:00.000Z`)
    .limit(5000);
  if (!seeTeam) notesRequest = notesRequest.eq("author_id", viewer.id);

  const [goals, notes, absences, people] = await Promise.all([goalsRequest, notesRequest, absentDaysByUser(week), seeTeam ? getTeamPeople(viewer) : Promise.resolve([] as Person[])]);
  if (goals.error) {
    if (isMissing(goals.error)) {
      return { ok: true, value: { ready: false, todayKey, me: empty, team: seeTeam ? [] : null, canManage: viewer.isFounder, absencesCounted: false } };
    }
    return dbError(goals.error, "goals");
  }
  if (notes.error) return dbError(notes.error, "goal counts");
  const goalBy = new Map((goals.data ?? []).map((g) => [g.user_id as string, g.daily_target as number]));
  const rows = (notes.data ?? []) as { author_id: string; created_at: string }[];
  const count = (userId: string) =>
    countCalls({ notes: rows, userId, goal: goalBy.get(userId) ?? null, todayKey, absentDays: absences.map.get(userId) ?? [] });

  let team: CallGoalRow[] | null = null;
  if (seeTeam) {
    const callers = new Set([...goalBy.keys(), ...rows.map((r) => r.author_id)]);
    team = people.filter((p) => callers.has(p.id)).map((person) => ({ person, count: count(person.id) }));
  }
  return {
    ok: true,
    value: { ready: true, todayKey, me: count(viewer.id), team, canManage: viewer.isFounder, absencesCounted: absences.ready },
  };
}

/** The founder sets, changes or removes a daily goal; every change is logged (PRD 2.1). */
export async function setCallGoal(viewer: Viewer, userId: string, target: number | null): Promise<ServiceResult<{ goal: number | null }>> {
  if (!viewer.isFounder) return fail(403, "Seul le Fondateur change les objectifs d’appels.");
  const people = await getTeamPeople(viewer);
  if (!people.some((p) => p.id === userId)) return fail(404, "Cette personne ne fait pas partie de l’équipe.");
  const { data: current, error } = await supabaseAdmin.from("staff_call_goals").select("daily_target").eq("user_id", userId).maybeSingle();
  if (error) return dbError(error, "load goal");
  const old = (current?.daily_target as number | undefined) ?? null;
  if (old === target) return { ok: true, value: { goal: target } };
  const write =
    target === null
      ? await supabaseAdmin.from("staff_call_goals").delete().eq("user_id", userId)
      : await supabaseAdmin
          .from("staff_call_goals")
          .upsert({ user_id: userId, daily_target: target, set_by: viewer.id, updated_at: new Date().toISOString() });
  if (write.error) return dbError(write.error, "write goal");
  const { error: logError } = await supabaseAdmin
    .from("staff_call_goal_changes")
    .insert({ user_id: userId, old_target: old, new_target: target, changed_by: viewer.id });
  if (logError) console.error("[call-goals] change log failed", { code: logError.code, message: logError.message });
  return { ok: true, value: { goal: target } };
}
