import { z } from "zod";
import { PROPERTY_TYPE_IDS } from "./constants";

export const listingBaseSchema = z.object({
  // Step 1
  titre: z.string().min(4, "Le titre doit contenir au moins 4 caractères"),
  type: z.enum(PROPERTY_TYPE_IDS),
  prixMensuel: z.coerce
    .number()
    .int()
    .min(100, "Le prix doit être au moins 100 FCFA"),
  quartier: z
    .string()
    .min(2, "Le quartier doit contenir au moins 2 caractères"),
  ville: z.enum(["ouaga", "bobo"]),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),

  // Step 2
  chambres: z.coerce.number().int().min(1, "Au moins 1 chambre requise"),
  sdb: z.coerce.number().int().min(1, "Au moins 1 douche requise"),
  superficie: z.coerce
    .number()
    .int()
    .min(1, "La superficie doit être au moins 1 m²"),
  vehicules: z.coerce.number().int().min(0),
  description: z
    .string()
    .min(10, "Min 10 caractères")
    .max(1200, "Max 1200 caractères"),
  photos: z
    .array(z.any())
    .min(3, "Au moins 3 photos requises")
    .max(15, "Maximum 15 photos"),
  equipements: z
    .array(
      z.enum(["wifi", "securite", "jardin", "solaires", "piscine", "meuble"]),
    )
    .optional(),
  cautionMois: z.coerce.number().int().min(0).max(12).optional(),
  interdictions: z
    .array(
      z.enum(["no_animaux", "no_fumeurs", "no_etudiants", "no_colocation"]),
    )
    .optional(),
  frequence: z.enum(["mensuel", "journalier"]).optional(),

  // Step 3
  tier_id: z.enum(["essentiel", "standard", "premium"]).optional(),
  payment_id: z.string().optional(),
  transaction_id: z.string().optional(),
  add_ons: z.array(z.string()).optional(),

  // Staff/founder: listing on behalf of client
  on_behalf_of_client: z.boolean().optional(),
  owner_id: z.uuid().optional(),
});

export const listingSchema = listingBaseSchema.refine(
  (data) =>
    !data.on_behalf_of_client || (data.on_behalf_of_client && data.owner_id),
  { message: "Sélectionnez un propriétaire ou agent", path: ["owner_id"] },
);

export const PROPERTY_TYPES = [
  { id: "appartement", label: "Appartement" },
  { id: "villa", label: "Villa" },
  { id: "maison", label: "Maison" },
  { id: "terrain", label: "Terrain" },
  { id: "commercial", label: "Commercial" },
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

export const paymentInitiateSchema = z.object({
  amount: z.number().positive(),
  phoneNumber: z.string().regex(/^[0-9]{8,12}$/),
  provider: z.enum(["ORANGE_MONEY", "MOOV_MONEY"]),
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
