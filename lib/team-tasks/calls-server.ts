// Call notes on call tasks (092): the « Appeler et noter » panel, saving a
// note and its next step, and the « Notes d’appels » log. Notes are visible
// to their author, the Directeur and the founder only; every check is here,
// on the server.

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  CALL_OUTCOME_LABELS,
  addDays,
  callSubjectKind,
  canSeeCallNote,
  capitalize,
  dayKey,
  followUpPlan,
  isDirectorOrFounder,
  shortDayLabel,
  timeOf,
  type CallNextStep,
  type CallNoteInput,
  type CallOutcome,
  type CallSubject,
  type Person,
  type StaffTaskRow,
} from "./core";
import { propertyLabel } from "./sources";
import { getTeamPeople, type ServiceResult, type Viewer } from "./server";

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

function isMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /does not exist|Could not find/i.test(error.message ?? "");
}

function writeError(error: { code?: string; message?: string }, context: string) {
  if (isMissing(error)) return fail(503, "Les notes d’appel ne sont pas encore installées (migration 092 à lancer).");
  console.error(`[call-notes] ${context} failed`, { code: error.code, message: error.message });
  return fail(500, "L’enregistrement a échoué. Réessayez.");
}

type CallNoteRow = {
  id: string;
  task_id: string | null;
  property_request_id: string | null;
  property_id: string | null;
  visit_request_id: string | null;
  subject_user_id: string | null;
  subject_kind: CallSubject;
  subject_label: string | null;
  author_id: string;
  outcome: CallOutcome;
  notes: string | null;
  next_step: CallNextStep;
  next_at: string | null;
  follow_up_task_id: string | null;
  created_at: string;
};

export type CallNoteView = {
  id: string;
  authorName: string;
  authorInitials: string;
  when: string;
  outcome: CallOutcome;
  outcomeLabel: string;
  notes: string;
  next: string;
  subject: string;
  subjectKind: CallSubject;
  href: string | null;
  link: string | null;
};

export type CallContext = {
  taskId: string;
  title: string;
  /** « Appel · demande de bien » */
  eyebrow: string;
  subject: string;
  sub: string;
  phone: string | null;
  done: boolean;
  previous: CallNoteView[];
  /** « Passer à Ablassé », or null when there is nobody to pass to. */
  passLabel: string | null;
  passHint: string | null;
  recallDefault: { date: string; time: string };
  todayKey: string;
};

const PHONE = /^[+\d][\d\s.-]{5,}$/;

function phoneOf(value: string | null | undefined) {
  const clean = (value ?? "").trim();
  return PHONE.test(clean) ? clean : null;
}

function relWhen(iso: string, now: Date) {
  const date = new Date(iso);
  const key = dayKey(date);
  const today = dayKey(now);
  if (key === today) return `aujourd’hui ${timeOf(date)}`;
  if (key === addDays(today, -1)) return `hier ${timeOf(date)}`;
  return `${shortDayLabel(key)} ${timeOf(date)}`;
}

function nextLabel(note: Pick<CallNoteRow, "next_step" | "next_at">, people: Person[], authorLevel: string | undefined, now: Date) {
  if (note.next_step === "visite") return "visite à confirmer";
  if (note.next_step === "rien") return "rien à faire";
  if (note.next_step === "rappel") return note.next_at ? `rappeler ${relWhen(note.next_at, now).replace("aujourd’hui", "aujourd’hui à")}` : "rappeler";
  const director = people.find((p) => p.level === "directeur");
  const founder = people.find((p) => p.level === "fondateur");
  return authorLevel === "directeur" ? `passé à ${founder?.firstName ?? "Fondateur"}` : `passé à ${director?.firstName ?? "Directeur"}`;
}

function linkOf(note: Pick<CallNoteRow, "property_request_id" | "property_id" | "visit_request_id">) {
  if (note.property_request_id) return { href: `/admin/demandes-de-biens/${note.property_request_id}`, link: "Ouvrir la demande" };
  if (note.visit_request_id) return { href: "/admin/demandes-de-visite", link: "Ouvrir la visite" };
  if (note.property_id) return { href: `/admin/annonces/${note.property_id}`, link: "Ouvrir le bien" };
  return { href: null, link: null };
}

function toView(note: CallNoteRow, people: Person[], now: Date): CallNoteView {
  const author = people.find((p) => p.id === note.author_id);
  return {
    id: note.id,
    authorName: author?.firstName ?? "Ancien membre",
    authorInitials: author?.initials ?? "?",
    when: relWhen(note.created_at, now),
    outcome: note.outcome,
    outcomeLabel: CALL_OUTCOME_LABELS[note.outcome],
    notes: note.notes ?? "",
    next: nextLabel(note, people, author?.level, now),
    subject: note.subject_label ?? "Appel",
    subjectKind: note.subject_kind,
    ...linkOf(note),
  };
}

type Subject = {
  label: string;
  sub: string;
  kind: CallSubject;
  phone: string | null;
  subjectUserId: string | null;
  eyebrow: string;
};

const EYEBROWS: Record<CallSubject, string> = {
  demande: "Appel · demande de bien",
  proprietaire: "Appel · propriétaire",
  vente: "Appel · vente",
  autre: "Appel",
};

/** Who the call is with, the number to call and the filter it belongs to, from the task's links. */
async function subjectOf(task: StaffTaskRow): Promise<Subject> {
  let label = task.title;
  let sub = task.note ?? "";
  let phone = phoneOf(task.call_phone);
  let subjectUserId: string | null = null;
  let listingType: string | null = null;
  if (task.property_request_id) {
    const { data } = await supabaseAdmin
      .from("property_requests")
      .select("title, neighborhood, city, budget_max, customer_contact")
      .eq("id", task.property_request_id)
      .maybeSingle();
    if (data) {
      label = `Client de la demande ${data.title}`;
      sub = sub || [data.neighborhood, data.city].filter(Boolean).join(", ");
      phone = phone ?? phoneOf(data.customer_contact as string | null);
    }
  }
  if (task.visit_request_id) {
    const { data } = await supabaseAdmin
      .from("visit_requests")
      .select("buyer_id, buyer:buyer_id ( phone, whatsapp ), property:property_id ( property_type, quartier, city, reference )")
      .eq("id", task.visit_request_id)
      .maybeSingle();
    if (data) {
      const buyer = (Array.isArray(data.buyer) ? data.buyer[0] : data.buyer) as { phone?: string | null; whatsapp?: string | null } | null;
      const property = Array.isArray(data.property) ? data.property[0] : data.property;
      if (!task.property_request_id) label = `Acheteur, ${propertyLabel(property ?? null)}`;
      subjectUserId = (data.buyer_id as string | null) ?? null;
      phone = phone ?? phoneOf(buyer?.phone) ?? phoneOf(buyer?.whatsapp);
    }
  }
  if (task.property_id) {
    const { data } = await supabaseAdmin
      .from("properties")
      .select("listing_type, property_type, quartier, city, reference, agent_id, owner:agent_id ( phone, whatsapp )")
      .eq("id", task.property_id)
      .maybeSingle();
    if (data) {
      listingType = (data.listing_type as string | null) ?? null;
      const owner = (Array.isArray(data.owner) ? data.owner[0] : data.owner) as { phone?: string | null; whatsapp?: string | null } | null;
      if (!task.property_request_id && !task.visit_request_id) {
        label = `${listingType === "vendre" ? "Vendeur" : "Propriétaire"}, ${propertyLabel(data)}`;
        subjectUserId = (data.agent_id as string | null) ?? null;
        phone = phone ?? phoneOf(owner?.phone) ?? phoneOf(owner?.whatsapp);
      }
    }
  }
  const kind = callSubjectKind({
    callSubject: task.call_subject ?? null,
    propertyRequestId: task.property_request_id ?? null,
    visitRequestId: task.visit_request_id,
    propertyListingType: listingType,
  });
  return { label: label.slice(0, 200), sub, kind, phone, subjectUserId, eyebrow: EYEBROWS[kind] };
}

async function loadTask(id: string) {
  const { data, error } = await supabaseAdmin.from("staff_tasks").select("*").eq("id", id).maybeSingle<StaffTaskRow>();
  return { task: data, error };
}

function mayWorkOn(viewer: Viewer, task: StaffTaskRow) {
  return task.owner_id === viewer.id || task.created_by === viewer.id || isDirectorOrFounder(viewer.level);
}

async function previousNotes(viewer: Viewer, task: StaffTaskRow, subjectUserId: string | null): Promise<CallNoteRow[]> {
  const filters = [`task_id.eq.${task.id}`];
  if (task.property_request_id) filters.push(`property_request_id.eq.${task.property_request_id}`);
  if (task.visit_request_id) filters.push(`visit_request_id.eq.${task.visit_request_id}`);
  if (task.property_id) filters.push(`property_id.eq.${task.property_id}`);
  if (subjectUserId) filters.push(`subject_user_id.eq.${subjectUserId}`);
  const { data, error } = await supabaseAdmin
    .from("staff_call_notes")
    .select("*")
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return ((data ?? []) as CallNoteRow[]).filter((note) => canSeeCallNote(viewer, note));
}

function passTarget(viewer: Viewer, people: Person[]) {
  if (viewer.level === "fondateur") return null;
  if (viewer.level === "directeur") return people.find((p) => p.level === "fondateur") ?? null;
  return people.find((p) => p.level === "directeur") ?? null;
}

function nextWorkingDay(key: string) {
  const next = addDays(key, 1);
  return new Date(`${next}T00:00:00Z`).getUTCDay() === 0 ? addDays(next, 1) : next;
}

/** What the « Appeler et noter » panel shows for one call task. */
export async function getCallContext(viewer: Viewer, taskId: string, now = new Date()): Promise<ServiceResult<CallContext>> {
  const { task, error } = await loadTask(taskId);
  if (error) return writeError(error, "load task");
  if (!task) return fail(404, "Cette tâche n’existe plus.");
  if (!mayWorkOn(viewer, task)) return fail(403, "Cette tâche n’est pas la vôtre.");
  const [subject, people] = await Promise.all([subjectOf(task), getTeamPeople(viewer)]);
  const previous = await previousNotes(viewer, task, subject.subjectUserId);
  const pass = passTarget(viewer, people);
  return {
    ok: true,
    value: {
      taskId: task.id,
      title: task.title,
      eyebrow: subject.eyebrow,
      subject: subject.label,
      sub: subject.sub,
      phone: subject.phone,
      done: task.status === "fait",
      previous: previous.map((note) => toView(note, people, now)),
      passLabel: pass ? `Passer à ${pass.firstName}` : null,
      passHint: pass
        ? viewer.level === "directeur"
          ? `${pass.firstName} reçoit une demande avec vos notes.`
          : `${pass.firstName} reçoit une tâche avec vos notes.`
        : null,
      recallDefault: { date: nextWorkingDay(dayKey(now)), time: "10:00" },
      todayKey: dayKey(now),
    },
  };
}

/**
 * Saves the note, creates the next step's task and closes the call task
 * (the follow-up, if any, carries the work on).
 */
export async function saveCallNote(viewer: Viewer, input: CallNoteInput, now = new Date()): Promise<ServiceResult<{ id: string; followUpId: string | null }>> {
  const { task, error } = await loadTask(input.taskId);
  if (error) return writeError(error, "load task");
  if (!task) return fail(404, "Cette tâche n’existe plus.");
  if (!task.is_call) return fail(400, "Cette tâche n’est pas un appel.");
  if (!mayWorkOn(viewer, task)) return fail(403, "Cette tâche n’est pas la vôtre.");
  const [subject, people] = await Promise.all([subjectOf(task), getTeamPeople(viewer)]);
  const director = people.find((p) => p.level === "directeur") ?? null;
  const founder = people.find((p) => p.level === "fondateur") ?? null;
  if (input.nextStep === "passer_au_directeur" && !passTarget(viewer, people)) {
    return fail(400, "Il n’y a personne à qui passer cet appel.");
  }
  const plan = followUpPlan({
    step: input.nextStep,
    author: viewer,
    directorId: director?.id ?? null,
    founderId: founder?.id ?? null,
    subject: subject.label.replace(/^Client de la demande /, "client de la demande "),
    notes: input.notes,
    outcome: input.outcome,
    nextAt: input.nextAt,
    now,
  });

  let followUpId: string | null = null;
  if (plan) {
    const links = {
      property_id: task.property_id,
      visit_request_id: task.visit_request_id,
      ...(task.property_request_id ? { property_request_id: task.property_request_id } : {}),
      ...(task.goal_id ? { goal_id: task.goal_id } : {}),
    };
    const { data, error: insertError } = await supabaseAdmin
      .from("staff_tasks")
      .insert({
        owner_id: plan.ownerId,
        created_by: viewer.id,
        kind: plan.kind,
        title: capitalize(plan.title),
        note: plan.note,
        reason: plan.reason,
        due_date: plan.dueDate,
        due_time: plan.dueTime,
        ...links,
        ...(plan.isCall ? { is_call: true, call_phone: subject.phone, call_subject: subject.kind } : {}),
      })
      .select("id")
      .single();
    if (insertError || !data) return writeError(insertError ?? {}, "follow-up task");
    followUpId = data.id as string;
  }

  const { data: note, error: noteError } = await supabaseAdmin
    .from("staff_call_notes")
    .insert({
      task_id: task.id,
      property_request_id: task.property_request_id ?? null,
      property_id: task.property_id,
      visit_request_id: task.visit_request_id,
      subject_user_id: subject.subjectUserId,
      subject_kind: subject.kind,
      subject_label: subject.label,
      author_id: viewer.id,
      outcome: input.outcome,
      notes: input.notes,
      next_step: input.nextStep,
      next_at: input.nextAt,
      follow_up_task_id: followUpId,
    })
    .select("id")
    .single();
  if (noteError || !note) {
    if (followUpId) await supabaseAdmin.from("staff_tasks").delete().eq("id", followUpId);
    return writeError(noteError ?? {}, "insert note");
  }

  if (task.status !== "fait") {
    const nowIso = now.toISOString();
    const { error: doneError } = await supabaseAdmin
      .from("staff_tasks")
      .update({ status: "fait", completed_at: nowIso, completed_by: viewer.id })
      .eq("id", task.id);
    if (doneError) console.error("[call-notes] closing the call task failed", { code: doneError.code, message: doneError.message });
  }
  return { ok: true, value: { id: note.id as string, followUpId } };
}

export type CallLogFilter = "tous" | "demandes" | "proprietaires" | "ventes";
const FILTER_KIND: Record<Exclude<CallLogFilter, "tous">, CallSubject> = {
  demandes: "demande",
  proprietaires: "proprietaire",
  ventes: "vente",
};

export type CallLogPayload = { ready: boolean; notes: CallNoteView[]; counts: Record<CallLogFilter, number> };

/** « Notes d’appels »: every note of the team, newest first. Directeur and founder only. */
export async function getCallLog(viewer: Viewer, now = new Date()): Promise<ServiceResult<CallLogPayload>> {
  if (!isDirectorOrFounder(viewer.level)) return fail(403, "Les notes d’appels sont réservées au Directeur et au Fondateur.");
  const [{ data, error }, people] = await Promise.all([
    supabaseAdmin.from("staff_call_notes").select("*").order("created_at", { ascending: false }).limit(300),
    getTeamPeople(viewer),
  ]);
  const empty = { tous: 0, demandes: 0, proprietaires: 0, ventes: 0 };
  if (error) {
    if (isMissing(error)) return { ok: true, value: { ready: false, notes: [], counts: empty } };
    return writeError(error, "log");
  }
  const notes = ((data ?? []) as CallNoteRow[]).map((note) => toView(note, people, now));
  const counts = { ...empty, tous: notes.length };
  for (const [filter, kind] of Object.entries(FILTER_KIND) as [Exclude<CallLogFilter, "tous">, CallSubject][]) {
    counts[filter] = notes.filter((n) => n.subjectKind === kind).length;
  }
  return { ok: true, value: { ready: true, notes, counts } };
}

export function filterKind(filter: CallLogFilter): CallSubject | null {
  return filter === "tous" ? null : FILTER_KIND[filter];
}
