import { z } from "zod";

export const listingSchema = z.object({
  // Step 1
  titre: z.string().min(4, "Le titre doit contenir au moins 4 caractères"),
  type: z.enum(["villa", "appartement", "maison", "terrain", "commercial"]),
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

  // Step 3
  tier_id: z.enum(["essentiel", "standard", "premium"]).optional(),
  payment_id: z.string().optional(),
  transaction_id: z.string().optional(),
  add_ons: z.array(z.string()).optional(),
});

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
  ]),
  propertyId: z.string().uuid().optional(),
  preAuthorisationCode: z.string().optional(),
  description: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
