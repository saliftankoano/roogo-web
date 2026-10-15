// "Fiche de visite": the field visit sheet, in the app. Pure rules only (no
// imports), so the browser, the server and node:test share one source:
// the steps and their checklist (wording from the paper sheet of
// 2 October 2026, as shortened in the approved canvas), what each step needs
// before "Continuer", business days, the follow-up tasks and the planned
// publication dates, the Drive folder name and the follow-up status.
//
// Times: Ouagadougou is UTC all year, so every HH:MM here is read in UTC.

// ---------------------------------------------------------------------------
// Steps and checklist

export const STEP_COUNT = 7; // 0 Infos … 6 Tournage terminé
export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TimeKey = "depart" | "arrivee" | "departSite" | "retour";
export type ShotKey = "marche" | "photos" | "presentation" | "scan";
export type DeliverableKey = "marche" | "photos" | "presentation" | "scan" | "trajets";
export type TaskKey = "t1" | "t2" | "t3" | "t4" | "t5" | "t6";
export type FactKey = "prix" | "pieces" | "eauElec" | "documents" | "acces";

export type CheckDef = { id: string; title: string; detail: string };
export type TimeDef = { key: TimeKey; button: string; done: string; short: string };
export type StepDef = {
  title: string;
  short: string;
  sub: string;
  time?: TimeDef;
  checks: CheckDef[];
};

export const TIME_KEYS: TimeKey[] = ["depart", "arrivee", "departSite", "retour"];

export const STEPS: StepDef[] = [
  {
    title: "Informations de la visite",
    short: "Infos",
    sub: "Une fiche par sortie. Le tournage est fini quand tout est dans le Drive.",
    checks: [],
  },
  {
    title: "1. Avant de partir",
    short: "Avant de partir",
    sub: "Préparez le matériel au bureau.",
    checks: [
      { id: "a1", title: "Accord du propriétaire pour filmer et publier, confirmé", detail: "Confirmé avec lui avant de partir." },
      {
        id: "a2",
        title: "iPhone, Insta360 et micros chargés, espace libre",
        detail: "Batterie de rechange de l’Insta360 : elle filme l’aller, le scan 3D et le retour.",
      },
      {
        id: "a3",
        title: "Sac prêt",
        detail: "Chiffon microfibre dans le sac. Objectif de l’Insta360 nettoyé avant le trajet. T-shirt Roogo porté. Insta360 fixée solidement sur le casque du passager.",
      },
    ],
  },
  {
    title: "2. Départ du bureau",
    short: "Départ du bureau",
    sub: "Le passager filme le trajet. Le conducteur ne touche jamais la caméra.",
    time: { key: "depart", button: "Nous partons du bureau", done: "Départ du bureau", short: "Départ" },
    checks: [
      { id: "b1", title: "Le passager a lancé l’enregistrement de l’Insta360 sur son casque", detail: "Avant le départ." },
    ],
  },
  {
    title: "3. Sur place",
    short: "Sur place",
    sub: "Dans cet ordre. Le son compte plus que tout.",
    time: { key: "arrivee", button: "Nous sommes arrivés", done: "Arrivés sur place", short: "Arrivée" },
    checks: [
      {
        id: "c1",
        title: "Enregistrement du trajet arrêté et objectifs nettoyés",
        detail: "Objectifs de l’iPhone et de l’Insta360 nettoyés avec le chiffon microfibre avant de commencer à filmer.",
      },
    ],
  },
  {
    title: "4. Départ du site",
    short: "Départ du site",
    sub: "On vérifie avant de partir, pas au bureau.",
    time: { key: "departSite", button: "Nous quittons le site", done: "Départ du site", short: "Fin sur place" },
    checks: [
      { id: "d1", title: "Au moins un extrait de son réécouté", detail: "Tous les éléments de la partie 3 sont enregistrés." },
      { id: "d2", title: "Objectifs nettoyés après utilisation", detail: "iPhone et Insta360, avec le chiffon microfibre." },
      { id: "d3", title: "Le passager relance l’enregistrement de l’Insta360 pour le retour", detail: "De préférence par une autre route qu’à l’aller." },
    ],
  },
  {
    title: "5. Retour au bureau",
    short: "Retour au bureau",
    sub: "Le jour même, obligatoire. Rien sur WhatsApp, tout dans le Drive.",
    time: { key: "retour", button: "Nous sommes de retour", done: "Retour au bureau", short: "Retour" },
    checks: [
      {
        id: "e1",
        title: "Photos et vidéos supprimées des appareils (iPhone, Insta360)",
        detail: "Seulement après avoir vérifié que tout est bien dans le Drive. Jamais avant.",
      },
    ],
  },
  {
    title: "Tournage terminé",
    short: "Terminé",
    sub: "Phases suivantes : montage, validation par Salif, publication.",
    checks: [],
  },
];

/** The check that can only be ticked once every deliverable is in the Drive. */
export const DELETE_CHECK_ID = "e1";

export const ALL_CHECK_IDS = STEPS.flatMap((s) => s.checks.map((c) => c.id));

export type ShotDef = { key: ShotKey; title: string; tip: string };

/** Step 3, in this order (paper sheet 3e partie). Ticks only: the files go up at step 5. */
export const SHOTS: ShotDef[] = [
  { key: "marche", title: "1er : vidéo de marche sans parler", tip: "Pour la voix off. Plusieurs angles, mouvements lents et stables, extérieur et chaque pièce." },
  {
    key: "photos",
    title: "2e : photos verticales ET horizontales",
    tip: "Chaque pièce, vue d’ensemble de la maison, porte et entrée, le quartier autour. Éviter les visages des habitants, surtout des enfants.",
  },
  {
    key: "presentation",
    title: "3e : vidéo de présentation",
    tip: "Face caméra, avec le micro. Test de 10 secondes écouté au casque avant la vraie prise. Pas de vent, de motos, de musique ni de bruit derrière. Un mauvais son n’est pas pardonnable.",
  },
  { key: "scan", title: "4e : scan 3D Insta360", tip: "De tout le bien." },
];

export const SHOT_KEYS: ShotKey[] = SHOTS.map((s) => s.key);

export type FactDef = { key: FactKey; label: string; placeholder: string; wide?: boolean };

export const FACTS: FactDef[] = [
  { key: "prix", label: "Prix", placeholder: "85 000 / mois" },
  { key: "pieces", label: "Pièces", placeholder: "3 chambres, salon" },
  { key: "eauElec", label: "Eau et électricité", placeholder: "ONEA, SONABEL" },
  { key: "documents", label: "Documents", placeholder: "PUH, titre…" },
  { key: "acces", label: "Accès (route, voiture, distance de la grande route)", placeholder: "Goudron, voiture OK, 300 m", wide: true },
];

export const FACT_KEYS: FactKey[] = FACTS.map((f) => f.key);

export type DeliverableDef = {
  key: DeliverableKey;
  label: string;
  /** Drive subfolder inside the visit folder. */
  folder: string;
  /** The file picker filter. */
  accept: string;
  one: string;
  many: string;
  /** Which kinds of file the server takes for it. */
  kinds: ("photo" | "video" | "file")[];
};

/** Step 5: one button per deliverable, one Drive subfolder each. */
export const DELIVERABLES: DeliverableDef[] = [
  { key: "marche", label: "Vidéos de marche", folder: "Vidéos de marche", accept: "video/*", one: "vidéo", many: "vidéos", kinds: ["video"] },
  { key: "photos", label: "Photos", folder: "Photos", accept: "image/*", one: "photo", many: "photos", kinds: ["photo"] },
  { key: "presentation", label: "Vidéos de présentation", folder: "Vidéos de présentation", accept: "video/*", one: "vidéo", many: "vidéos", kinds: ["video"] },
  // Insta360 files (.insv, .insp) are neither image/* nor video/* for the browser.
  { key: "scan", label: "Scan 3D", folder: "Scan 3D", accept: "*/*", one: "fichier", many: "fichiers", kinds: ["photo", "video", "file"] },
  { key: "trajets", label: "Trajets aller et retour", folder: "Trajets aller et retour", accept: "video/*,.insv,.mp4,.mov", one: "vidéo", many: "vidéos", kinds: ["video", "file"] },
];

export const DELIVERABLE_KEYS: DeliverableKey[] = DELIVERABLES.map((d) => d.key);

export function isDeliverableKey(value: unknown): value is DeliverableKey {
  return typeof value === "string" && (DELIVERABLE_KEYS as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The sheet as the browser keeps it (and sends on every save)

export type FicheLocation = {
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
};

export type FicheData = {
  id: string;
  propertyId: string;
  kind: "location" | "vente";
  person1Id: string | null;
  person2Id: string | null;
  step: StepIndex;
  visitDate: string;
  checks: Record<string, string>;
  times: Partial<Record<TimeKey, string>>;
  shots: Partial<Record<ShotKey, string>>;
  location: FicheLocation | null;
  locationSkipped: string | null;
  facts: Partial<Record<FactKey, string>>;
  batchWarnings: string[];
  taskOwners: Partial<Record<TaskKey, string>>;
  /** Device time of the last change. */
  updatedAt: string;
};

export type UploadCount = { ready: number; uploading: number; failed: number; bytes: number; seconds: number };
export type UploadSummary = Partial<Record<DeliverableKey, UploadCount>>;

export function emptyCount(): UploadCount {
  return { ready: 0, uploading: 0, failed: 0, bytes: 0, seconds: 0 };
}

/** Every deliverable has at least one file fully in the Drive. */
export function allUploaded(summary: UploadSummary | null | undefined): boolean {
  return DELIVERABLE_KEYS.every((key) => (summary?.[key]?.ready ?? 0) > 0);
}

export function missingDeliverables(summary: UploadSummary | null | undefined): DeliverableDef[] {
  return DELIVERABLES.filter((d) => (summary?.[d.key]?.ready ?? 0) === 0);
}

export function teamIds(data: Pick<FicheData, "person1Id" | "person2Id">): string[] {
  return [data.person1Id, data.person2Id].filter((id): id is string => !!id);
}

/**
 * Adds or removes a person, two at most. The first chosen is "personne 1"
 * (presentation video, 3D, sending to Salif), the second "personne 2".
 */
export function toggleTeam(
  data: Pick<FicheData, "person1Id" | "person2Id">,
  id: string,
): Pick<FicheData, "person1Id" | "person2Id"> {
  const team = teamIds(data);
  if (team.includes(id)) {
    const rest = team.filter((t) => t !== id);
    return { person1Id: rest[0] ?? null, person2Id: rest[1] ?? null };
  }
  if (team.length >= 2) return { person1Id: data.person1Id, person2Id: data.person2Id };
  return { person1Id: team[0] ?? id, person2Id: team[0] ? id : null };
}

export type Readiness = { ready: boolean; missing: string[] };

/** What the step still needs before "Continuer" (the canvas hint "Il manque : …"). */
export function stepReadiness(data: FicheData, uploads: UploadSummary | null | undefined): Readiness {
  const step = STEPS[data.step];
  const missing: string[] = [];
  if (data.step === 0 && teamIds(data).length === 0) missing.push("l’équipe");
  if (step.time && !data.times[step.time.key]) missing.push("l’heure");
  if (step.checks.some((c) => !data.checks[c.id])) missing.push("les cases");
  if (data.step === 3) {
    if (!data.location && !data.locationSkipped) missing.push("la position");
    if (SHOT_KEYS.some((k) => !data.shots[k])) missing.push("les 4 prises");
  }
  if (data.step === 5 && !allUploaded(uploads)) missing.push("l’envoi au Drive");
  return { ready: missing.length === 0, missing };
}

export function missingSentence(missing: string[]): string {
  return missing.length ? `Il manque : ${missing.join(", ")}.` : "Tout est bon pour cette étape.";
}

/** Steps 1 to 5 are all complete: the sheet can be sent to the team. */
export function canFinish(data: FicheData, uploads: UploadSummary | null | undefined): Readiness {
  const missing = new Set<string>();
  for (let step = 0; step <= 5; step += 1) {
    for (const item of stepReadiness({ ...data, step: step as StepIndex }, uploads).missing) missing.add(item);
  }
  return { ready: missing.size === 0, missing: [...missing] };
}

// ---------------------------------------------------------------------------
// "Cochez sur place": three ticks within 20 seconds

export const BATCH_WINDOW_MS = 20_000;
export const BATCH_COUNT = 3;

/** Keeps the ticks of the last 20 seconds and says whether the notice should show. */
export function noteTick(recent: number[], now: number): { recent: number[]; warn: boolean } {
  const kept = [...recent.filter((t) => now - t < BATCH_WINDOW_MS), now];
  if (kept.length >= BATCH_COUNT) return { recent: [], warn: true };
  return { recent: kept, warn: false };
}

// ---------------------------------------------------------------------------
// Dates: business days (Monday to Friday)

const DAY_MS = 86_400_000;
const WEEKDAYS_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const WEEKDAYS_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function fromDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function isDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDayKey(fromDayKey(value)) === value;
}

export function isBusinessDay(key: string): boolean {
  const day = fromDayKey(key).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * The n-th business day after `key` (Monday to Friday; Saturday and Sunday
 * are skipped). A visit on a Thursday: J+1 Friday, J+2 Monday, J+4 Wednesday,
 * J+5 Thursday (paper sheet, section 6). Burkina public holidays are NOT
 * handled yet: they count as working days.
 */
export function addBusinessDays(key: string, n: number): string {
  let date = fromDayKey(key);
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    date = new Date(date.getTime() + DAY_MS);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return toDayKey(date);
}

/** "jeu. 15 oct." */
export function shortDate(key: string): string {
  const d = fromDayKey(key);
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "Mer. 14 octobre" */
export function visitDateLabel(key: string): string {
  const d = fromDayKey(key);
  const day = WEEKDAYS_LONG[d.getUTCDay()];
  return `${day.charAt(0).toUpperCase()}${day.slice(1, 3)}. ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`;
}

/** HH:MM in Ouagadougou of an ISO instant, or "" */
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "1 h 10", "45 min" */
export function durationLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}

/** "3 min 10" for a video length in seconds. */
export function videoLengthLabel(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} min ${pad(s)}` : `${m} min`;
}

// ---------------------------------------------------------------------------
// Tournage terminé: tasks and planned publications

export type TaskDef = { key: TaskKey; title: string; person: 1 | 2; days: number; dueTime: string | null; deliverable?: string };

/** Created in the assignees' briefings when the sheet is sent (approved canvas). */
export const TASK_DEFS: TaskDef[] = [
  { key: "t1", title: "Monter la vidéo de présentation", person: 1, days: 1, dueTime: "12:00", deliverable: "presentation" },
  { key: "t2", title: "Voix off et montage de la vidéo de marche", person: 2, days: 1, dueTime: null, deliverable: "marche" },
  { key: "t3", title: "Choisir les photos et préparer le carrousel", person: 2, days: 1, dueTime: null, deliverable: "carrousel" },
  { key: "t4", title: "Monter la visite 3D et la mettre en ligne", person: 1, days: 1, dueTime: null, deliverable: "visite3d" },
  { key: "t5", title: "Vidéo de la visite 3D avec musique", person: 1, days: 1, dueTime: null, deliverable: "video3d" },
  { key: "t6", title: "Envoyer les 5 livrables à Salif pour validation", person: 1, days: 1, dueTime: "17:00" },
];

export const TASK_KEYS: TaskKey[] = TASK_DEFS.map((t) => t.key);

export type PlannedTask = TaskDef & { ownerId: string; dueDate: string };

/** The six tasks with their owner (the canvas default, or the one chosen) and due date. */
export function plannedTasks(
  visitDate: string,
  team: { person1Id: string; person2Id: string | null },
  owners: Partial<Record<TaskKey, string>> = {},
): PlannedTask[] {
  const allowed = [team.person1Id, team.person2Id].filter(Boolean) as string[];
  return TASK_DEFS.map((def) => {
    const fallback = def.person === 2 && team.person2Id ? team.person2Id : team.person1Id;
    const chosen = owners[def.key];
    return {
      ...def,
      ownerId: chosen && allowed.includes(chosen) ? chosen : fallback,
      dueDate: addBusinessDays(visitDate, def.days),
    };
  });
}

/** The next person of the team for a task (tap the name to change it). */
export function nextOwner(current: string, team: string[]): string {
  if (!team.length) return current;
  const index = team.indexOf(current);
  return team[(index + 1) % team.length];
}

export type PublicationKey = "presentation" | "marche" | "carrousel" | "video3d";
export type PublicationDef = { key: PublicationKey; days: number; title: string; platforms: string };

/** Section 6 of the paper sheet, in business days after the visit. */
export const PUBLICATION_DEFS: PublicationDef[] = [
  { key: "presentation", days: 1, title: "Vidéo de présentation", platforms: "Facebook, Instagram, TikTok" },
  { key: "marche", days: 2, title: "Vidéo de marche avec voix off", platforms: "Facebook, Instagram, TikTok" },
  { key: "carrousel", days: 4, title: "Carrousel photos + lien de la visite 3D", platforms: "Facebook, Instagram" },
  { key: "video3d", days: 5, title: "Vidéo de la visite 3D avec musique", platforms: "Facebook, Instagram, TikTok" },
];

export type PlannedPublication = PublicationDef & { date: string };

export function plannedPublications(visitDate: string): PlannedPublication[] {
  return PUBLICATION_DEFS.map((def) => ({ ...def, date: addBusinessDays(visitDate, def.days) }));
}

/** Stored on the sheet as deliverable_dates: {"presentation": "2026-10-15", ...}. */
export function deliverableDates(visitDate: string): Record<PublicationKey, string> {
  return Object.fromEntries(plannedPublications(visitDate).map((p) => [p.key, p.date])) as Record<PublicationKey, string>;
}

/** The note under the tasks: says when the weekend moved the dates. */
export function businessDayNote(visitDate: string): string {
  // As in the canvas: the note changes when J+1 or J+2 lands on a Monday.
  const crosses = [1, 2].some((days) => fromDayKey(addBusinessDays(visitDate, days)).getUTCDay() === 1);
  return crosses
    ? "Le week-end ne compte pas : les dates sautent samedi et dimanche."
    : "Jours ouvrables : du lundi au vendredi.";
}

export function taskSourceKey(visitId: string, key: TaskKey): string {
  return `field-visit:${visitId}:${key}`;
}

// ---------------------------------------------------------------------------
// Property, Drive folder, WhatsApp

const TYPE_WORDS: Record<string, string> = {
  villa: "villa",
  appartement: "appartement",
  maison: "maison",
  terrain: "terrain",
  commercial: "local commercial",
  "célibatorium": "célibatorium",
  hotel: "hôtel",
};

export type PropertyBits = {
  property_type?: string | null;
  quartier?: string | null;
  city?: string | null;
  bedrooms?: number | null;
  area?: number | null;
};

/** "Tampouy, appartement 3 ch", "Loumbila, terrain 216 m²". */
export function visitTitle(property: PropertyBits): string {
  const type = property.property_type ? (TYPE_WORDS[property.property_type] ?? property.property_type) : "bien";
  const size =
    property.property_type === "terrain"
      ? property.area
        ? ` ${property.area} m²`
        : ""
      : property.bedrooms
        ? ` ${property.bedrooms} ch`
        : "";
  const place = (property.quartier || property.city || "").trim();
  return place ? `${place}, ${type}${size}` : `${type.charAt(0).toUpperCase()}${type.slice(1)}${size}`;
}

function tidy(part: string): string {
  return part
    .replace(/[\\/]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The visit folder inside Vente or Location: "LOC-023 Tampouy appartement 3 ch" (approved canvas). */
export function visitFolderName(reference: string | null | undefined, title: string): string {
  const code = tidy(reference ?? "") || "SANS-CODE";
  return `${code} ${tidy(title)}`.trim().slice(0, 200);
}

export function topFolderFor(kind: "location" | "vente"): "Vente" | "Location" {
  return kind === "vente" ? "Vente" : "Location";
}

/** The optional "Aussi sur WhatsApp" message: "Départ du bureau : 09:05, Tampouy (LOC-023)". */
export function whatsappText(label: string, time: string, place: string, reference: string | null): string {
  const where = [place, reference ? `(${reference})` : ""].filter(Boolean).join(" ");
  return `${label} : ${time}${where ? `, ${where}` : ""}`;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Prefill from the listing

const WATER = /(eau|onea|forage|puits)/i;
const POWER = /(électricité|electricite|sonabel|solaire)/i;

export function formatFcfa(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Facts for the captions, from the listing where it has them. Never overwrites what the team typed. */
export function prefillFacts(property: {
  price?: number | null;
  listing_type?: string | null;
  period?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  property_type?: string | null;
  amenities?: string[] | null;
}): Partial<Record<FactKey, string>> {
  const facts: Partial<Record<FactKey, string>> = {};
  if (property.price && property.price > 0) {
    const rent = property.listing_type !== "vendre";
    facts.prix = `${formatFcfa(property.price)} FCFA${rent ? " / mois" : ""}`;
  }
  if (property.property_type !== "terrain") {
    const parts: string[] = [];
    if (property.bedrooms) parts.push(`${property.bedrooms} chambre${property.bedrooms > 1 ? "s" : ""}`);
    if (property.bathrooms) parts.push(`${property.bathrooms} salle${property.bathrooms > 1 ? "s" : ""} de bain`);
    if (parts.length) facts.pieces = parts.join(", ");
  }
  const amenities = property.amenities ?? [];
  const utilities = [amenities.find((a) => WATER.test(a)), amenities.find((a) => POWER.test(a))].filter(Boolean) as string[];
  if (utilities.length) facts.eauElec = [...new Set(utilities)].join(", ");
  return facts;
}

// ---------------------------------------------------------------------------
// Checking what a device sends

function isIso(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function cleanTimes<K extends string>(value: unknown, keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (!value || typeof value !== "object") return out;
  for (const key of keys) {
    const v = (value as Record<string, unknown>)[key];
    if (isIso(v)) out[key] = new Date(v).toISOString();
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Validates a sheet sent by a device. Unknown keys are dropped, sizes are capped. */
export function parseFiche(body: unknown): { error: string } | { value: FicheData } {
  if (!body || typeof body !== "object") return { error: "Fiche illisible." };
  const b = body as Record<string, unknown>;
  if (!isUuid(b.id)) return { error: "Identifiant de fiche manquant." };
  if (!isUuid(b.propertyId)) return { error: "Bien manquant." };
  const kind = b.kind === "vente" ? "vente" : b.kind === "location" ? "location" : null;
  if (!kind) return { error: "Location ou vente ?" };
  const person1Id = b.person1Id == null ? null : isUuid(b.person1Id) ? b.person1Id : undefined;
  const person2Id = b.person2Id == null ? null : isUuid(b.person2Id) ? b.person2Id : undefined;
  if (person1Id === undefined || person2Id === undefined) return { error: "Équipe illisible." };
  if (!person1Id && person2Id) return { error: "Équipe illisible." };
  if (person1Id && person1Id === person2Id) return { error: "La même personne est choisie deux fois." };
  const step = Number(b.step);
  if (!Number.isInteger(step) || step < 0 || step > 6) return { error: "Étape inconnue." };
  if (!isDayKey(b.visitDate)) return { error: "Date de visite illisible." };

  let location: FicheLocation | null = null;
  if (b.location && typeof b.location === "object") {
    const l = b.location as Record<string, unknown>;
    const lat = Number(l.lat);
    const lng = Number(l.lng);
    const accuracy = l.accuracy == null ? null : Number(l.accuracy);
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || !isIso(l.at)) return { error: "Position illisible." };
    location = { lat, lng, accuracy: accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null, at: new Date(l.at).toISOString() };
  }

  const facts: Partial<Record<FactKey, string>> = {};
  if (b.facts && typeof b.facts === "object") {
    for (const key of FACT_KEYS) {
      const v = (b.facts as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) facts[key] = v.slice(0, 300);
    }
  }

  const owners: Partial<Record<TaskKey, string>> = {};
  if (b.taskOwners && typeof b.taskOwners === "object") {
    for (const key of TASK_KEYS) {
      const v = (b.taskOwners as Record<string, unknown>)[key];
      if (isUuid(v)) owners[key] = v;
    }
  }

  const warnings = Array.isArray(b.batchWarnings) ? b.batchWarnings.filter(isIso).slice(-50).map((v) => new Date(v).toISOString()) : [];

  return {
    value: {
      id: b.id,
      propertyId: b.propertyId,
      kind,
      person1Id,
      person2Id,
      step: step as StepIndex,
      visitDate: b.visitDate,
      checks: cleanTimes(b.checks, ALL_CHECK_IDS),
      times: cleanTimes(b.times, TIME_KEYS),
      shots: cleanTimes(b.shots, SHOT_KEYS),
      location,
      locationSkipped: typeof b.locationSkipped === "string" && b.locationSkipped.trim() ? b.locationSkipped.slice(0, 200) : null,
      facts,
      batchWarnings: warnings,
      taskOwners: owners,
      updatedAt: isIso(b.updatedAt) ? new Date(b.updatedAt).toISOString() : new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Follow-up (Directeur and Fondateur)

export type FicheStatusTone = "green" | "amber" | "red" | "blue" | "grey";
export type FicheStatus = { label: string; tone: FicheStatusTone };

export function ficheStatus(
  visit: {
    status: "en_cours" | "termine" | "abandonne";
    step: number;
    times: Partial<Record<TimeKey, string>>;
    uploads: UploadSummary | null;
    tasksDone?: number;
  },
  now: Date,
): FicheStatus {
  if (visit.status === "abandonne") return { label: "Abandonnée", tone: "grey" };
  if (visit.status === "termine") {
    const done = visit.tasksDone ?? 0;
    if (done >= 5) return { label: "Livrables 5 sur 5", tone: "green" };
    if (done > 0) return { label: `Livrables ${done} sur 5`, tone: "blue" };
    return { label: "Tournage terminé", tone: "green" };
  }
  if (visit.times.retour) {
    const missing = missingDeliverables(visit.uploads).length;
    return missing ? { label: missing > 1 ? `${missing} types de fichiers manquants` : "1 type de fichier manquant", tone: "red" } : { label: "Retour, fiche à envoyer", tone: "amber" };
  }
  if (visit.times.departSite) return { label: "Sur la route du retour", tone: "amber" };
  if (visit.times.arrivee) {
    return { label: `Sur place depuis ${durationLabel(now.getTime() - Date.parse(visit.times.arrivee))}`, tone: "amber" };
  }
  if (visit.times.depart) return { label: "En route", tone: "amber" };
  return { label: "En cours", tone: "grey" };
}

/** The four phases of the paper sheet. */
export type PhaseState = "done" | "current" | "todo";
export type Phase = { key: "tournage" | "montage" | "validation" | "publication"; label: string; value: string; state: PhaseState };

export function phasesFor(visit: {
  status: "en_cours" | "termine" | "abandonne";
  tasks: { key: TaskKey; status: "a_faire" | "fait" | "reportee" }[];
  firstPublication: string | null;
}): Phase[] {
  const done = (key: TaskKey) => visit.tasks.some((t) => t.key === key && t.status === "fait");
  const montageDone = (["t1", "t2", "t3", "t4", "t5"] as TaskKey[]).filter(done).length;
  const shot = visit.status === "termine";
  const sent = done("t6");
  return [
    { key: "tournage", label: "1. Tournage", value: shot ? "Terminé" : "En cours", state: shot ? "done" : "current" },
    {
      key: "montage",
      label: "2. Montage",
      value: !shot ? "À venir" : montageDone === 5 ? "Terminé" : `En cours, ${montageDone} sur 5`,
      state: !shot ? "todo" : montageDone === 5 ? "done" : "current",
    },
    {
      key: "validation",
      label: "3. Validation Salif",
      value: sent ? "Livrables envoyés à Salif" : "À venir",
      state: sent ? "current" : "todo",
    },
    {
      key: "publication",
      label: "4. Publication",
      value: visit.firstPublication ? `À partir du ${shortDate(visit.firstPublication)}` : "À venir",
      state: "todo",
    },
  ];
}

/** Total and on-site time of a visit from its four times: "2 h 45 au total, dont 1 h 35 sur place." */
export function timingSentence(times: Partial<Record<TimeKey, string>>): string {
  const t = (k: TimeKey) => (times[k] ? Date.parse(times[k]!) : NaN);
  const parts: string[] = [];
  if (Number.isFinite(t("depart")) && Number.isFinite(t("retour"))) parts.push(`${durationLabel(t("retour") - t("depart"))} au total`);
  if (Number.isFinite(t("arrivee")) && Number.isFinite(t("departSite"))) {
    const site = durationLabel(t("departSite") - t("arrivee"));
    parts.push(parts.length ? `dont ${site} sur place` : `${site} sur place`);
  }
  return parts.length ? `${parts.join(", ")}.` : "";
}
