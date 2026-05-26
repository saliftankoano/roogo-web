import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { IDENTITY_DOCUMENTS_BUCKET, isVerifiableUserType } from "@/lib/identity-verifications";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

async function createUploadSlot(userId: string, side: "front" | "back") {
  const path = `${userId}/${crypto.randomUUID()}/${side}.jpg`;
  const { data, error } = await supabaseAdmin.storage
    .from(IDENTITY_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw error ?? new Error("Failed to create signed upload URL");
  }

  return {
    path: data.path,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isVerifiableUserType(user.user_type)) {
      return errorResponse("Only owners and agents can verify identity", 403, req);
    }
    if (user.identity_verification_status === "approved") {
      return errorResponse("Identity is already verified", 409, req);
    }

    const [front, back] = await Promise.all([
      createUploadSlot(user.id, "front"),
      createUploadSlot(user.id, "back"),
    ]);

    return cors(
      NextResponse.json({
        success: true,
        uploads: { front, back },
      }),
      req,
    );
  } catch (error) {
    console.error("POST /api/identity-verifications/upload-url:", error);
    return errorResponse("Failed to create upload URLs", 500, req);
  }
}
