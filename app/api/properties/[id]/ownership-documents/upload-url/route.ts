import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import {
  OWNERSHIP_DOCUMENTS_BUCKET,
  canSubmitOwnership,
  loadSellerProperty,
} from "@/lib/property-ownership";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Returns one signed upload slot per requested document. The client compresses
// each image, PUTs to the signed URL, then calls the submit route with the paths.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!canSubmitOwnership(user.user_type)) {
      return errorResponse("Only owners and agents can submit documents", 403, req);
    }

    const { id: propertyId } = await params;
    const { property, reason } = await loadSellerProperty(propertyId, user.id);
    if (!property) {
      if (reason === "owner_not_linked")
        return errorResponse("sale_owner_link_required", 409, req);
      if (reason === "forbidden")
        return errorResponse("Not your property", 403, req);
      if (reason === "not_a_sale")
        return errorResponse("Property is not a sale listing", 400, req);
      return errorResponse("Property not found", 404, req);
    }

    const body = (await req.json()) as { count?: unknown };
    const count =
      typeof body.count === "number" && body.count > 0
        ? Math.min(Math.floor(body.count), 10)
        : 1;

    const uploads = await Promise.all(
      Array.from({ length: count }, async () => {
        const path = `${user.id}/${propertyId}/${crypto.randomUUID()}.jpg`;
        const { data, error } = await supabaseAdmin.storage
          .from(OWNERSHIP_DOCUMENTS_BUCKET)
          .createSignedUploadUrl(path);
        if (error || !data)
          throw error ?? new Error("Failed to create signed upload URL");
        return { path: data.path, signedUrl: data.signedUrl, token: data.token };
      }),
    );

    return cors(NextResponse.json({ success: true, uploads }), req);
  } catch (error) {
    console.error("POST /api/properties/[id]/ownership-documents/upload-url:", error);
    return errorResponse("Failed to create upload URLs", 500, req);
  }
}
