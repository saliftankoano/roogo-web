import { z } from "zod";

// ── Visites 3D — créneaux & tarification ─────────────────────────────────
// Service de scan 3D à domicile (Ouagadougou). Migré depuis le site Kazedra ;
// Roogo porte désormais la marque et le tarif unique.

export const SLOTS = [
  "07:00-09:00",
  "09:00-11:00",
  "11:00-13:00",
  "13:00-15:00",
  "15:00-17:00",
] as const;

export type Slot = (typeof SLOTS)[number];

export const PRICE_PER_ROOM = 15_000;

export function computePrice(roomCount: number): number {
  return Math.max(1, Math.floor(roomCount)) * PRICE_PER_ROOM;
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatFCFA(amount: number): string {
  return amount.toLocaleString("fr-FR") + " FCFA";
}

// ── Validation ───────────────────────────────────────────────────────────

const phoneRegex = /^(\+?226)?[\s-]?[0-9]{2}[\s-]?[0-9]{2}[\s-]?[0-9]{2}[\s-]?[0-9]{2}$/;

export const visit3dBookingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  slot: z.enum(SLOTS, { message: "Créneau invalide" }),
  name: z.string().trim().min(2, "Nom trop court").max(120),
  company: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, "Numéro invalide (ex. +226 70 12 34 56)"),
  email: z
    .string()
    .trim()
    .email("Email invalide")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().min(4, "Adresse trop courte").max(500),
  room_count: z
    .number()
    .int()
    .min(1, "Au moins 1 pièce")
    .max(50, "Plus de 50 pièces ? Contactez-nous."),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type Visit3dBookingInput = z.infer<typeof visit3dBookingSchema>;

export const VISIT3D_PAYMENT_PROVIDERS = ["ORANGE_BFA", "MOOV_BFA"] as const;
export type Visit3dPaymentProvider =
  (typeof VISIT3D_PAYMENT_PROVIDERS)[number];

export const visit3dPaymentInitiateSchema = visit3dBookingSchema.extend({
  payment_provider: z.enum(VISIT3D_PAYMENT_PROVIDERS, {
    message: "Opérateur invalide",
  }),
  payment_phone: z
    .string()
    .trim()
    .regex(phoneRegex, "Numéro Mobile Money invalide"),
  pre_authorisation_code: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .optional()
    .or(z.literal("")),
});

export type Visit3dPaymentInitiateInput = z.infer<
  typeof visit3dPaymentInitiateSchema
>;

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("226")) return "+" + digits;
  if (digits.length === 8) return "+226" + digits;
  return input.startsWith("+") ? input : "+" + digits;
}

export function toPawaPayPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("226")) return digits.slice(0, 11);
  if (digits.length === 8) return "226" + digits;
  return digits;
}
