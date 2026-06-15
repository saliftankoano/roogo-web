import { z } from "zod";

export const TALENT_DOCUMENTS_BUCKET = "talent-documents";
export const TALENT_DEFAULT_JOB_SLUG = "roogo-property-acquisition";
export const TALENT_DEFAULT_CHALLENGE_SLUG = "owner-leads-48h";

export const TALENT_APPLICATION_STATUSES = [
  "applied",
  "challenge_assigned",
  "submitted",
  "under_review",
  "shortlisted",
  "rejected",
  "hired",
] as const;

export const TALENT_LEAD_VISIBLE_STATUSES = [
  "received",
  "under_review",
  "credited",
  "duplicate",
  "converted",
  "rejected",
] as const;

export const TALENT_LEAD_REVIEW_STATUSES = [
  "unreviewed",
  "valid_new",
  "duplicate",
  "invalid",
  "converted",
] as const;

const burkinaPhone = z
  .string()
  .trim()
  .min(8, "Le numéro doit contenir au moins 8 chiffres")
  .max(16, "Le numéro est trop long")
  .regex(/^[+0-9\s-]+$/, "Numéro invalide");

export const talentProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Le nom complet est requis"),
  email: z.email("Adresse email invalide"),
  phone: burkinaPhone,
  whatsapp: z.string().trim().max(16).optional().or(z.literal("")),
  location: z.string().trim().min(2, "La ville ou le quartier est requis"),
  languages: z
    .string()
    .trim()
    .min(2, "Indiquez au moins une langue parlée"),
  resumePath: z.string().trim().min(1, "Le CV PDF est requis"),
  resumeFilename: z.string().trim().min(1, "Le nom du CV est requis"),
});

export const talentLeadSchema = z.object({
  ownerName: z.string().trim().min(2, "Le nom du propriétaire est requis"),
  ownerPhone: burkinaPhone,
  ownerAddress: z
    .string()
    .trim()
    .min(3, "L'adresse ou la zone est requise"),
  notes: z
    .string()
    .trim()
    .min(10, "Ajoutez des notes utiles sur la conversation"),
  matchedOwnerId: z.uuid().optional().nullable(),
  matchedPropertyId: z.uuid().optional().nullable(),
});

export const talentAppealSchema = z.object({
  note: z
    .string()
    .trim()
    .min(10, "Expliquez la situation en au moins 10 caractères")
    .max(1000, "Maximum 1000 caractères"),
});

export const talentAdminApplicationReviewSchema = z.object({
  status: z.enum(TALENT_APPLICATION_STATUSES).optional(),
  reviewerScore: z.coerce.number().int().min(0).max(100).nullable().optional(),
  reviewerNotes: z.string().trim().max(2000).nullable().optional(),
});

export const talentAdminLeadReviewSchema = z.object({
  reviewStatus: z.enum(TALENT_LEAD_REVIEW_STATUSES),
  candidateVisibleStatus: z.enum(TALENT_LEAD_VISIBLE_STATUSES),
  reviewerNotes: z.string().trim().max(2000).nullable().optional(),
  partialCredit: z.boolean().optional(),
  credited: z.boolean().optional(),
  matchedOwnerId: z.uuid().nullable().optional(),
  matchedPropertyId: z.uuid().nullable().optional(),
});

export function normalizeTalentPhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export function splitLanguages(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function maskPhone(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function formatTalentStatus(status: string) {
  const labels: Record<string, string> = {
    applied: "Profil reçu",
    challenge_assigned: "Challenge assigné",
    submitted: "Soumis",
    under_review: "En revue",
    shortlisted: "Présélectionné",
    rejected: "Refusé",
    hired: "Recruté",
  };

  return labels[status] ?? status;
}

export function mapReviewStatusToVisibleStatus(reviewStatus: string) {
  switch (reviewStatus) {
    case "valid_new":
      return "credited";
    case "duplicate":
      return "duplicate";
    case "invalid":
      return "rejected";
    case "converted":
      return "converted";
    default:
      return "under_review";
  }
}
