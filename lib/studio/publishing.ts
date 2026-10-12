// Publishing calendar: the pure rules (no database, no network), so they can
// be tested directly. Ouagadougou is UTC+0 all year, so every date here is a
// UTC calendar date ("YYYY-MM-DD") and every slot a UTC time.
//
// The approval rule comes from the field visit sheet: nothing is published
// without Salif's written OK. In the app that OK is a founder pressing
// "Valider"; staff can only hand a post over for validation.

import type { PropertyLabels, PropertyRow } from "./property-context";

export const PUBLICATION_STATUSES = ["a_faire", "a_valider", "valide", "publie", "echec"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<PublicationStatus, string> = {
  a_faire: "À faire",
  a_valider: "À valider",
  valide: "Validé",
  publie: "Publié",
  echec: "Échec",
};

export const MEDIA_TYPES = ["video", "image", "carousel", "text"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const NETWORKS = ["facebook", "instagram", "tiktok"] as const;
export type Network = (typeof NETWORKS)[number];
/** Networks the worker can publish to today. TikTok waits for TikTok's app audit. */
export const PUBLISHABLE_NETWORKS: readonly Network[] = ["facebook", "instagram"];

export const NETWORK_LABELS: Record<Network, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export const TIKTOK_PENDING_TOOLTIP =
  "TikTok garde privées (visibles par vous seul) les publications des applications non auditées. Pour publier en public, TikTok doit d'abord auditer l'application Roogo (vidéo de démonstration, respect des conditions, quelques semaines).";

export type Role = "staff" | "founder";

export function isNetwork(value: unknown): value is Network {
  return typeof value === "string" && (NETWORKS as readonly string[]).includes(value);
}

export function isMediaType(value: unknown): value is MediaType {
  return typeof value === "string" && (MEDIA_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Who may move a post from one status to another by hand. "publie" is only
 * ever set by the worker; "echec" only by the worker.
 */
export function canChangeStatus(role: Role, from: PublicationStatus, to: PublicationStatus): boolean {
  if (from === to) return false;
  if (from === "publie") return false;
  if (to === "publie" || to === "echec") return false;
  // Only a founder gives the written OK.
  if (to === "valide") {
    if (role !== "founder") return false;
    // From "echec" this is "Réessayer": the content was already approved and
    // any edit since would have sent the post back to "a_valider".
    return from === "a_faire" || from === "a_valider" || from === "echec";
  }
  if (to === "a_valider") return from === "a_faire" || from === "valide" || from === "echec";
  if (to === "a_faire") return from === "a_valider";
  return false;
}

/**
 * Retrying a failed post re-publishes content a founder already approved, so
 * staff may press "Réessayer" too (only networks that failed are retried).
 */
export function canRetry(role: Role, status: PublicationStatus, approved: boolean): boolean {
  void role;
  return status === "echec" && approved;
}

/** Fields whose change voids an approval: what goes out, where and when. */
export const CONTENT_FIELDS = ["caption", "artifact_id", "photo_urls", "media_type", "networks", "scheduled_at"] as const;

/**
 * Status after an edit. Editing approved or failed content sends it back to
 * "a_valider" so a founder sees the new version before it goes out.
 */
export function statusAfterEdit(current: PublicationStatus, contentChanged: boolean): PublicationStatus {
  if (!contentChanged) return current;
  if (current === "valide" || current === "echec") return "a_valider";
  return current;
}

// ---------------------------------------------------------------------------
// Dates, business days, slots
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDate(d);
}

/** Monday to Friday. Public holidays are not skipped (open question). */
export function isBusinessDay(iso: string): boolean {
  const day = toDate(iso).getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * J+n in business days: Thursday + 1 = Friday, Thursday + 2 = Monday.
 * Counting starts the day after the visit, whatever day the visit was.
 */
export function addBusinessDays(iso: string, n: number): string {
  let current = iso;
  let left = n;
  while (left > 0) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) left -= 1;
  }
  return current;
}

/** Monday of the week holding this date (weeks run Monday to Sunday). */
export function weekStart(iso: string): string {
  const day = toDate(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function dayLabel(iso: string): { name: string; date: string } {
  const d = toDate(iso);
  return { name: DAY_NAMES[d.getUTCDay()], date: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
}

export function weekLabel(monday: string): string {
  const sunday = addDays(monday, 6);
  const a = toDate(monday);
  const b = toDate(sunday);
  const left = a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  return `Semaine du ${left} au ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

export const DEFAULT_SLOTS = ["12:00", "19:00"] as const;
const SLOT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "12:00,19:00" from STUDIO_PUBLISH_SLOTS; anything invalid falls back to the defaults. */
export function parseSlots(raw: string | null | undefined): string[] {
  const slots = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SLOT_RE.test(s));
  const unique = [...new Set(slots)].sort();
  return unique.length ? unique : [...DEFAULT_SLOTS];
}

export function isSlot(value: unknown): value is string {
  return typeof value === "string" && SLOT_RE.test(value);
}

/** Ouagadougou time is UTC, so "19:00" on a date is that instant in UTC. */
export function slotToIso(date: string, slot: string): string {
  return `${date}T${slot}:00.000Z`;
}

export function isoToDateAndSlot(iso: string): { date: string; slot: string } {
  const d = new Date(iso);
  const s = d.toISOString();
  return { date: s.slice(0, 10), slot: s.slice(11, 16) };
}

// ---------------------------------------------------------------------------
// Visit cadence
// ---------------------------------------------------------------------------

export type CadenceStep = "presentation" | "walkthrough" | "carousel" | "tour_3d_link" | "ambiance_3d";

export type CadenceItem = {
  step: CadenceStep;
  /** Business days after the visit. */
  offset: number;
  mediaType: MediaType;
  title: string;
  networks: Network[];
  /** "first" or "last" slot of the day. */
  slot: "first" | "last";
  notes: string;
};

// Field visit sheet: J+1 presentation, J+2 walkthrough with the team's
// voice-over, J+4 photo carousel then the 3D tour link on that photo post,
// J+5 3D ambiance video.
export const VISIT_CADENCE: CadenceItem[] = [
  {
    step: "presentation",
    offset: 1,
    mediaType: "video",
    title: "Vidéo de présentation",
    networks: ["facebook", "instagram"],
    slot: "last",
    notes: "Vidéo courte de présentation du bien, filmée pendant la visite.",
  },
  {
    step: "walkthrough",
    offset: 2,
    mediaType: "video",
    title: "Visite commentée",
    networks: ["facebook", "instagram"],
    slot: "last",
    notes: "Visite complète avec la voix off de l'équipe.",
  },
  {
    step: "carousel",
    offset: 4,
    mediaType: "carousel",
    title: "Carrousel photos",
    networks: ["facebook", "instagram"],
    slot: "first",
    notes: "Entre 2 et 10 photos du bien.",
  },
  {
    step: "tour_3d_link",
    offset: 4,
    mediaType: "text",
    title: "Lien de la visite 3D",
    networks: ["facebook"],
    slot: "last",
    notes:
      "Publié en commentaire sous le carrousel photos sur Facebook (un lien n'est pas cliquable dans une légende Instagram). Collez le lien de la visite 3D dans le texte.",
  },
  {
    step: "ambiance_3d",
    offset: 5,
    mediaType: "video",
    title: "Vidéo ambiance 3D",
    networks: ["facebook", "instagram"],
    slot: "last",
    notes: "Vidéo d'ambiance tirée de la visite 3D.",
  },
];

export type PlannedPost = {
  step: CadenceStep;
  title: string;
  mediaType: MediaType;
  networks: Network[];
  scheduledAt: string;
  notes: string;
};

/** The five cadence posts for a visit on `visitDate`, on business days. */
export function planVisitCadence(visitDate: string, slots: string[] = [...DEFAULT_SLOTS]): PlannedPost[] {
  if (!isIsoDate(visitDate)) throw new Error("Date de visite invalide");
  const ordered = slots.length ? [...slots].sort() : [...DEFAULT_SLOTS];
  return VISIT_CADENCE.map((item) => {
    const date = addBusinessDays(visitDate, item.offset);
    const slot = item.slot === "first" ? ordered[0] : ordered[ordered.length - 1];
    return {
      step: item.step,
      title: item.title,
      mediaType: item.mediaType,
      networks: [...item.networks],
      scheduledAt: slotToIso(date, slot),
      notes: item.notes,
    };
  });
}

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

export const CAPTION_CLOSING = "Avec Roogo, on s'occupe de tout, de la visite jusqu'au notaire.";
export const CAPTION_CONTACT = "Appel ou WhatsApp : +226 67 00 61 16";
export const CAPTION_SITE = "roogobf.com";
export const TOUR_LINK_CAPTION = "Faites la visite 3D de ce bien depuis chez vous : ";

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** "Ouaga 2000" -> "Ouaga2000", "Saint-Léon" -> "SaintLeon". */
export function hashtagWord(text: string): string {
  return stripAccents(text)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

const TYPE_HASHTAG_WORD: Record<string, string> = {
  maison: "Maison",
  villa: "Villa",
  appartement: "Appartement",
  terrain: "Parcelle",
  commercial: "Local",
  "célibatorium": "Celibatorium",
  celibatorium: "Celibatorium",
  studio: "Studio",
  hotel: "Hotel",
};

/** #MaisonALouer, #ParcelleAVendre, #VillaALouer. */
export function typeHashtag(propertyType: string | null, listingType: string | null): string {
  const key = (propertyType ?? "").trim().toLowerCase();
  const word = TYPE_HASHTAG_WORD[key] ?? (hashtagWord(key) || "Bien");
  return `#${word}${listingType === "vendre" ? "AVendre" : "ALouer"}`;
}

export function buildHashtags(row: Pick<PropertyRow, "property_type" | "listing_type" | "quartier" | "city">, cityLabel: string): string[] {
  const city = hashtagWord(cityLabel) || "Ouagadougou";
  const quartier = hashtagWord(row.quartier ?? "");
  const tags = ["#Roogo", quartier ? `#${quartier}` : null, `#${city}`, typeHashtag(row.property_type, row.listing_type), "#ImmobilierBurkina"];
  return [...new Set(tags.filter((t): t is string => Boolean(t)))];
}

function cleanText(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*–\s*/g, ", ")
    .replace(/roogo\.bf\b/gi, "roogobf.com")
    .replace(/\s+/g, " ")
    .trim();
}

/** The first one or two sentences of the listing description, at most ~220 characters. */
export function shortDescription(description: string | null | undefined): string {
  const text = cleanText(description ?? "");
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  let out = "";
  for (const sentence of sentences.slice(0, 2)) {
    const next = (out + " " + sentence.trim()).trim();
    if (out && next.length > 220) break;
    out = next;
  }
  if (out.length > 220) out = `${out.slice(0, 217).replace(/\s+\S*$/, "")}...`;
  return /[.!?]$|\.\.\.$/.test(out) ? out : `${out}.`;
}

function fallbackDescription(row: PropertyRow, labels: PropertyLabels): string {
  const type = labels.type(row.property_type ?? undefined).toLowerCase() || "bien";
  const place = (row.quartier ?? "").trim() || labels.city(row.city);
  const offer = row.listing_type === "vendre" ? "à vendre" : row.frequence === "journalier" ? "à louer à la nuit" : "à louer";
  const rooms = row.bedrooms ? ` de ${row.bedrooms} chambre${row.bedrooms > 1 ? "s" : ""}` : "";
  const article = /^(maison|villa)\b/.test(type) ? "Une" : "Un";
  return `${article} ${type}${rooms} ${offer} à ${place}, disponible dès maintenant.`.replace(/\s+/g, " ");
}

function factLines(row: PropertyRow): string[] {
  const facts: string[] = [];
  if (row.bedrooms) facts.push(`${row.bedrooms} chambre${row.bedrooms > 1 ? "s" : ""}`);
  if (row.bathrooms) facts.push(`${row.bathrooms} salle${row.bathrooms > 1 ? "s" : ""} de bain`);
  if (row.area) facts.push(`${row.area} m²`);
  for (const amenity of row.amenities ?? []) {
    const clean = cleanText(amenity);
    if (clean && !/\bfaux\b/i.test(clean)) facts.push(clean[0].toUpperCase() + clean.slice(1));
  }
  return facts.slice(0, 3);
}

function priceLine(row: PropertyRow, labels: PropertyLabels): string | null {
  if (row.price === null || row.price === undefined || row.price === "") return null;
  const amount = `${labels.amount(row.price)} FCFA`.replace(/[  ]/g, " ");
  if (row.listing_type === "vendre") return `Prix : ${amount}`;
  return `Prix : ${amount} ${row.frequence === "journalier" ? "par nuit" : "par mois"}`;
}

/**
 * The house caption template: title in capitals (type, quartier), one or two
 * sentences, three fact lines, the price, the Roogo line, the contact, the
 * site on its own line, five hashtags.
 */
export function buildCaption(row: PropertyRow, labels: PropertyLabels): string {
  const type = labels.type(row.property_type ?? undefined) || "Bien";
  const offer = row.listing_type === "vendre" ? "à vendre" : "à louer";
  const place = (row.quartier ?? "").trim() || labels.city(row.city);
  const title = [`${type} ${offer}`, place].filter(Boolean).join(", ").toLocaleUpperCase("fr-FR");
  const description = shortDescription(row.description) || fallbackDescription(row, labels);
  const facts = factLines(row);
  const price = priceLine(row, labels);
  const blocks = [
    title,
    description.replace(/\bfaux\b/gi, "").replace(/\s+/g, " ").trim(),
    [...facts, ...(price ? [price] : [])].join("\n"),
    CAPTION_CLOSING,
    `${CAPTION_CONTACT}\n${CAPTION_SITE}`,
    buildHashtags(row, labels.city(row.city)).join(" "),
  ];
  return blocks.filter((b) => b.trim()).join("\n\n");
}

export type CaptionProblem = { code: string; message: string };

/**
 * Problems that block "Valider" (and therefore publishing). Emoji are allowed
 * in social captions, so they are not checked here.
 */
export function captionProblems(caption: string, opts: { mediaType: MediaType; step?: CadenceStep | null }): CaptionProblem[] {
  const problems: CaptionProblem[] = [];
  const text = caption ?? "";
  if (!text.trim()) return [{ code: "empty", message: "La légende est vide." }];
  if (/—/.test(text)) problems.push({ code: "em-dash", message: "Retirez le tiret long (—) : utilisez une virgule ou deux phrases." });
  if (/roogo\.bf\b/i.test(text)) problems.push({ code: "wrong-domain", message: "Le site est roogobf.com, jamais roogo.bf." });
  if (/\bfaux\b|\bfausse?s?\b/i.test(text)) {
    problems.push({ code: "faux", message: "N'utilisez pas « faux » pour un bien ou un élément de construction." });
  }
  if (opts.step === "tour_3d_link") {
    if (!/https?:\/\/\S+/i.test(text)) problems.push({ code: "tour-link", message: "Collez le lien de la visite 3D." });
  } else if (opts.mediaType !== "text" && !/^roogobf\.com$/im.test(text)) {
    problems.push({ code: "site-line", message: "Ajoutez roogobf.com sur sa propre ligne." });
  }
  if (text.length > 2200) problems.push({ code: "too-long", message: "Instagram limite la légende à 2 200 caractères." });
  if ((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > 30) {
    problems.push({ code: "hashtags", message: "Instagram limite à 30 hashtags." });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Media and networks
// ---------------------------------------------------------------------------

export type MediaCheckInput = {
  mediaType: MediaType;
  networks: Network[];
  hasArtifact: boolean;
  artifactKind?: string | null;
  photoCount: number;
  step?: CadenceStep | null;
};

/** Problems that block "Valider": the post cannot go out as described. */
export function mediaProblems(input: MediaCheckInput): CaptionProblem[] {
  const problems: CaptionProblem[] = [];
  const nets = input.networks;
  if (!nets.length) problems.push({ code: "no-network", message: "Choisissez au moins un réseau." });
  if (nets.includes("tiktok")) problems.push({ code: "tiktok", message: "TikTok n'est pas encore disponible." });
  if (input.mediaType === "text") {
    if (nets.includes("instagram")) problems.push({ code: "ig-text", message: "Instagram ne publie pas de texte seul." });
    return problems;
  }
  if (input.mediaType === "video") {
    if (!input.hasArtifact || input.artifactKind !== "video") problems.push({ code: "no-video", message: "Choisissez une vidéo du Studio." });
  } else if (input.mediaType === "image") {
    const count = (input.hasArtifact && input.artifactKind === "image" ? 1 : 0) + input.photoCount;
    if (count !== 1) problems.push({ code: "one-image", message: "Choisissez une seule image." });
  } else if (input.mediaType === "carousel") {
    if (input.photoCount < 2 || input.photoCount > 10) problems.push({ code: "carousel-size", message: "Un carrousel compte entre 2 et 10 photos." });
  }
  return problems;
}

/** Instagram accepts JPEG only. */
export function isJpegUrl(url: string): boolean {
  return /\.jpe?g(?:$|[?#])/i.test(url);
}

// ---------------------------------------------------------------------------
// Results per network
// ---------------------------------------------------------------------------

export type NetworkResult = {
  status: "published" | "failed" | "pending";
  remote_id?: string | null;
  permalink?: string | null;
  container_id?: string | null;
  error?: string | null;
  published_at?: string | null;
};

export type PublicationResults = Partial<Record<Network, NetworkResult>>;

/** Networks still to publish on this run: a retry never re-posts a network that succeeded. */
export function networksToPublish(networks: Network[], results: PublicationResults): Network[] {
  return networks.filter((n) => (PUBLISHABLE_NETWORKS as readonly string[]).includes(n) && results[n]?.status !== "published");
}

export function finalStatus(networks: Network[], results: PublicationResults): "publie" | "echec" {
  const targets = networks.filter((n) => (PUBLISHABLE_NETWORKS as readonly string[]).includes(n));
  return targets.length > 0 && targets.every((n) => results[n]?.status === "published") ? "publie" : "echec";
}

/** One readable French line for the card, e.g. "Instagram : la vidéo n'est pas prête". */
export function summarizeErrors(results: PublicationResults): string | null {
  const lines = (Object.keys(results) as Network[])
    .filter((n) => results[n]?.status !== "published" && results[n]?.error)
    .map((n) => `${NETWORK_LABELS[n]} : ${results[n]!.error}`);
  return lines.length ? lines.join(" ; ") : null;
}

/** A claim older than this means the run died mid-publish. */
export const STALE_CLAIM_MINUTES = 15;
