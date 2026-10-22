// Job applications with a deadline (public page /carrieres/<slug>, table
// job_applications, migration 104). The first role is the full-time
// real-estate salesperson announced on 2026-10-22.
//
// Pure: no "@/" imports, so the API routes, the page, the staff review and
// node:test (lib/job-applications.test.mjs) share one source. A future role
// adds one entry to JOB_ROLES; the page, the form, the server checks and the
// staff review read everything from it.
//
// Ouagadougou is UTC+0 all year, so the deadline is written in UTC.

import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js/min";

export type JobRoleQuestion = { id: string; label: string };

export type JobRoleConfig = {
  slug: string;
  title: string;
  contract: string;
  place: string;
  /** First instant applications are refused (exclusive), ISO UTC. */
  closesAt: string;
  /** How the deadline is said on the page. */
  deadlineLabel: string;
  /** Start date (YYYY-MM-DD) and how it is said. */
  startDate: string;
  startDateLabel: string;
  priorities: string[];
  plus: string;
  requirement: string;
  pay: string[];
  confirmation: string;
  /** Step 4 questions, in order. Ids are the keys of `answers` in the table. */
  questions: JobRoleQuestion[];
};

export const COMMERCIAL_IMMOBILIER_SLUG = "commercial-immobilier";

export const JOB_ROLES: Record<string, JobRoleConfig> = {
  [COMMERCIAL_IMMOBILIER_SLUG]: {
    slug: COMMERCIAL_IMMOBILIER_SLUG,
    title: "Commercial(e) en immobilier",
    contract: "Temps plein",
    place: "Ouagadougou (bureau de Karpala et terrain)",
    // Open until Wednesday 28 October 2026, 23:59 in Ouagadougou (UTC+0).
    closesAt: "2026-10-29T00:00:00.000Z",
    deadlineLabel: "mercredi 28 octobre à 23\u00a0h\u00a059",
    startDate: "2026-11-02",
    startDateLabel: "lundi 2 novembre",
    priorities: [
      "Trouver des acheteurs pour nos biens en vente et aller jusqu'à la vente.",
      "Ramener de nouveaux propriétaires et des mandats de vente.",
    ],
    plus: "À l'aise devant la caméra.",
    requirement:
      "Expérience réelle de vente exigée, idéalement en immobilier. Les candidatures de femmes sont vivement encouragées.",
    pay: [
      "Premier mois à l'essai : 55 000 FCFA.",
      "Ensuite : 75 000 FCFA par mois.",
      "Plus une prime chaque trimestre selon les résultats.",
    ],
    confirmation:
      "Ablassé te contacte si ton profil est retenu. Entretiens les 29 et 30 octobre.",
    questions: [
      {
        id: "paymentPlan",
        label:
          "Un acheteur de la diaspora adore la maison mais demande à payer en plusieurs fois. Que lui réponds-tu ?",
      },
      {
        id: "fiveBuyers",
        label:
          "Où trouverais-tu 5 acheteurs sérieux pour ce bien cette semaine ? Sois précis.",
      },
      {
        id: "otherAgency",
        label:
          "Le salaire est fixe, avec une prime chaque trimestre. Travailles-tu aujourd'hui pour une autre agence ou en indépendant ?",
      },
    ],
  },
};

export function getJobRole(slug: string | null | undefined): JobRoleConfig | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(JOB_ROLES, slug)
    ? JOB_ROLES[slug]
    : null;
}

/** What the video test shows, also stored on the application as a snapshot. */
export type VideoTestListing = {
  id: string;
  reference: string | null;
  headline: string;
  quartier: string;
  priceLabel: string;
  image: string;
  path: string;
};

// ---------------------------------------------------------------------------
// Deadline

export const APPLICATIONS_CLOSED_MESSAGE = "Les candidatures sont closes.";

export function isApplicationOpen(role: JobRoleConfig, now: Date = new Date()): boolean {
  return now.getTime() < Date.parse(role.closesAt);
}

export type TimeLeft = { closed: boolean; days: number; hours: number; minutes: number };

export function timeLeft(role: JobRoleConfig, now: Date = new Date()): TimeLeft {
  const ms = Date.parse(role.closesAt) - now.getTime();
  if (ms <= 0) return { closed: true, days: 0, hours: 0, minutes: 0 };
  const totalMinutes = Math.ceil(ms / 60_000);
  return {
    closed: false,
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
  };
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

/** « Il reste 6 jours et 4 heures », « Il reste 3 heures », « Il reste 12 minutes ». */
export function formatTimeLeft(left: TimeLeft): string {
  if (left.closed) return APPLICATIONS_CLOSED_MESSAGE;
  if (left.days >= 1) {
    const days = `Il reste ${plural(left.days, "jour", "jours")}`;
    return left.hours > 0 ? `${days} et ${plural(left.hours, "heure", "heures")}` : days;
  }
  if (left.hours >= 1) return `Il reste ${plural(left.hours, "heure", "heures")}`;
  return `Il reste ${plural(Math.max(1, left.minutes), "minute", "minutes")}`;
}

// ---------------------------------------------------------------------------
// Phones

// Burkina mobile ranges (WhatsApp lives on mobiles): 01-07 and 5x, 6x, 7x.
// Landlines start with 2.
const BF_MOBILE = /^(0[1-7]|[5-7]\d)\d{6}$/;

/**
 * A Burkina Faso mobile number (8 digits, with or without +226 / 00226,
 * spaces, dots or dashes) as E.164 "+226XXXXXXXX", or null. With
 * `{ mobile: false }` a landline is accepted too.
 */
export function normalizeBurkinaPhone(
  input: string | null | undefined,
  options: { mobile?: boolean } = {},
): string | null {
  if (!input) return null;
  let digits = String(input).replace(/[\s.\-()/]/g, "");
  if (digits.startsWith("+226")) digits = digits.slice(4);
  else if (digits.startsWith("00226")) digits = digits.slice(5);
  else if (digits.startsWith("226") && digits.length === 11) digits = digits.slice(3);
  if (!/^\d{8}$/.test(digits)) return null;
  if (options.mobile !== false && !BF_MOBILE.test(digits)) return null;
  try {
    if (!isValidPhoneNumber(digits, "BF")) return null;
  } catch {
    return null;
  }
  return `+226${digits}`;
}

/** Any valid phone: Burkina without prefix, or international with + or 00. */
export function normalizeAnyPhone(input: string | null | undefined): string | null {
  const bf = normalizeBurkinaPhone(input, { mobile: false });
  if (bf) return bf;
  if (!input) return null;
  let raw = String(input).replace(/[\s.\-()/]/g, "");
  if (raw.startsWith("00")) raw = `+${raw.slice(2)}`;
  if (!raw.startsWith("+")) return null;
  try {
    const parsed = parsePhoneNumber(raw);
    return parsed?.isValid() ? parsed.format("E.164") : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Files

export type UploadKind = "cv" | "video";

export const UPLOAD_RULES: Record<
  UploadKind,
  { maxBytes: number; mimeTypes: Record<string, string>; label: string }
> = {
  cv: {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    },
    label: "CV",
  },
  video: {
    maxBytes: 150 * 1024 * 1024,
    mimeTypes: {
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
    },
    label: "vidéo",
  },
};

/** Mime type from the browser, or from the extension when the browser gives none. */
export function resolveUploadMime(
  kind: UploadKind,
  mime: string | null | undefined,
  fileName: string | null | undefined,
): string | null {
  const rules = UPLOAD_RULES[kind].mimeTypes;
  const type = String(mime ?? "").toLowerCase();
  if (type && rules[type]) return type;
  const ext = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    qt: "video/quicktime",
    webm: "video/webm",
  };
  const guessed = byExt[ext];
  return guessed && rules[guessed] ? guessed : null;
}

export function uploadSizeError(kind: UploadKind, size: number): string | null {
  const { maxBytes, label } = UPLOAD_RULES[kind];
  if (!Number.isFinite(size) || size <= 0) return `Le fichier ${label} est vide.`;
  if (size > maxBytes) {
    return `Le fichier ${label} dépasse ${Math.round(maxBytes / 1024 / 1024)} Mo.`;
  }
  return null;
}

export function buildUploadPath(roleSlug: string, kind: UploadKind, id: string, mime: string): string {
  const ext = UPLOAD_RULES[kind].mimeTypes[mime];
  return `${roleSlug}/${kind}/${id}.${ext}`;
}

/** Whether a path came from our upload-url route for this role and kind. */
export function isUploadPathFor(roleSlug: string, kind: UploadKind, path: string | null | undefined): boolean {
  if (!path) return false;
  const exts = Object.values(UPLOAD_RULES[kind].mimeTypes).join("|");
  const re = new RegExp(
    `^${roleSlug.replace(/[^a-z0-9-]/g, "")}/${kind}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${exts})$`,
  );
  return re.test(path);
}

// ---------------------------------------------------------------------------
// Video links (fallback for slow connections)

const VIDEO_LINK_HOSTS = [
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "drive.google.com",
  "facebook.com",
  "fb.watch",
];

export function isAllowedVideoLink(input: string | null | undefined): boolean {
  if (!input) return false;
  let url: URL;
  try {
    url = new URL(String(input).trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return VIDEO_LINK_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// ---------------------------------------------------------------------------
// Validation

export const ANSWER_MAX = 600;
export const SALE_PROPERTY_TYPES = [
  "Maison",
  "Villa",
  "Appartement",
  "Terrain",
  "Local commercial",
  "Autre",
] as const;

const text = (min: number, max: number, field: string) =>
  z
    .string({ error: `${field} manquant.` })
    .trim()
    .min(min, `${field} : ${min} caractères minimum.`)
    .max(max, `${field} : ${max} caractères maximum.`);

export const burkinaPhoneSchema = z
  .string({ error: "Numéro WhatsApp manquant." })
  .trim()
  .refine((v) => normalizeBurkinaPhone(v) !== null, {
    message: "Numéro WhatsApp invalide : 8 chiffres du Burkina, par exemple 70 12 34 56.",
  })
  .transform((v) => normalizeBurkinaPhone(v) as string);

export const stepYouSchema = z.object({
  fullName: text(3, 120, "Nom complet"),
  phone: burkinaPhoneSchema,
  quartier: text(2, 80, "Quartier"),
  email: z
    .union([z.literal(""), z.email("Adresse email invalide.").max(160)])
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
  cvPath: z.string({ error: "Ajoute ton CV (PDF ou photo)." }).min(1, "Ajoute ton CV (PDF ou photo)."),
});

const currentYear = () => new Date().getUTCFullYear();

export const saleSchema = z.object({
  propertyType: z.enum(SALE_PROPERTY_TYPES, { error: "Choisis le type de bien." }),
  quartier: text(2, 80, "Quartier de la vente"),
  price: z.coerce
    .number({ error: "Prix invalide." })
    .int("Prix en FCFA, sans virgule.")
    .min(100_000, "Prix : au moins 100 000 FCFA.")
    .max(50_000_000_000, "Prix trop élevé."),
  year: z.coerce
    .number({ error: "Année invalide." })
    .int()
    .min(2000, "Année : 2000 ou après.")
    .refine((y) => y <= currentYear(), { message: "Année dans le futur." }),
  buyerSource: text(5, 300, "Comment tu as trouvé l'acheteur"),
});

export const referenceSchema = z.object({
  name: text(3, 120, "Nom de la référence"),
  phone: z
    .string({ error: "Téléphone de la référence manquant." })
    .trim()
    .refine((v) => normalizeAnyPhone(v) !== null, { message: "Téléphone de la référence invalide." })
    .transform((v) => normalizeAnyPhone(v) as string),
  relation: text(3, 120, "Lien avec toi"),
});

export const stepSalesSchema = z.object({
  sales: z.array(saleSchema).min(1, "Indique au moins une vente.").max(3, "3 ventes au maximum."),
  reference: referenceSchema,
});

export function buildApplicationSchema(role: JobRoleConfig, roleSlug = role.slug) {
  const answers = z.object(
    Object.fromEntries(
      role.questions.map((q) => [q.id, text(10, ANSWER_MAX, "Ta réponse")]),
    ),
  );

  return z
    .object({
      website: z.string().optional(), // honeypot, checked by the route
      ...stepYouSchema.shape,
      ...stepSalesSchema.shape,
      videoPath: z.string().trim().optional().nullable(),
      videoUrl: z.string().trim().max(500).optional().nullable(),
      // Null only when no sale listing with photos was live to show.
      listingId: z.uuid("Bien de la vidéo invalide.").nullable(),
      answers,
      canStartOnDate: z.boolean(),
      availableFrom: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide.")
        .optional()
        .nullable(),
      consent: z.literal(true, { error: "Coche l'accord sur l'usage de tes données." }),
    })
    .superRefine((value, ctx) => {
      if (!isUploadPathFor(roleSlug, "cv", value.cvPath)) {
        ctx.addIssue({ code: "custom", path: ["cvPath"], message: "CV introuvable : envoie-le à nouveau." });
      }
      const hasPath = Boolean(value.videoPath);
      const hasUrl = Boolean(value.videoUrl);
      if (!hasPath && !hasUrl) {
        ctx.addIssue({ code: "custom", path: ["videoPath"], message: "Ajoute ta vidéo ou colle un lien." });
      }
      if (hasPath && !isUploadPathFor(roleSlug, "video", value.videoPath)) {
        ctx.addIssue({ code: "custom", path: ["videoPath"], message: "Vidéo introuvable : envoie-la à nouveau." });
      }
      if (hasUrl && !isAllowedVideoLink(value.videoUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["videoUrl"],
          message: "Lien vidéo : TikTok, YouTube, Google Drive ou Facebook seulement.",
        });
      }
      if (!value.canStartOnDate) {
        if (!value.availableFrom) {
          ctx.addIssue({ code: "custom", path: ["availableFrom"], message: "Indique la date où tu peux commencer." });
        } else if (value.availableFrom <= role.startDate) {
          ctx.addIssue({
            code: "custom",
            path: ["availableFrom"],
            message: `Si tu peux commencer le ${role.startDateLabel}, coche la case.`,
          });
        }
      }
    });
}

export type JobApplicationInput = z.infer<ReturnType<typeof buildApplicationSchema>>;

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Données invalides.";
}

// ---------------------------------------------------------------------------
// Duplicates: one application per phone number per role.

export const DUPLICATE_APPLICATION_MESSAGE =
  "Tu as déjà envoyé une candidature avec ce numéro. Elle est bien reçue, pas besoin de recommencer.";

/** The key the unique index (role_slug, phone) compares. */
export function applicationKey(roleSlug: string, phone: string): string | null {
  const normalized = normalizeBurkinaPhone(phone);
  return normalized ? `${roleSlug}:${normalized}` : null;
}

/** Postgres unique violation on job_applications (role_slug, phone). */
export function isDuplicateApplicationError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

// ---------------------------------------------------------------------------
// Staff review

export const APPLICATION_STATUSES = ["nouveau", "retenu", "entretien", "refuse"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  nouveau: "Nouveau",
  retenu: "Retenu",
  entretien: "Entretien",
  refuse: "Refusé",
};

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (APPLICATION_STATUSES as readonly string[]).includes(value);
}
