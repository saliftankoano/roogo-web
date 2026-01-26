import { z } from "zod";

export const listingSchema = z.object({
  title: z.string().min(1).max(200),
  price: z.number().positive(),
  quartier: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  property_type: z.enum([
    "house",
    "apartment",
    "villa",
    "studio",
    "commercial",
  ]),
  period: z.enum(["month", "year"]).optional(),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  area: z.number().positive().optional(),
  parking_spaces: z.number().min(0).optional(),
  tier_id: z.enum(["essentiel", "standard", "premium"]).optional(),
  description: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  interdictions: z.array(z.string()).optional(),
});

export const paymentInitiateSchema = z.object({
  amount: z.number().positive(),
  phoneNumber: z.string().regex(/^[0-9]{8,12}$/),
  provider: z.enum(["ORANGE_MONEY", "MOOV_MONEY"]),
  transactionType: z.enum(["listing", "boost", "lock"]),
  propertyId: z.string().uuid().optional(),
  preAuthorisationCode: z.string().optional(),
  description: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
