import { z } from "zod";
import { PROPERTY_TYPE_IDS } from "./constants";

export const MIN_LISTING_PHOTOS = 3;
export const MAX_LISTING_PHOTOS = 20;

const optionalPositiveInteger = (message: string) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(1, message).optional(),
  );

export const CITY_OPTIONS = [
  { id: "ouaga", label: "Ouagadougou" },
  { id: "bobo", label: "Bobo-Dioulasso" },
  { id: "banfora", label: "Banfora" },
  { id: "po", label: "Pô" },
  { id: "cinkasse", label: "Cinkassé" },
  { id: "kaya", label: "Kaya" },
  { id: "koudougou", label: "Koudougou" },
  { id: "manga", label: "Manga" },
  { id: "ouahigouya", label: "Ouahigouya" },
  { id: "tenkodogo", label: "Tenkodogo" },
  { id: "yako", label: "Yako" },
  { id: "dedougou", label: "Dédougou" },
  { id: "koupela", label: "Koupéla" },
  { id: "zorgho", label: "Zorgho" },
] as const;

export type CityId = (typeof CITY_OPTIONS)[number]["id"];

export const listingBaseSchema = z.object({
  // Step 1
  type: z.enum(PROPERTY_TYPE_IDS),
  prixMensuel: z.coerce
    .number()
    .int()
    .min(100, "Le prix doit être au moins 100 FCFA"),
  quartier: z
    .string()
    .min(2, "Le quartier doit contenir au moins 2 caractères"),
  ville: z.enum(CITY_OPTIONS.map((city) => city.id) as [CityId, ...CityId[]]),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),

  // Step 2
  // Floor is 0 to allow bare land (terrain); non-terrain listings must have
  // ≥1 of each — enforced by requireListingFieldsByType (schema-level
  // superRefine would break the .omit({photos}) call in the API route).
  chambres: z.coerce.number().int().min(0),
  sdb: z.coerce.number().int().min(0),
  superficie: optionalPositiveInteger(
    "La superficie doit être au moins 1 m²",
  ),
  vehicules: z.coerce.number().int().min(0),
  description: z
    .string()
    .min(10, "Min 10 caractères")
    .max(1200, "Max 1200 caractères"),
  photos: z
    .array(z.any())
    .min(MIN_LISTING_PHOTOS, "Au moins 3 photos requises")
    .max(MAX_LISTING_PHOTOS, `Maximum ${MAX_LISTING_PHOTOS} photos`),
  video: z.any().optional(),
  equipements: z
    .array(
      z.enum(["wifi", "securite", "jardin", "solaires", "piscine", "meuble"]),
    )
    .optional(),
  cautionMois: z.coerce.number().int().min(0).max(12).optional(),
  loyerAvanceMois: z.coerce.number().int().min(1).max(12).optional(),
  cautionType: z.enum(["aucune", "pourcentage", "fixe"]).optional(),
  cautionValeur: z.coerce.number().min(0).max(100000000).optional(),
  sejour_minimum: z.coerce.number().int().min(1).max(30).optional(),
  capacite_max: z.coerce.number().int().min(1).max(20).optional(),
  interdictions: z
    .array(
      z.enum(["no_animaux", "no_fumeurs", "no_etudiants", "no_colocation"]),
    )
    .optional(),
  dosAndDonts: z
    .array(
      z
        .string()
        .trim()
        .min(2, "Minimum 2 caractères")
        .max(200, "Maximum 200 caractères"),
    )
    .max(20, "Maximum 20 règles")
    .optional(),
  virtualTourUrl: z.string().optional(),
  // Rent vs sale. Optional + default keeps older mobile builds (which never send
  // it) creating rentals exactly as before.
  listing_type: z.enum(["louer", "vendre"]).optional().default("louer"),
  // Required for rentals; omitted for sales (a sale has no rental frequency).
  frequence: z.enum(["mensuel", "journalier"]).optional(),
  source_locale: z.enum(["fr", "en"]).optional(),

  // Step 3
  tier_id: z.enum(["essentiel", "standard", "premium"]).optional(),
  listing_payment_mode: z
    .enum(["free_success_fee", "upfront_package", "daily_free"])
    .optional(),
  payment_id: z.string().optional(),
  transaction_id: z.string().optional(),
  add_ons: z.array(z.string()).optional(),
  freeSuccessFeeTermsAccepted: z.boolean().optional(),
  referralCode: z.string().optional(),
  is_test: z.boolean().optional(),

  // Staff/founder: listing on behalf of client
  on_behalf_of_client: z.boolean().optional(),
  owner_id: z.uuid().optional(),
  direct_owner: z
    .object({
      first_name: z.string().trim().min(1).max(100),
      last_name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(8).max(32),
      phone_has_whatsapp: z.boolean(),
    })
    .optional(),
});

/**
 * Per-type field capabilities. Rooms (chambres/sdb) only make sense for
 * residential types; bare land and commercial premises are exempt. Terrain is
 * additionally sold/rented by surface, so superficie becomes required there.
 */
export const LISTING_TYPE_CAPABILITIES: Record<
  string,
  { roomsApply: boolean; superficieRequired: boolean }
> = {
  terrain: { roomsApply: false, superficieRequired: true },
  commercial: { roomsApply: false, superficieRequired: false },
  // Hotel rooms live in room_types, not on the property row.
  hotel: { roomsApply: false, superficieRequired: false },
};

const DEFAULT_TYPE_CAPABILITIES = {
  roomsApply: true,
  superficieRequired: false,
};

export function getListingTypeCapabilities(type: string) {
  return LISTING_TYPE_CAPABILITIES[type] ?? DEFAULT_TYPE_CAPABILITIES;
}

// Amenities that describe the physical property (relevant on a sale). The
// rest (wifi, meuble) are rental perks and are stripped from sale listings.
export const SALE_EQUIPEMENT_IDS = [
  "jardin",
  "piscine",
  "solaires",
  "securite",
] as const;

/**
 * Type-conditional field rules shared by the web form (via listingSchema's
 * superRefine) and the API route (which parses listingBaseSchema.omit({photos})
 * and therefore can't use a schema-level superRefine). Returns French error
 * messages, or null when valid.
 *
 * DUPLICATED BY HAND in the mobile repo (roogo/forms/listingSchema.ts,
 * requireListingFieldsByType + the capability map) — the repos share no
 * package. Any change here MUST be mirrored there, including the exact
 * French messages.
 */
export function requireListingFieldsByType(data: {
  type: string;
  chambres: number;
  sdb: number;
  superficie?: number | null;
}): { path: "chambres" | "sdb" | "superficie"; message: string } | null {
  const caps = getListingTypeCapabilities(data.type);
  if (caps.superficieRequired && (!data.superficie || data.superficie < 1)) {
    return {
      path: "superficie",
      message: "La superficie est requise pour un terrain",
    };
  }
  if (caps.roomsApply) {
    if (data.chambres < 1) {
      return { path: "chambres", message: "Au moins 1 chambre requise" };
    }
    if (data.sdb < 1) {
      return { path: "sdb", message: "Au moins 1 douche requise" };
    }
  }
  return null;
}

export const listingSchema = listingBaseSchema.superRefine((data, ctx) => {
  if (data.on_behalf_of_client && !data.owner_id && !data.direct_owner) {
    ctx.addIssue({
      code: "custom",
      message: "Sélectionnez un propriétaire ou agent",
      path: ["owner_id"],
    });
  }

  const typeIssue = requireListingFieldsByType(data);
  if (typeIssue) {
    ctx.addIssue({
      code: "custom",
      message: typeIssue.message,
      path: [typeIssue.path],
    });
  }

  const isSale = data.listing_type === "vendre";

  if (isSale) {
    // A sale is free to submit. The owner enters a net asking price; Roogo reviews
    // the documents and negotiates a sale price + mandate before anything is published.
    // No rental-specific (frequency / payment-pack) checks apply.
    return;
  }

  // Rentals must specify a frequency.
  if (!data.frequence) {
    ctx.addIssue({
      code: "custom",
      message: "Choisissez une fréquence de location",
      path: ["frequence"],
    });
  }

  const paymentMode =
    data.listing_payment_mode ??
    (data.frequence === "journalier" ? "daily_free" : "upfront_package");
  if (paymentMode === "upfront_package" && !data.tier_id) {
    ctx.addIssue({
      code: "custom",
      message: "Choisissez un pack",
      path: ["tier_id"],
    });
  }
});

export const PROPERTY_TYPES = [
  { id: "appartement", label: "Appartement" },
  { id: "villa", label: "Villa" },
  { id: "maison", label: "Maison" },
  { id: "terrain", label: "Terrain" },
  { id: "commercial", label: "Commercial" },
  { id: "célibatorium", label: "Célibatorium" },
  { id: "hotel", label: "Hôtel" },
];

export const EQUIPEMENTS = [
  { id: "wifi", label: "WiFi" },
  { id: "securite", label: "Sécurité" },
  { id: "jardin", label: "Jardin" },
  { id: "solaires", label: "Panneaux solaires" },
  { id: "piscine", label: "Piscine" },
  { id: "meuble", label: "Meublé" },
];

export const INTERDICTIONS = [
  { id: "no_animaux", label: "Pas d'animaux" },
  { id: "no_fumeurs", label: "Pas de fumeurs" },
  { id: "no_etudiants", label: "Pas d'étudiants" },
  { id: "no_colocation", label: "Pas de colocation" },
];

export const ENABLED_CORRESPONDENTS = [
  "ORANGE_BFA",
  "MOOV_BFA",
  "ORANGE_CIV",
  "MTN_MOMO_CIV",
  "WAVE_CIV",
  "ORANGE_SEN",
  "FREE_SEN",
  "WAVE_SEN",
] as const;

export type EnabledCorrespondent = typeof ENABLED_CORRESPONDENTS[number];

export const paymentInitiateSchema = z.object({
  amount: z.number().positive(),
  /** Full MSISDN digits without + (e.g. "22670123456") — up to 15 digits */
  phoneNumber: z.string().regex(/^[0-9]{8,15}$/),
  /** New: PawaPay correspondent code (preferred over legacy `provider`) */
  correspondent: z.enum(ENABLED_CORRESPONDENTS).optional(),
  /** Legacy: kept for backward compat with older mobile builds */
  provider: z.enum(["ORANGE_MONEY", "MOOV_MONEY"]).optional(),
  // Mobile app uses: listing_submission, photography, property_lock, boost
  // Legacy/web may use: listing, lock
  transactionType: z.enum([
    "listing",
    "listing_submission",
    "boost",
    "lock",
    "property_lock",
    "photography",
    "rent_payment",
  ]),
  propertyId: z.uuid().optional(),
  preAuthorisationCode: z.string().optional(),
  description: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const hustleApplicationSchema = z.object({
  fullName: z.string().min(2, "Le nom complet est requis"),
  email: z.email("Adresse email invalide"),
  phone: z
    .string()
    .min(8, "Le numéro de téléphone doit contenir 8 chiffres")
    .max(8, "Le numéro de téléphone ne peut pas contenir plus de 8 chiffres")
    .regex(/^[0-9]+$/, "Numéro de téléphone invalide (8 chiffres requis)"),
  secondaryPhone: z
    .string()
    .min(8, "Le numéro doit contenir 8 chiffres")
    .max(8, "Le numéro ne peut pas contenir plus de 8 chiffres")
    .regex(/^[0-9]+$/, "Numéro invalide")
    .optional()
    .or(z.literal("")),
  proudAchievement: z
    .string()
    .min(10, "Veuillez détailler votre réalisation (min 10 caractères)"),
  difficultProblem: z
    .string()
    .min(10, "Veuillez détailler le problème résolu (min 10 caractères)"),
  thirtyDayStrategy: z
    .string()
    .min(20, "Veuillez détailler votre stratégie (min 20 caractères)"),
  proofLinks: z.string().optional(),
  neighborhoodChallenge: z
    .string()
    .min(
      20,
      "Veuillez détailler votre réponse au challenge (min 20 caractères)",
    ),
});
