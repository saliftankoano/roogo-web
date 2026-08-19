import { supabaseAdmin } from "@/lib/supabase-admin";

// Private storage bucket for property ownership documents (titre foncier,
// attestation, plan cadastral...). Mirrors identity-documents (migration 025).
export const OWNERSHIP_DOCUMENTS_BUCKET = "ownership-documents";

// Signed-URL TTL for staff to view submitted documents in the admin panel.
export const OWNERSHIP_SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes

export const OWNERSHIP_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const OWNERSHIP_DOCUMENT_MAX_FILES_PER_UPLOAD = 10;
export const OWNERSHIP_DOCUMENT_MAX_FILES_PER_SUBMISSION = 20;

export const OWNERSHIP_DOCUMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type OwnershipDocument = {
  label: string;
  storage_path: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  source?: "seller" | "staff";
  uploaded_by?: string;
};

export type OwnershipVerificationStatus =
  | "unsubmitted"
  | "pending"
  | "approved"
  | "rejected";

// Only owners/agents list sale properties; reuse the same gate as identity.
export function canSubmitOwnership(userType: string | null | undefined) {
  return userType === "owner" || userType === "agent";
}

type SellerProperty = {
  id: string;
  agent_id: string | null;
  listing_type: string;
  ownership_verification_status: string;
  status: string;
};

type LoadSellerPropertyResult =
  | { property: SellerProperty; reason: null }
  | {
      property: null;
      reason: "not_found" | "forbidden" | "not_a_sale" | "owner_not_linked";
    };

// Confirms the caller is the property's lister (agent_id) and that it's a sale.
export async function loadSellerProperty(
  propertyId: string,
  userId: string,
): Promise<LoadSellerPropertyResult> {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, agent_id, listing_type, ownership_verification_status, status")
    .eq("id", propertyId)
    .maybeSingle<SellerProperty>();

  if (error) throw error;
  if (!data) return { property: null, reason: "not_found" };
  if (!data.agent_id) return { property: null, reason: "owner_not_linked" };
  if (data.agent_id !== userId)
    return { property: null, reason: "forbidden" };
  if (data.listing_type !== "vendre")
    return { property: null, reason: "not_a_sale" };
  return { property: data, reason: null };
}

// Attach short-lived signed URLs to a submission's stored document paths so staff
// can preview them. Never expose raw storage paths to clients.
export async function withSignedOwnershipDocUrls(
  documents: OwnershipDocument[],
): Promise<Array<OwnershipDocument & { url: string | null }>> {
  return Promise.all(
    (documents ?? []).map(async (doc) => {
      const { data } = await supabaseAdmin.storage
        .from(OWNERSHIP_DOCUMENTS_BUCKET)
        .createSignedUrl(doc.storage_path, OWNERSHIP_SIGNED_URL_TTL_SECONDS);
      return { ...doc, url: data?.signedUrl ?? null };
    }),
  );
}
