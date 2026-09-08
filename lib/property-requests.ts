import { z } from "zod";

export const PROPERTY_REQUEST_TYPES = [
  "Maison",
  "Villa",
  "Appartement",
  "Terrain",
  "Bureau",
  "Commerce",
  "Autre",
] as const;
export const PROPERTY_DOCUMENT_TYPES = [
  "PUH (Permis Urbain d'Habiter)",
  "Titre foncier",
  "Attestation de possession",
  "Plan cadastral",
  "Autre document",
  "Aucun document",
] as const;
export const RESPONSE_STATUSES = [
  "submitted",
  "contacted",
  "accepted",
  "listed",
  "rejected",
] as const;
export const RESPONSE_LABELS: Record<ResponseStatus, string> = {
  submitted: "À examiner",
  contacted: "Contact établi",
  accepted: "Retenue",
  listed: "Bien publié",
  rejected: "Non retenue",
};
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];
export function canRespondToPropertyRequest(role: string | null | undefined) {
  return role === "owner" || role === "agent";
}

const amount = z.number().int().positive().max(1_000_000_000_000);
export const propertyRequestSchema = z
  .object({
    title: z.string().trim().min(5).max(160),
    description: z.string().trim().min(10).max(4000),
    listing_type: z.enum(["vendre", "louer"]),
    property_type: z.enum(PROPERTY_REQUEST_TYPES),
    city: z.string().trim().min(2).max(100),
    neighborhood: z.string().trim().max(160).default(""),
    budget_min: amount.nullable().default(null),
    budget_max: amount,
    min_area: z.number().positive().max(10_000_000).nullable().default(null),
    min_bedrooms: z
      .number()
      .int()
      .nonnegative()
      .max(100)
      .nullable()
      .default(null),
    commission_rate: z.number().positive().max(100).multipleOf(0.01),
    commission_terms: z.string().trim().min(20).max(3000),
    customer_name: z.string().trim().min(2).max(160),
    customer_contact: z.string().trim().min(5).max(200),
    internal_notes: z.string().trim().max(4000).default(""),
    status: z.enum(["draft", "open", "closed"]).default("draft"),
  })
  .refine((v) => v.budget_min === null || v.budget_min <= v.budget_max, {
    message: "Le budget minimum doit être inférieur au maximum.",
    path: ["budget_min"],
  });

export const propertyResponseSchema = z
  .object({
    property_type: z.enum(PROPERTY_REQUEST_TYPES),
    city: z.string().trim().min(2).max(100),
    neighborhood: z.string().trim().min(2).max(160),
    address: z.string().trim().min(5).max(500),
    asking_price: amount,
    area: z.number().positive().max(10_000_000),
    bedrooms: z.number().int().nonnegative().max(100),
    bathrooms: z.number().int().nonnegative().max(100),
    description: z.string().trim().min(20).max(4000),
    document_types: z.array(z.enum(PROPERTY_DOCUMENT_TYPES)).min(1).max(6),
    document_notes: z.string().trim().max(2000).default(""),
    contact_phone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s().-]{7,25}$/, "Numéro de téléphone invalide."),
    attachments: z
      .array(
        z.object({
          path: z.string().min(1).max(300),
          name: z.string().trim().min(1).max(160),
          kind: z.enum(["photo", "document"]),
        }),
      )
      .max(10)
      .default([]),
    request_updated_at: z.iso.datetime({ offset: true }),
    terms_accepted: z.literal(true),
  })
  .refine(
    (v) =>
      !v.document_types.includes("Aucun document") ||
      v.document_types.length === 1,
    {
      message: "Choisissez les documents disponibles ou Aucun document.",
      path: ["document_types"],
    },
  )
  .refine(
    (v) =>
      !v.document_types.includes("Autre document") ||
      v.document_notes.length >= 3,
    {
      message: "Précisez le type de document disponible.",
      path: ["document_notes"],
    },
  );

export const responseReviewSchema = z
  .object({
    status: z.enum(RESPONSE_STATUSES),
    staff_notes: z.string().trim().max(4000),
    property_id: z.uuid().nullable().default(null),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .refine((v) => v.status !== "listed" || v.property_id !== null, {
    message: "Renseignez l'identifiant de l'annonce publiée.",
    path: ["property_id"],
  });

export type PropertyRequestInput = z.infer<typeof propertyRequestSchema>;
export type PropertyResponseInput = z.infer<typeof propertyResponseSchema>;
export type PropertyRequest = Omit<
  PropertyRequestInput,
  "customer_name" | "customer_contact" | "internal_notes"
> & {
  id: string;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  customer_contact?: string;
  internal_notes?: string;
  response_count?: number;
  my_response?: PropertyResponse | null;
};
export type PropertyResponse = Omit<
  PropertyResponseInput,
  "request_updated_at" | "terms_accepted" | "attachments"
> & {
  id: string;
  request_id: string;
  respondent_id: string | null;
  respondent_deleted_at: string | null;
  property_deleted_at: string | null;
  updated_at: string;
  respondent_role: "owner" | "agent";
  status: ResponseStatus;
  created_at: string;
  terms_accepted_at: string;
  commission_rate: number;
  commission_terms: string;
  commission_basis: "sale_price" | "monthly_rent";
  commission_confirmed_at: string | null;
  staff_notes?: string;
  property_id: string | null;
  attachments: Array<
    PropertyResponseInput["attachments"][number] & { url?: string | null }
  >;
  properties?: Array<{
    id: string;
    title: string;
    city: string;
    status: string;
    listing_type: string;
  }>;
  respondent?: {
    id: string;
    full_name: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    company_name: string | null;
  } | null;
};

// Explicit projection: customer contacts and internal notes never leave staff APIs.
export const PUBLIC_REQUEST_COLUMNS =
  "id,title,description,listing_type,property_type,city,neighborhood,budget_min,budget_max,min_area,min_bedrooms,commission_rate,commission_terms,status,created_at,updated_at";
export const OWN_RESPONSE_COLUMNS =
  "id,request_id,respondent_id,respondent_role,respondent_deleted_at,property_deleted_at,updated_at,property_type,city,neighborhood,address,asking_price,area,bedrooms,bathrooms,description,document_types,document_notes,contact_phone,attachments,status,created_at,terms_accepted_at,commission_rate,commission_terms,commission_basis,commission_confirmed_at,property_id";
export const REQUEST_ATTACHMENTS_BUCKET = "property-request-files";
export const REQUEST_FILE_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function commissionEstimate(price: number, rate: number) {
  return Math.round((price * rate) / 100);
}

export function matchesResponseTransaction(
  property: {
    listing_type: string;
    frequence?: string | null;
    period?: string | null;
  },
  basis: PropertyResponse["commission_basis"],
) {
  return basis === "sale_price"
    ? property.listing_type === "vendre"
    : property.listing_type === "louer" &&
        property.frequence !== "journalier" &&
        property.period !== "day" &&
        (property.frequence === "mensuel" || property.period === "month");
}

export function isRequestAttachmentPath(
  path: string,
  userId: string,
  requestId: string,
) {
  const prefix = `${userId}/${requestId}/`;
  return (
    path.startsWith(prefix) &&
    /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(path.slice(prefix.length))
  );
}
