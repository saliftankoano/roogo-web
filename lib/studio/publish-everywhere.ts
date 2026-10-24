// « Publier une vidéo » (PRD 2 and 3, approved by Salif on 2026-10-23): the
// pure rules. One finished vertical video, every network, after Salif's
// « Valider », with one text per network written from one base.
//
// No value imports (node:test loads this file directly), only types. The
// hashtag word rule repeats hashtagWord() in ./publishing.ts on purpose; a
// test checks both give the same result so they cannot drift apart.

import type { Network, NetworkResult, PublicationResults } from "./publishing";

// ---------------------------------------------------------------------------
// Destinations. YouTube Shorts (2026-10-24) can be ticked once the channel is
// connected with youtube.upload (canUpload); otherwise it is shown disabled
// with the reason, like the other networks.
// ---------------------------------------------------------------------------

export const DESTINATIONS = ["facebook", "instagram", "tiktok", "youtube"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const DESTINATION_LABELS: Record<Destination, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

/** What each destination publishes, shown under the name. */
export const DESTINATION_FORMATS: Record<Destination, string> = {
  facebook: "Reels",
  instagram: "Reels",
  tiktok: "Vidéo",
  youtube: "Shorts",
};

export function isDestination(value: unknown): value is Destination {
  return typeof value === "string" && (DESTINATIONS as readonly string[]).includes(value);
}

export type DestinationOption = {
  id: Destination;
  label: string;
  available: boolean;
  /** Why it cannot be ticked (French), null when it can. */
  reason: string | null;
};

export type DestinationStatusInput = {
  facebook: boolean;
  instagram: boolean;
  tiktok: { enabled: boolean; reason: string | null } | null;
  /** lib/social/youtube-token-server.ts youtubePublishStatus(). */
  youtube?: { enabled: boolean; reason: string | null } | null;
};

/** The four destinations in display order, with whether each can be ticked. */
export function destinationOptions(input: DestinationStatusInput): DestinationOption[] {
  return [
    {
      id: "facebook",
      label: DESTINATION_LABELS.facebook,
      available: input.facebook,
      reason: input.facebook ? null : "Facebook n'est pas connecté (META_GRAPH_TOKEN, META_PAGE_ID).",
    },
    {
      id: "instagram",
      label: DESTINATION_LABELS.instagram,
      available: input.instagram,
      reason: input.instagram ? null : "Instagram n'est pas connecté (META_GRAPH_TOKEN, META_IG_ACCOUNT_ID).",
    },
    {
      id: "tiktok",
      label: DESTINATION_LABELS.tiktok,
      available: Boolean(input.tiktok?.enabled),
      reason: input.tiktok?.enabled ? null : input.tiktok?.reason ?? "TikTok n'est pas connecté pour la publication.",
    },
    {
      id: "youtube",
      label: DESTINATION_LABELS.youtube,
      available: Boolean(input.youtube?.enabled),
      reason: input.youtube?.enabled ? null : input.youtube?.reason ?? "La chaîne YouTube n'est pas connectée (Studio, Statistiques, Connecter YouTube).",
    },
  ];
}

/** Every destination that can be ticked is ticked by default (PRD 2.2). */
export function defaultTicks(options: readonly DestinationOption[]): Destination[] {
  return options.filter((o) => o.available).map((o) => o.id);
}

/** What the team ticked, minus anything that cannot be published. */
export function ticksToNetworks(ticks: readonly string[], options: readonly DestinationOption[]): Network[] {
  const allowed = new Set(options.filter((o) => o.available).map((o) => o.id));
  return [...new Set(ticks)].filter((t): t is Network => allowed.has(t as Destination));
}

// ---------------------------------------------------------------------------
// The video: checked in the browser before any byte is sent, and again on the
// server with what Drive measured.
// ---------------------------------------------------------------------------

export const FINAL_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const FINAL_VIDEO_MAX_SECONDS = 180;
/** A 3:00 export often lasts 180.03 s. */
const DURATION_TOLERANCE_SECONDS = 0.5;
const VERTICAL_RATIO = 9 / 16;
const RATIO_TOLERANCE = 0.02;

export type FinalVideoFacts = {
  fileName: string;
  mimeType: string | null | undefined;
  sizeBytes: number;
  durationSeconds: number | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
};

export type FinalVideoCheck =
  | { ok: true; mimeType: "video/mp4" | "video/quicktime"; ext: "mp4" | "mov" }
  | { ok: false; code: "format" | "empty" | "too-big" | "unreadable" | "too-long" | "not-vertical"; message: string };

/** "2 min 05 s", "45 s". */
export function durationLabel(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (!m) return `${s} s`;
  return `${m} min ${String(s).padStart(2, "0")} s`;
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024)).toLocaleString("fr-FR")} Mo`;
}

/** MP4 or MOV, from the MIME type or, when iOS sends none, the extension. */
export function finalVideoType(mimeType: string | null | undefined, fileName: string): { mimeType: "video/mp4" | "video/quicktime"; ext: "mp4" | "mov" } | null {
  const mime = (mimeType ?? "").toLowerCase().trim();
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (mime === "video/mp4" || (!mime && (ext === "mp4" || ext === "m4v"))) return { mimeType: "video/mp4", ext: "mp4" };
  if (mime === "video/quicktime" || (!mime && ext === "mov")) return { mimeType: "video/quicktime", ext: "mov" };
  if (mime === "" || mime === "application/octet-stream") {
    if (ext === "mp4" || ext === "m4v") return { mimeType: "video/mp4", ext: "mp4" };
    if (ext === "mov") return { mimeType: "video/quicktime", ext: "mov" };
  }
  return null;
}

/**
 * PRD 2.1 and 2.3: one vertical 9:16 video, MP4 or MOV, at most 3 minutes and
 * 500 MB. Refused before the upload with a French message. A video whose
 * length or size the browser cannot read is refused too: nothing would then
 * stop a horizontal or 10-minute video from reaching Salif.
 */
export function checkFinalVideo(facts: FinalVideoFacts): FinalVideoCheck {
  const type = finalVideoType(facts.mimeType, facts.fileName);
  if (!type) return { ok: false, code: "format", message: "Seules les vidéos MP4 ou MOV sont acceptées." };
  if (!Number.isFinite(facts.sizeBytes) || facts.sizeBytes <= 0) return { ok: false, code: "empty", message: "Cette vidéo est vide." };
  if (facts.sizeBytes > FINAL_VIDEO_MAX_BYTES) {
    return {
      ok: false,
      code: "too-big",
      message: `Vidéo trop lourde (${megabytes(facts.sizeBytes)}). 500 Mo au plus : exportez-la en 1080p.`,
    };
  }
  const duration = Number(facts.durationSeconds);
  const width = Number(facts.width);
  const height = Number(facts.height);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return {
      ok: false,
      code: "unreadable",
      message: "Ce navigateur ne lit pas cette vidéo, son format ne peut pas être vérifié. Exportez-la en MP4 (H.264) ou envoyez-la depuis le téléphone.",
    };
  }
  if (duration > FINAL_VIDEO_MAX_SECONDS + DURATION_TOLERANCE_SECONDS) {
    return {
      ok: false,
      code: "too-long",
      message: `Vidéo trop longue (${durationLabel(duration)}). Les Reels et les Shorts s'arrêtent à 3 minutes.`,
    };
  }
  if (width >= height) {
    return {
      ok: false,
      code: "not-vertical",
      message: `Cette vidéo est ${width === height ? "carrée" : "horizontale"} (${width} x ${height}). Seules les vidéos verticales 9:16 sont acceptées, comme un Reel.`,
    };
  }
  if (Math.abs(width / height - VERTICAL_RATIO) > RATIO_TOLERANCE) {
    return {
      ok: false,
      code: "not-vertical",
      message: `Format ${width} x ${height} : seules les vidéos verticales 9:16 sont acceptées (par exemple 1080 x 1920).`,
    };
  }
  return { ok: true, ...type };
}

// ---------------------------------------------------------------------------
// Drive: the copy in Videos › « Vidéos finales », moved to « Publié ».
// ---------------------------------------------------------------------------

/** The team's folders (Salif, 2026-10-23). Used when the names cannot be found. */
export const DEFAULT_FINAL_VIDEOS_FOLDER_ID = "1F0c8fvcSe8jRebUS5AG6c9OdWlr57DZC";
export const DEFAULT_PUBLISHED_VIDEOS_FOLDER_ID = "134K4IcaN7NyuaVKcCANJxd062aR22LZ9";
export const FINAL_VIDEOS_PATH = ["Videos", "Vidéos finales"] as const;
export const PUBLISHED_SUBFOLDER = "Publié";

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Folder names compared without accents, case or extra spaces ("Vidéos finales" = "videos finales"). */
export function folderNameKey(name: string): string {
  return stripAccents(name).toLowerCase().replace(/\s+/g, " ").trim();
}

function tidyName(part: string): string {
  return part
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Villa Balkuy" from the listing: type then quartier (city when there is none). */
export function listingVideoTitle(typeLabel: string | null | undefined, quartier: string | null | undefined, city?: string | null): string {
  return [tidyName(typeLabel ?? ""), tidyName(quartier ?? "") || tidyName(city ?? "")].filter(Boolean).join(" ");
}

/**
 * PRD 2.4: the French descriptive name of the Drive copy, for example
 * « Roogo - Villa Balkuy - 2026-10-23.mp4 ». The date is Ouagadougou's (UTC).
 */
export function finalVideoDriveName(input: { title: string; date: Date | string; ext: string }): string {
  const day = typeof input.date === "string" ? input.date.slice(0, 10) : input.date.toISOString().slice(0, 10);
  const ext = input.ext.replace(/^\./, "").toLowerCase() === "mov" ? "mov" : "mp4";
  let title = tidyName(input.title).replace(/^roogo\s*-\s*/i, "").replace(/\.(mp4|mov|m4v)$/i, "");
  if (!title) title = "Vidéo";
  if (title.length > 120) title = title.slice(0, 120).replace(/\s+\S*$/, "");
  return `Roogo - ${title} - ${day}.${ext}`;
}

/** The title typed by the team, or a readable one from the file name ("IMG_2041.MOV" stays as is). */
export function titleFromFileName(fileName: string): string {
  const base = (fileName.split(/[\\/]/).pop() ?? "").replace(/\.[a-z0-9]{2,4}$/i, "");
  return tidyName(base.replace(/[_]+/g, " ")).slice(0, 120);
}

export type DriveFolderLister = (parentId: string) => Promise<Array<{ id: string; name: string; createdTime?: string | null }>>;

export type FinalFolders = { finalId: string; publishedId: string; source: "name" | "config" };

async function childByName(list: DriveFolderLister, parentId: string, name: string): Promise<string | null> {
  const key = folderNameKey(name);
  const matches = (await list(parentId))
    .filter((f) => folderNameKey(f.name) === key)
    .sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? ""));
  return matches[0]?.id ?? null;
}

/**
 * Where final videos go. The folders are found by name under the shared drive
 * (Videos › « Vidéos finales » › « Publié »), so a folder renamed by hand in
 * Drive keeps working; when a name cannot be found (or Drive cannot list), the
 * configured ids are used: STUDIO_FINAL_VIDEOS_FOLDER_ID and
 * STUDIO_PUBLISHED_VIDEOS_FOLDER_ID, defaulting to the team's folders. The
 * per-property « Vidéo finales » folders (Tanghin's « Presentation ») are not
 * at the drive's root, so they never match.
 */
export async function resolveFinalVideoFolders(
  list: DriveFolderLister,
  driveId: string,
  env: Record<string, string | undefined> = {},
): Promise<FinalFolders> {
  const configuredFinal = env.STUDIO_FINAL_VIDEOS_FOLDER_ID?.trim() || DEFAULT_FINAL_VIDEOS_FOLDER_ID;
  const configuredPublished = env.STUDIO_PUBLISHED_VIDEOS_FOLDER_ID?.trim() || DEFAULT_PUBLISHED_VIDEOS_FOLDER_ID;
  try {
    let parent = driveId;
    for (const name of FINAL_VIDEOS_PATH) {
      const id = await childByName(list, parent, name);
      if (!id) return { finalId: configuredFinal, publishedId: configuredPublished, source: "config" };
      parent = id;
    }
    const published = await childByName(list, parent, PUBLISHED_SUBFOLDER);
    return { finalId: parent, publishedId: published ?? configuredPublished, source: "name" };
  } catch {
    return { finalId: configuredFinal, publishedId: configuredPublished, source: "config" };
  }
}

export type MoveDecision = { move: true } | { move: false; reason: string };

/**
 * PRD 2.4b: the Drive copy moves to « Publié » once the post is out on every
 * network it was meant for, and only once.
 */
export function shouldMoveToPublished(
  video: { status: string; drive_file_id: string | null; published_folder_at: string | null } | null,
  post: { status: string; networks: readonly string[]; results: PublicationResults },
): MoveDecision {
  if (!video || video.status !== "ready" || !video.drive_file_id) return { move: false, reason: "no-file" };
  if (video.published_folder_at) return { move: false, reason: "already-moved" };
  if (post.status !== "publie") return { move: false, reason: "not-published" };
  const results = post.results as Partial<Record<string, NetworkResult>>;
  const missing = post.networks.filter((n) => results[n]?.status !== "published");
  if (missing.length || !post.networks.length) return { move: false, reason: "not-everywhere" };
  return { move: true };
}

// ---------------------------------------------------------------------------
// Copy per network (PRD 3). The model writes the words; the code inserts the
// facts (price, place, phone, site) and enforces the house rules on every
// version, so a wrong price or phone can never come from the model.
// ---------------------------------------------------------------------------

export const CONTACT_LINE = "WhatsApp : 67 00 61 16 · Appel : 53 11 11 19";
export const SITE_LINE = "roogobf.com";
/** The two Roogo numbers, digits only. Any other number is removed. */
export const ROOGO_PHONE_DIGITS = ["67006116", "53111119"] as const;
export const MAX_COPY_EMOJI = 3;

export type CopyTarget = Destination | "base";

export type CopyRules = {
  hashtagsMin: number;
  hashtagsMax: number;
  /** Whole text including hashtags. */
  maxChars: number;
  /** Price, phone and site each on their own line (Facebook). */
  factsOnOwnLines: boolean;
  /** What the model is asked for, in French. */
  brief: string;
  /** YouTube: the first line is the video title, at most this many characters. */
  titleMax?: number;
  /** A hashtag the network always carries (YouTube: #Shorts). */
  requiredTag?: string;
  /** TikTok: the first paragraph is the hook. */
  hookMax?: number;
};

export const COPY_RULES: Record<CopyTarget, CopyRules> = {
  base: {
    hashtagsMin: 3,
    hashtagsMax: 5,
    maxChars: 2200,
    factsOnOwnLines: true,
    brief: "Texte de base : deux ou trois phrases simples sur le bien et la vidéo, utilisables sur tous les réseaux.",
  },
  facebook: {
    hashtagsMin: 2,
    hashtagsMax: 3,
    maxChars: 5000,
    factsOnOwnLines: true,
    brief: "Facebook : l'histoire complète en 4 à 6 phrases courtes (le bien, le quartier, la vie qu'on peut y mener), puis une invitation à écrire ou appeler. 2 ou 3 hashtags.",
  },
  instagram: {
    hashtagsMin: 5,
    hashtagsMax: 10,
    maxChars: 2200,
    factsOnOwnLines: true,
    brief: "Instagram : 3 paragraphes courts séparés par une ligne vide, le dernier invite à écrire sur WhatsApp. Entre 5 et 10 hashtags.",
  },
  tiktok: {
    hashtagsMin: 3,
    hashtagsMax: 5,
    maxChars: 2200,
    factsOnOwnLines: true,
    hookMax: 150,
    brief: "TikTok : une seule accroche courte (une ligne, moins de 150 caractères), qui donne envie de regarder jusqu'au bout. Entre 3 et 5 hashtags.",
  },
  youtube: {
    hashtagsMin: 3,
    hashtagsMax: 5,
    maxChars: 5000,
    factsOnOwnLines: true,
    titleMax: 100,
    requiredTag: "#Shorts",
    brief:
      "YouTube Shorts : en première ligne seule, le titre de la vidéo, 100 caractères au plus, écrit comme ce que les gens tapent dans la recherche : le type de bien, le lieu et le prix (par exemple « Villa 4 chambres à vendre à Ouaga 2000, 85 000 000 FCFA »). Puis une ligne vide et une description de 2 ou 3 phrases simples. Entre 3 et 5 hashtags, dont #Shorts.",
  },
};

export type CopyFacts = {
  listingType: "vendre" | "louer" | null;
  /** The listing price in FCFA, null when no listing is linked or it has no price. */
  price: number | null;
  /** "35 000 000 FCFA" or "150 000 FCFA par mois". */
  priceLabel: string | null;
  /** Quartier, else city. */
  place: string | null;
  /** For the house hashtags. */
  city?: string | null;
  propertyType?: string | null;
};

export const NO_FACTS: CopyFacts = { listingType: null, price: null, priceLabel: null, place: null };

export type CopyDraft = { text: string; hashtags: string[] };

export type CopyCheck = { code: string; message: string; level: "error" | "warning" };

export type FinalCopy = { text: string; hashtags: string[]; checks: CopyCheck[]; fixes: string[] };

const EMOJI_RE = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;
/** Phone numbers as people write them in Burkina: pairs of digits, optional +226. */
const PHONE_RE = /(?:\+\s?226[\s.]?)?\b\d{2}(?:[\s.]\d{2}){3}\b|\+\s?226[\s.]?\d{8}\b/g;
const HASHTAG_LINE_RE = /^(#[\p{L}\p{N}_]+[\s,]*)+$/u;
const FINANCING_RE =
  /\b(financements?|financer|financ[ée]e?s?|cr[ée]dits?|pr[êe]ts?\s+(bancaires?|immobiliers?)|mensualit[ée]s?|[ée]chelonn[ée]e?s?|[ée]chelonnements?|paiements?\s+en\s+plusieurs|facilit[ée]s?\s+de\s+paiement|apport\s+personnel|banques?)\b/i;

/** "Ouaga 2000" -> "Ouaga2000" (same rule as hashtagWord in ./publishing.ts). */
export function tagWord(text: string): string {
  return stripAccents(text)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    for (const piece of String(item ?? "").split(/[\s,]+/)) {
      const word = tagWord(piece.replace(/^#+/, ""));
      if (!word || seen.has(word.toLowerCase())) continue;
      seen.add(word.toLowerCase());
      out.push(`#${word}`);
    }
  }
  return out;
}

/** House hashtags used to top a version up to its network's minimum. */
export function houseTags(facts: CopyFacts): string[] {
  const type = (facts.propertyType ?? "").toLowerCase();
  const typeWord = { maison: "Maison", villa: "Villa", appartement: "Appartement", terrain: "Parcelle", commercial: "Local" }[type] ?? (type ? tagWord(type) : "");
  const offer = facts.listingType === "vendre" ? "AVendre" : facts.listingType === "louer" ? "ALouer" : "";
  return normalizeTags([
    "#Roogo",
    facts.place ? `#${tagWord(facts.place)}` : "",
    facts.city ? `#${tagWord(facts.city)}` : "#Ouagadougou",
    typeWord && offer ? `#${typeWord}${offer}` : "",
    "#ImmobilierBurkina",
    "#BurkinaFaso",
    "#Ouaga",
    "#Immobilier",
    "#MaisonAOuaga",
    "#Burkina",
  ]);
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "").replace(/^226(?=\d{8}$)/, "");
}

/** Every amount written in the text, in FCFA: "35 millions", "35 M", "35 000 000 FCFA", "150.000 F". */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const num = String.raw`(\d{1,3}(?:[   .]\d{3})+|\d+(?:[.,]\d+)?)`;
  const words = new RegExp(`${num}\\s*(milliards?|millions?|mille|f\\s?cfa|cfa|francs?)(?![\\p{L}])`, "giu");
  const letters = new RegExp(`${num}\\s?(M|F)(?![\\p{L}\\p{N}²])`, "gu");
  const value = (raw: string) => {
    const grouped = /[   .]\d{3}(?!\d)/.test(raw) && !/,/.test(raw);
    return grouped ? Number(raw.replace(/[   .]/g, "")) : Number(raw.replace(",", "."));
  };
  for (const m of text.matchAll(words)) {
    const n = value(m[1]);
    const unit = m[2].toLowerCase();
    if (!Number.isFinite(n)) continue;
    out.push(unit.startsWith("milliard") ? n * 1e9 : unit.startsWith("million") ? n * 1e6 : unit === "mille" ? n * 1e3 : n);
  }
  for (const m of text.matchAll(letters)) {
    const n = value(m[1]);
    if (!Number.isFinite(n)) continue;
    out.push(m[2] === "M" ? n * 1e6 : n);
  }
  return out.map((n) => Math.round(n));
}

/** An amount that is the listing price, or for a rental a whole number of months of it (caution, avance). */
function priceMatches(amount: number, facts: CopyFacts): boolean {
  if (facts.price == null) return false;
  if (amount === facts.price) return true;
  if (facts.listingType === "louer" && facts.price > 0 && amount % facts.price === 0 && amount / facts.price <= 12) return true;
  return false;
}

function mentions(text: string, needle: string): boolean {
  const key = (s: string) => stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const n = key(needle);
  return Boolean(n) && ` ${key(text)} `.includes(` ${n} `);
}

/**
 * One network's text as it will go out. Cleans what the model or the team
 * wrote (dashes, roogo.bf, hashtag lines, any phone line, more than 3 emoji),
 * then adds the facts by code: the price (on its own line on Facebook, and
 * wherever the text does not already give the right price), the place when
 * the text does not name it, the contact line and roogobf.com. Hashtags are
 * cleaned and kept within the network's range (topped up with house tags).
 * What cannot be fixed safely (a wrong price, a financing mention for a sale,
 * a text too long) comes back as an error check, which blocks « Valider ».
 */
export function finalizeNetworkCopy(target: CopyTarget, draft: CopyDraft, facts: CopyFacts = NO_FACTS): FinalCopy {
  const rules = COPY_RULES[target];
  const fixes: string[] = [];
  const checks: CopyCheck[] = [];
  let text = String(draft.text ?? "").replace(/\r\n?/g, "\n");
  if (/[—–]/.test(text)) fixes.push("Tirets longs remplacés par des virgules.");
  text = text
    .replace(/[ \t]*[—–][ \t]*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/(^|\n),\s*/g, "$1")
    .replace(/roogo\.bf\b/gi, "roogobf.com");

  if (rules.titleMax) {
    // YouTube: the first line is the title. « Titre : » and quotes are removed;
    // a title that is too long is cut at a word.
    const parts = text.replace(/^\s+/, "").split("\n");
    let title = (parts[0] ?? "").replace(/^\s*titre\s*:\s*/i, "").replace(/^[«"\s]+|[»"\s]+$/g, "").replace(/\s+/g, " ").trim();
    if (title.length > rules.titleMax) {
      title = shortenTitle(title, rules.titleMax);
      fixes.push(`Titre YouTube raccourci à ${rules.titleMax} caractères.`);
    }
    parts[0] = title;
    text = parts.join("\n");
  }

  const tagsFromText: string[] = [];
  let removedOtherPhone = false;
  let lines = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (HASHTAG_LINE_RE.test(t)) {
      tagsFromText.push(...(t.match(/#[\p{L}\p{N}_]+/gu) ?? []));
      return false;
    }
    if (t.toLowerCase() === SITE_LINE) return false;
    const phones = t.match(PHONE_RE) ?? [];
    if (phones.length) {
      if (phones.some((p) => !(ROOGO_PHONE_DIGITS as readonly string[]).includes(digitsOf(p)))) removedOtherPhone = true;
      return false;
    }
    // The code writes the price line itself when the listing has a price.
    if (facts.priceLabel && /^prix\s*:/i.test(t)) return false;
    if (/^lieu\s*:/i.test(t) && facts.place) return false;
    return true;
  });
  if (removedOtherPhone) fixes.push("Un numéro qui n'est pas celui de Roogo a été retiré.");

  let emoji = 0;
  let cut = false;
  lines = lines.map((line) =>
    line
      .replace(EMOJI_RE, (m) => {
        if (++emoji <= MAX_COPY_EMOJI) return m;
        cut = true;
        return "";
      })
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+$/g, ""),
  );
  if (cut) fixes.push(`Emoji réduits à ${MAX_COPY_EMOJI}.`);

  const body = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) checks.push({ code: "empty", level: "error", message: "Le texte est vide." });

  // Facts block, written by code.
  const factLines: string[] = [];
  const bodyAmounts = amountsIn(body);
  const bodyHasPrice = facts.price != null && bodyAmounts.some((a) => a === facts.price);
  if (facts.priceLabel && (target === "facebook" || target === "base" || !bodyHasPrice)) factLines.push(`Prix : ${facts.priceLabel}`);
  if (facts.place && !mentions(body, facts.place)) factLines.push(`Lieu : ${facts.place}`);
  factLines.push(CONTACT_LINE, SITE_LINE);
  const finalText = [body, factLines.join("\n")].filter(Boolean).join("\n\n");

  // Hashtags within the network's range.
  let hashtags = normalizeTags([...(draft.hashtags ?? []), ...tagsFromText]);
  if (rules.requiredTag && !hashtags.some((t) => t.toLowerCase() === rules.requiredTag!.toLowerCase())) {
    // #Shorts first, so the cut to the maximum below never removes it.
    hashtags = [rules.requiredTag, ...hashtags];
  }
  if (hashtags.length > rules.hashtagsMax) {
    hashtags = hashtags.slice(0, rules.hashtagsMax);
    fixes.push(`Hashtags limités à ${rules.hashtagsMax}.`);
  }
  if (hashtags.length < rules.hashtagsMin) {
    const seen = new Set(hashtags.map((t) => t.toLowerCase()));
    for (const tag of houseTags(facts)) {
      if (hashtags.length >= rules.hashtagsMin) break;
      if (!seen.has(tag.toLowerCase())) {
        hashtags.push(tag);
        seen.add(tag.toLowerCase());
      }
    }
  }

  checks.push(...copyProblems(target, finalText, hashtags, facts));
  return { text: finalText, hashtags, checks, fixes };
}

/**
 * The checks run on a stored text before « Valider » and again by the
 * publisher right before posting (PRD 3 guardrail). Errors block; warnings
 * are shown to the team and to Salif.
 */
export function copyProblems(target: CopyTarget, text: string, hashtags: readonly string[], facts: CopyFacts = NO_FACTS): CopyCheck[] {
  const rules = COPY_RULES[target];
  const out: CopyCheck[] = [];
  const all = `${text}\n${hashtags.join(" ")}`;
  if (/[—–]/.test(all)) out.push({ code: "em-dash", level: "error", message: "Retirez le tiret long : utilisez une virgule ou deux phrases." });
  if (!text.split("\n").some((l) => l.trim() === CONTACT_LINE)) out.push({ code: "contact", level: "error", message: `Il manque la ligne « ${CONTACT_LINE} ».` });
  if (!text.split("\n").some((l) => l.trim() === SITE_LINE)) out.push({ code: "site", level: "error", message: "Il manque roogobf.com sur sa propre ligne." });
  for (const phone of text.match(PHONE_RE) ?? []) {
    if (!(ROOGO_PHONE_DIGITS as readonly string[]).includes(digitsOf(phone))) {
      out.push({ code: "phone", level: "error", message: `Le numéro ${phone.trim()} n'est pas celui de Roogo.` });
      break;
    }
  }
  const amounts = amountsIn(text);
  if (facts.price != null) {
    const wrong = amounts.find((a) => !priceMatches(a, facts));
    if (wrong !== undefined) {
      out.push({
        code: "price",
        level: "error",
        message: `Le texte donne ${wrong.toLocaleString("fr-FR")} FCFA, l'annonce dit ${facts.priceLabel ?? facts.price.toLocaleString("fr-FR")}.`,
      });
    }
  } else if (amounts.length) {
    out.push({ code: "price-unchecked", level: "warning", message: "Un prix est cité sans annonce liée : vérifiez-le." });
  }
  if (facts.listingType !== "louer" && FINANCING_RE.test(all)) {
    out.push({ code: "financing", level: "error", message: "Les ventes Roogo se font au comptant : retirez toute mention de crédit ou de financement." });
  }
  if (/\bfaux\b|\bfausses?\b/i.test(all)) out.push({ code: "faux", level: "error", message: "N'utilisez pas « faux » pour un bien ou un élément de construction." });
  if ((all.match(EMOJI_RE) ?? []).length > MAX_COPY_EMOJI) out.push({ code: "emoji", level: "error", message: `Au plus ${MAX_COPY_EMOJI} emoji.` });
  const length = postLength(text, hashtags);
  if (length > rules.maxChars) out.push({ code: "too-long", level: "error", message: `Texte trop long : ${length} caractères pour ${rules.maxChars} au plus.` });
  if (target !== "base" && (hashtags.length < rules.hashtagsMin || hashtags.length > rules.hashtagsMax)) {
    out.push({
      code: "hashtags",
      level: "warning",
      message: `${hashtags.length} hashtag${hashtags.length > 1 ? "s" : ""} : ${DESTINATION_LABELS[target]} en demande ${rules.hashtagsMin} à ${rules.hashtagsMax}.`,
    });
  }
  if (rules.hookMax) {
    const hook = text.split(/\n\s*\n/)[0] ?? "";
    if (hook.length > rules.hookMax) out.push({ code: "hook", level: "warning", message: `L'accroche TikTok fait ${hook.length} caractères : visez moins de ${rules.hookMax}.` });
  }
  if (rules.titleMax) {
    const title = (text.split("\n")[0] ?? "").trim();
    if (title.length > rules.titleMax) out.push({ code: "title", level: "error", message: `Le titre YouTube fait ${title.length} caractères pour ${rules.titleMax} au plus.` });
    if (title && facts.place && !mentions(title, facts.place)) {
      out.push({ code: "title-place", level: "warning", message: `Le titre YouTube gagne à citer le lieu (${facts.place}) : c'est ce que les gens cherchent.` });
    }
    if (title && facts.price != null && !amountsIn(title).some((a) => a === facts.price)) {
      out.push({ code: "title-price", level: "warning", message: "Le titre YouTube gagne à citer le prix de l'annonce." });
    }
  }
  if (rules.requiredTag && !hashtags.some((t) => t.toLowerCase() === rules.requiredTag!.toLowerCase())) {
    out.push({ code: "required-tag", level: "warning", message: `Ajoutez ${rules.requiredTag} aux hashtags.` });
  }
  return out;
}

/** Cuts a title at a word so it fits in `max` characters (no trailing comma or dash). */
export function shortenTitle(title: string, max: number): string {
  const chars = [...title];
  if (chars.length <= max) return title;
  const cut = chars.slice(0, max + 1).join("");
  const atWord = cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : max);
  return [...atWord].slice(0, max).join("").replace(/[\s,;:.\-|]+$/u, "");
}

/**
 * The two fields of a YouTube upload from the stored YouTube text: the title
 * is the first line (100 characters at most), the description is the rest
 * (contact line and roogobf.com included, added by finalizeNetworkCopy), then
 * the hashtags, with #Shorts always there.
 */
export function youtubeShortFields(draft: CopyDraft, fallbackTitle: string): { title: string; description: string } {
  const lines = String(draft.text ?? "").replace(/\r\n?/g, "\n").trim().split("\n");
  const first = (lines[0] ?? "").replace(/^\s*titre\s*:\s*/i, "").replace(/\s+/g, " ").trim();
  const title = shortenTitle(first || fallbackTitle.trim() || "Roogo", COPY_RULES.youtube.titleMax!);
  const rest = lines.slice(1).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const tags = normalizeTags(draft.hashtags ?? []);
  if (!tags.some((t) => t.toLowerCase() === "#shorts")) tags.push("#Shorts");
  return { title, description: copyPostText(rest, tags) };
}

/** Exactly what goes out: the text, a blank line, the hashtags. */
export function copyPostText(text: string, hashtags: readonly string[] | null | undefined): string {
  const tags = (hashtags ?? []).join(" ").trim();
  const body = (text ?? "").trim();
  return tags ? `${body}\n\n${tags}` : body;
}

export function postLength(text: string, hashtags: readonly string[]): number {
  return copyPostText(text, hashtags).length;
}

/** The small checklist under each tab: contact, site, price, hashtags. */
export function copySummary(target: CopyTarget, text: string, hashtags: readonly string[], facts: CopyFacts = NO_FACTS) {
  const rules = COPY_RULES[target];
  const lines = text.split("\n").map((l) => l.trim());
  return {
    contact: lines.includes(CONTACT_LINE),
    site: lines.includes(SITE_LINE),
    price: facts.price == null ? null : amountsIn(text).some((a) => a === facts.price),
    hashtags: hashtags.length,
    hashtagsMin: rules.hashtagsMin,
    hashtagsMax: rules.hashtagsMax,
    length: postLength(text, hashtags),
    maxChars: rules.maxChars,
  };
}

export type NetworkCopy = Partial<Record<Destination, CopyDraft>>;

/**
 * « Même texte partout » (PRD 3.4): the base, finalized once, on every
 * ticked network.
 */
export function sameTextEverywhere(base: CopyDraft, networks: readonly Destination[], facts: CopyFacts = NO_FACTS): NetworkCopy {
  const final = finalizeNetworkCopy("base", base, facts);
  const out: NetworkCopy = {};
  for (const n of networks) out[n] = { text: final.text, hashtags: [...final.hashtags] };
  return out;
}

/** Reads network_copy from the database or a request body, keeping only valid entries. */
export function parseNetworkCopy(raw: unknown): NetworkCopy {
  const out: NetworkCopy = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDestination(key) || !value || typeof value !== "object") continue;
    const v = value as { text?: unknown; hashtags?: unknown };
    if (typeof v.text !== "string") continue;
    const tags = Array.isArray(v.hashtags) ? v.hashtags.filter((t): t is string => typeof t === "string") : [];
    out[key] = { text: v.text.slice(0, 6000), hashtags: normalizeTags(tags).slice(0, 30) };
  }
  return out;
}

/** The text a network publishes: its own version, else the base. */
export function textForNetwork(network: Destination, copy: NetworkCopy, base: CopyDraft): CopyDraft {
  return copy[network] ?? base;
}

/** Every blocking problem of a post, per network, for « Valider » and for the publisher. */
export function networkCopyErrors(
  networks: readonly Destination[],
  copy: NetworkCopy,
  base: CopyDraft,
  facts: CopyFacts,
  sameText: boolean,
): Array<{ network: Destination; message: string }> {
  const out: Array<{ network: Destination; message: string }> = [];
  for (const n of networks) {
    const draft = textForNetwork(n, copy, base);
    for (const check of copyProblems(sameText ? "base" : n, draft.text, draft.hashtags, facts)) {
      if (check.level === "error") out.push({ network: n, message: `${DESTINATION_LABELS[n]} : ${check.message}` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// After « Valider »: right away, or at the chosen time.
// ---------------------------------------------------------------------------

/**
 * PRD 2.6 and the 2026-10-23 answer: « Dès que Salif valide » publishes right
 * away (the approval time becomes the publication time); a chosen date and
 * time (Ouagadougou = UTC) stays as it is.
 */
export function scheduledAtOnApproval(post: { publish_on_approval: boolean; scheduled_at: string }, now: Date): string {
  if (post.publish_on_approval) return now.toISOString();
  return new Date(post.scheduled_at).toISOString();
}

/** The status line the uploader reads under each video in « Mes vidéos ». */
export function uploaderStatus(post: { status: string; returned_at?: string | null; publishing?: boolean } | null, videoStatus: string): string {
  if (videoStatus === "uploading") return "Envoi en cours";
  if (videoStatus === "failed") return "Envoi échoué";
  if (!post) return "Prête, pas encore envoyée à Salif";
  if (post.publishing) return "Publication en cours";
  switch (post.status) {
    case "a_faire":
      return post.returned_at ? "À corriger" : "Brouillon";
    case "a_valider":
      return "À valider par Salif";
    case "valide":
      return "Validée, publication en attente";
    case "publie":
      return "Publiée partout";
    case "echec":
      return "Échec sur un réseau";
    default:
      return post.status;
  }
}
