import { z } from "zod";
import { isValidPhone } from "@/lib/phone";

export const ADVERTISER_PROOF_BUCKET = "advertiser-proofs";
export const MAX_ADVERTISER_PROOF_BYTES = 5 * 1024 * 1024;

const ADVERTISER_PROOF_MIME_BY_EXTENSION: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
};

export function canAccessAdvertisingOnboarding(userType: string | null | undefined) {
  return (
    process.env.ADVERTISING_ONBOARDING_ENABLED === "true" ||
    userType === "staff" ||
    userType === "founder"
  );
}

export function isValidAdvertiserPhone(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return /^\+?[0-9\s()-]+$/.test(normalized) && isValidPhone(normalized, "BF");
}

const advertiserDraftPhoneSchema = z
  .string()
  .trim()
  .max(30);

export const advertiserProfileInputSchema = z.object({
  businessName: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  cityServiceArea: z.string().trim().max(160).nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: advertiserDraftPhoneSchema.nullable().optional(),
  contactWhatsapp: advertiserDraftPhoneSchema.nullable().optional(),
  contactEmail: z.string().trim().max(200).nullable().optional(),
  yearsOperating: z.string().trim().max(40).nullable().optional(),
  primaryCustomer: z.string().trim().max(160).nullable().optional(),
  campaignObjective: z.string().trim().max(500).nullable().optional(),
  expectedAction: z.string().trim().max(120).nullable().optional(),
  acquisitionSource: z.string().trim().max(160).nullable().optional(),
  monthlyRevenueRange: z
    .enum([
      "under_500k",
      "500k_1m",
      "1m_5m",
      "5m_10m",
      "over_10m",
      "prefer_not_to_say",
    ])
    .nullable()
    .optional(),
});

export const advertiserProofKindSchema = z.enum([
  "registration_document",
  "storefront_photo",
  "social_profile",
  "website",
]);

export type AdvertiserProofKind = z.infer<typeof advertiserProofKindSchema>;

export function getAdvertiserProofStorageMimeType(
  storagePath: string,
  userId: string,
  kind: AdvertiserProofKind,
) {
  const parts = storagePath.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== userId ||
    !parts[1] ||
    parts[2] !== kind ||
    !/^proof\.[^.]+$/.test(parts[3])
  ) {
    return null;
  }

  const extension = parts[3].split(".").pop()?.toLowerCase() ?? "";
  const mimeType = ADVERTISER_PROOF_MIME_BY_EXTENSION[extension] ?? null;
  if (kind === "storefront_photo" && mimeType === "application/pdf") {
    return null;
  }
  return mimeType;
}

export function normalizeNullable(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function profileInputToRow(
  input: z.infer<typeof advertiserProfileInputSchema>,
) {
  return {
    business_name: normalizeNullable(input.businessName),
    category: normalizeNullable(input.category),
    city_service_area: normalizeNullable(input.cityServiceArea),
    contact_name: normalizeNullable(input.contactName),
    contact_phone: normalizeNullable(input.contactPhone),
    contact_whatsapp: normalizeNullable(input.contactWhatsapp),
    contact_email: normalizeNullable(input.contactEmail),
    years_operating: normalizeNullable(input.yearsOperating),
    primary_customer: normalizeNullable(input.primaryCustomer),
    campaign_objective: normalizeNullable(input.campaignObjective),
    expected_action: normalizeNullable(input.expectedAction),
    acquisition_source: normalizeNullable(input.acquisitionSource),
    monthly_revenue_range: input.monthlyRevenueRange ?? null,
  };
}

export function getMissingAdvertiserProfileFields(profile: Record<string, unknown>) {
  const required: Array<[string, string]> = [
    ["business_name", "businessName"],
    ["category", "category"],
    ["city_service_area", "cityServiceArea"],
    ["contact_name", "contactName"],
    ["contact_phone", "contactPhone"],
    ["contact_email", "contactEmail"],
    ["years_operating", "yearsOperating"],
    ["primary_customer", "primaryCustomer"],
    ["campaign_objective", "campaignObjective"],
    ["expected_action", "expectedAction"],
    ["acquisition_source", "acquisitionSource"],
  ];

  return required
    .filter(([column]) => {
      const value = profile[column];
      if (column === "contact_phone") {
        return typeof value !== "string" || !isValidAdvertiserPhone(value);
      }
      if (column === "contact_email") {
        return (
          typeof value !== "string" ||
          !z.string().trim().email().safeParse(value).success
        );
      }
      return typeof value !== "string" || value.trim().length === 0;
    })
    .map(([, field]) => field)
    .concat(
      typeof profile.contact_whatsapp === "string" &&
        profile.contact_whatsapp.trim().length > 0 &&
        !isValidAdvertiserPhone(profile.contact_whatsapp)
        ? ["contactWhatsapp"]
        : [],
    );
}

export function mapAdvertiserProfile(profile: Record<string, unknown> | null) {
  if (!profile) return null;
  return {
    id: profile.id,
    businessName: profile.business_name,
    category: profile.category,
    cityServiceArea: profile.city_service_area,
    contactName: profile.contact_name,
    contactPhone: profile.contact_phone,
    contactWhatsapp: profile.contact_whatsapp,
    contactEmail: profile.contact_email,
    yearsOperating: profile.years_operating,
    primaryCustomer: profile.primary_customer,
    campaignObjective: profile.campaign_objective,
    expectedAction: profile.expected_action,
    acquisitionSource: profile.acquisition_source,
    monthlyRevenueRange: profile.monthly_revenue_range,
    status: profile.status,
    submittedAt: profile.submitted_at,
    reviewedAt: profile.reviewed_at,
    rejectionReason: profile.rejection_reason,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}
