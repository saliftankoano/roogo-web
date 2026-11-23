// Visites 3D call tracking (migration 111, three PRDs approved by Salif on
// 2026-11-22): the businesses called (« prospects »), the five points of each
// call, the three-contact sequence (day 0 call, day 2 call back, day 7
// WhatsApp message, stops on oui or non) and the daily call goal.
//
// Pure functions only, no runtime imports, so the browser, the server and
// node:test share one source. Ouagadougou is UTC all year: a day key is the
// UTC calendar date, YYYY-MM-DD.

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export type ProspectKind = "restaurant" | "hotel" | "salle_de_fete" | "promoteur" | "autre";
export const PROSPECT_KINDS: ProspectKind[] = ["restaurant", "hotel", "salle_de_fete", "promoteur", "autre"];
export const PROSPECT_KIND_LABELS: Record<ProspectKind, string> = {
  restaurant: "Restaurant",
  hotel: "Hôtel",
  salle_de_fete: "Salle de fête",
  promoteur: "Promoteur",
  autre: "Autre",
};

export type AnsweredBy = "patron" | "gerant" | "employe" | "pas_de_reponse";
export const ANSWERED_BY: AnsweredBy[] = ["patron", "gerant", "employe", "pas_de_reponse"];
export const ANSWERED_BY_LABELS: Record<AnsweredBy, string> = {
  patron: "Le patron",
  gerant: "Le gérant",
  employe: "Un employé",
  pas_de_reponse: "Pas de réponse",
};

export type ProblemAnswer = "oui" | "non" | "pas_clair";
export const PROBLEM_ANSWERS: ProblemAnswer[] = ["oui", "non", "pas_clair"];
export const PROBLEM_ANSWER_LABELS: Record<ProblemAnswer, string> = {
  oui: "Oui",
  non: "Non",
  pas_clair: "Pas clair",
};

export type Objection = "cher" | "deja_photos" | "clients_connaissent" | "reflechir" | "autre";
export const OBJECTIONS: Objection[] = ["cher", "deja_photos", "clients_connaissent", "reflechir", "autre"];
export const OBJECTION_LABELS: Record<Objection, string> = {
  cher: "C’est cher",
  deja_photos: "Déjà des photos",
  clients_connaissent: "Les clients me connaissent",
  reflechir: "Je vais réfléchir",
  autre: "Autre",
};

export type Interest = "exemple" | "prix" | "route" | "rien";
export const INTERESTS: Interest[] = ["exemple", "prix", "route", "rien"];
export const INTEREST_LABELS: Record<Interest, string> = {
  exemple: "L’exemple",
  prix: "Le prix",
  route: "La route jusqu’à la porte",
  rien: "Rien",
};

export type CallResult = "oui" | "a_rappeler" | "non";
export const CALL_RESULTS: CallResult[] = ["oui", "a_rappeler", "non"];
export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  oui: "Oui",
  a_rappeler: "À rappeler",
  non: "Non",
};

export type Channel = "appel" | "whatsapp";

export type SequenceState = "en_cours" | "oui" | "non" | "a_reprendre";

/** « Contact 2 sur 3 », « Oui », « Non », « À reprendre plus tard ». */
export function sequenceLabel(state: SequenceState, contacts: number): string {
  if (state === "oui") return "Oui";
  if (state === "non") return "Non";
  if (state === "a_reprendre") return "À reprendre plus tard";
  if (contacts <= 0) return "Pas encore appelé";
  return `Contact ${Math.min(contacts, 3)} sur 3`;
}

/** Shared Google Calendar of the shoots (decided 2026-11-22). */
export const SHOOT_CALENDAR_URL = "https://calendar.google.com/calendar/u/0/r";

/** Page with the example tour, sent to prospects. */
export const EXAMPLE_TOUR_URL = "https://www.roogobf.com/visites-3d";

/** The day-7 WhatsApp message, ready to copy. */
export function whatsappMessage(name: string, callerFirstName: string): string {
  return [
    `Bonjour, c’est ${callerFirstName} de Roogo. On s’est parlé cette semaine pour la visite 3D de ${name}.`,
    `Voici l’exemple : ${EXAMPLE_TOUR_URL}`,
    "Vos clients voient votre salle avant de venir, et la route jusqu’à votre porte. Si vous voulez, on passe faire les prises de vue cette semaine.",
  ].join("\n\n");
}

// ---------------------------------------------------------------------------
// Dates (Ouagadougou = UTC)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function keyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function plusDays(key: string, days: number): string {
  return keyOf(new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS));
}

function weekday(key: string) {
  return new Date(`${key}T00:00:00.000Z`).getUTCDay();
}

/** A Saturday or Sunday moves to the Monday after (PRD 3.1). */
export function toWorkingDay(key: string): string {
  const d = weekday(key);
  if (d === 6) return plusDays(key, 2);
  if (d === 0) return plusDays(key, 1);
  return key;
}

/** Monday to Friday of the week a day belongs to (Saturday and Sunday: the week just ended). */
export function workWeek(key: string): string[] {
  const monday = plusDays(key, -((weekday(key) + 6) % 7));
  return [0, 1, 2, 3, 4].map((n) => plusDays(monday, n));
}

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

/**
 * Digits used to spot a business already in the list. Burkina numbers keep
 * their last 8 digits, so « +226 70 12 34 56 », « 0022670123456 » and
 * « 70123456 » match. Null when there are too few digits.
 */
export function phoneDigits(value: string | null | undefined): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("226")) digits = digits.slice(3);
  if (digits.length < 6 || digits.length > 15) return null;
  return digits;
}

/** Number for a tel: or wa.me link. Burkina numbers get +226. */
export function dialable(value: string | null | undefined): string | null {
  const digits = phoneDigits(value);
  if (!digits) return null;
  return digits.length === 8 ? `+226${digits}` : `+${digits}`;
}

// ---------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------

function isUuidLike(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** undefined = too long, null = empty. */
function text(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  if (!clean) return null;
  return clean.length > max ? undefined : clean;
}

function oneOf<T extends string>(value: unknown, list: readonly T[]): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;
}

export type ProspectInput = {
  name: string;
  kind: ProspectKind;
  phone: string | null;
  phoneDigits: string | null;
  quartier: string | null;
  city: string | null;
  mapsUrl: string | null;
};

export function parseProspect(body: unknown): { error: string } | { value: ProspectInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 120);
  if (!name) return { error: name === undefined ? "Le nom est trop long (120 caractères au plus)." : "Écrivez le nom de l’entreprise." };
  const kind = oneOf(b.kind, PROSPECT_KINDS);
  if (!kind) return { error: "Choisissez le type d’entreprise." };
  const phone = text(b.phone, 40);
  if (phone === undefined) return { error: "Le numéro est trop long." };
  const digits = phone ? phoneDigits(phone) : null;
  if (phone && !digits) return { error: "Le numéro de téléphone n’est pas valide." };
  const quartier = text(b.quartier, 80);
  const city = text(b.city, 80);
  if (quartier === undefined || city === undefined) return { error: "Le quartier ou la ville est trop long." };
  const mapsUrl = text(b.mapsUrl, 500);
  if (mapsUrl === undefined || (mapsUrl && !/^https?:\/\//i.test(mapsUrl))) return { error: "Le lien Google Maps doit commencer par https://." };
  return { value: { name, kind, phone, phoneDigits: digits, quartier, city, mapsUrl } };
}

export type ProspectCallInput = {
  prospectId: string;
  /** The follow-up task being worked, when the call was opened from it. */
  taskId: string | null;
  channel: Channel;
  answeredBy: AnsweredBy;
  problemAnswer: ProblemAnswer | null;
  problemWords: string | null;
  objection: Objection | null;
  objectionWords: string | null;
  interest: Interest | null;
  result: CallResult;
  notes: string | null;
};

/**
 * Who answered and the result are required (PRD open question 2), the rest is
 * optional. « Pas de réponse » keeps only the result, « à rappeler » by default,
 * so an unanswered call takes two taps.
 */
export function parseProspectCall(body: unknown): { error: string } | { value: ProspectCallInput } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isUuidLike(b.prospectId)) return { error: "Choisissez l’entreprise appelée." };
  const taskId = b.taskId === undefined || b.taskId === null || b.taskId === "" ? null : isUuidLike(b.taskId) ? b.taskId : undefined;
  if (taskId === undefined) return { error: "Cette tâche est introuvable." };
  const channel: Channel = b.channel === "whatsapp" ? "whatsapp" : "appel";
  const answeredBy = oneOf(b.answeredBy, ANSWERED_BY);
  if (!answeredBy) return { error: channel === "whatsapp" ? "Dites si l’entreprise a répondu." : "Dites qui a répondu." };
  const noAnswer = answeredBy === "pas_de_reponse";
  const result = oneOf(b.result, CALL_RESULTS) ?? (noAnswer ? "a_rappeler" : null);
  if (!result) return { error: "Choisissez le résultat." };
  const problemWords = text(b.problemWords, 500);
  const objectionWords = text(b.objectionWords, 500);
  const notes = text(b.notes, 2000);
  if (problemWords === undefined || objectionWords === undefined) return { error: "Leurs mots sont trop longs (500 caractères au plus)." };
  if (notes === undefined) return { error: "Les notes sont trop longues (2000 caractères au plus)." };
  return {
    value: {
      prospectId: b.prospectId,
      taskId,
      channel,
      answeredBy,
      problemAnswer: noAnswer ? null : oneOf(b.problemAnswer, PROBLEM_ANSWERS),
      problemWords: noAnswer ? null : problemWords,
      objection: noAnswer ? null : oneOf(b.objection, OBJECTIONS),
      objectionWords: noAnswer ? null : objectionWords,
      interest: noAnswer ? null : oneOf(b.interest, INTERESTS),
      result,
      notes,
    },
  };
}

/** A daily goal: a whole number from 1 to 200, or null to remove it. */
export function parseDailyTarget(value: unknown): { error: string } | { value: number | null } {
  if (value === null || value === "" || value === undefined) return { value: null };
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 200) return { error: "L’objectif doit être un nombre entre 1 et 200." };
  return { value: n };
}

// ---------------------------------------------------------------------------
// The three-contact sequence
// ---------------------------------------------------------------------------

export type SequencePlan = {
  state: SequenceState;
  /** The task to create for the caller, or null. Open follow-ups are always removed first. */
  followUp: { step: 2 | 3; dueDate: string } | null;
};

/**
 * What saving contact `contactNumber` does (PRD 3.1 to 3.4):
 * oui or non at any contact closes the sequence;
 * contact 1 without a yes or no: call back on day 2;
 * contact 2 without a yes or no: WhatsApp message on day 7 after contact 1;
 * contact 3 or later without a yes or no: « à reprendre plus tard », nothing more.
 * An unanswered call is a contact (PRD open question 1). A weekend due date
 * moves to Monday, and a due date already passed moves to the next working day.
 */
export function sequencePlan(input: {
  contactNumber: number;
  result: CallResult;
  firstContactOn: string;
  todayKey: string;
}): SequencePlan {
  if (input.result === "oui" || input.result === "non") return { state: input.result, followUp: null };
  if (input.contactNumber >= 3) return { state: "a_reprendre", followUp: null };
  const step: 2 | 3 = input.contactNumber <= 1 ? 2 : 3;
  let due = toWorkingDay(plusDays(input.firstContactOn, step === 2 ? 2 : 7));
  if (due <= input.todayKey) due = toWorkingDay(plusDays(input.todayKey, 1));
  return { state: "en_cours", followUp: { step, dueDate: due } };
}

export function followUpTitle(step: 2 | 3, name: string): string {
  return (step === 2 ? `Rappeler ${name}` : `Message WhatsApp à ${name}`).slice(0, 200);
}

/** The old 092 columns still need a value: outcome and next step, from the five points. */
export function legacyColumns(input: { answeredBy: AnsweredBy; followUp: SequencePlan["followUp"] }) {
  return {
    outcome: input.answeredBy === "pas_de_reponse" ? ("pas_de_reponse" as const) : ("joint" as const),
    nextStep: input.followUp?.step === 2 ? ("rappel" as const) : ("rien" as const),
    nextAt: input.followUp?.step === 2 ? `${input.followUp.dueDate}T10:00:00.000Z` : null,
  };
}

// ---------------------------------------------------------------------------
// Daily goal and counts
// ---------------------------------------------------------------------------

export type CallCount = {
  goal: number | null;
  today: number;
  week: number;
  /** Five times the goal, minus a goal for each declared absence (PRD 2.5). */
  weekTarget: number | null;
  absentDays: number;
};

/** Counts every logged call of one person (PRD 2.2): today, and Monday to Friday of this week. */
export function countCalls(input: {
  notes: { author_id: string; created_at: string }[];
  userId: string;
  goal: number | null;
  todayKey: string;
  absentDays?: string[];
}): CallCount {
  const week = new Set(workWeek(input.todayKey));
  let today = 0;
  let inWeek = 0;
  for (const note of input.notes) {
    if (note.author_id !== input.userId) continue;
    const key = keyOf(new Date(note.created_at));
    if (key === input.todayKey) today += 1;
    if (week.has(key)) inWeek += 1;
  }
  const absent = (input.absentDays ?? []).filter((d) => week.has(d)).length;
  return {
    goal: input.goal,
    today,
    week: inWeek,
    weekTarget: input.goal ? input.goal * Math.max(0, 5 - absent) : null,
    absentDays: absent,
  };
}

/** « 12 / 20 », or just « 12 » without a goal. */
export function countLabel(done: number, target: number | null): string {
  return target ? `${done} / ${target}` : String(done);
}

// ---------------------------------------------------------------------------
// The week's numbers for « Notes d’appels » (PRD 1.8)
// ---------------------------------------------------------------------------

export type WeekStats = {
  calls: number;
  answered: number;
  yes: number;
  objections: { key: Objection; label: string; count: number }[];
  problem: { key: ProblemAnswer; label: string; count: number }[];
  interests: { key: Interest; label: string; count: number }[];
};

type StatNote = {
  created_at: string;
  answered_by: AnsweredBy | null;
  result: CallResult | null;
  objection: Objection | null;
  problem_answer: ProblemAnswer | null;
  interest: Interest | null;
};

function ranked<K extends string>(keys: K[], labels: Record<K, string>, counts: Map<K, number>) {
  return keys
    .map((key) => ({ key, label: labels[key], count: counts.get(key) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || keys.indexOf(a.key) - keys.indexOf(b.key));
}

export function weekStats(notes: StatNote[], todayKey: string): WeekStats {
  const week = new Set(workWeek(todayKey));
  const objections = new Map<Objection, number>();
  const problem = new Map<ProblemAnswer, number>();
  const interests = new Map<Interest, number>();
  let calls = 0;
  let answered = 0;
  let yes = 0;
  for (const note of notes) {
    if (!week.has(keyOf(new Date(note.created_at)))) continue;
    calls += 1;
    if (note.answered_by && note.answered_by !== "pas_de_reponse") answered += 1;
    if (note.result === "oui") yes += 1;
    if (note.objection) objections.set(note.objection, (objections.get(note.objection) ?? 0) + 1);
    if (note.problem_answer) problem.set(note.problem_answer, (problem.get(note.problem_answer) ?? 0) + 1);
    if (note.interest && note.interest !== "rien") interests.set(note.interest, (interests.get(note.interest) ?? 0) + 1);
  }
  return {
    calls,
    answered,
    yes,
    objections: ranked(OBJECTIONS, OBJECTION_LABELS, objections),
    problem: ranked(PROBLEM_ANSWERS, PROBLEM_ANSWER_LABELS, problem),
    interests: ranked(INTERESTS, INTEREST_LABELS, interests),
  };
}

/** Who may read a business's calls: its author, the Directeur and the founder (same as 092). */
export function canSeeProspectNote(viewer: { id: string; level: string }, note: { author_id: string }): boolean {
  return note.author_id === viewer.id || viewer.level === "directeur" || viewer.level === "fondateur";
}
