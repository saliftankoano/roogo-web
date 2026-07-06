import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import { SALE_CHAT_ATTACHMENTS_BUCKET } from "@/lib/sale-chat";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Signed upload URL for a sale-chat image. Files live under the caller's user id
// so the messages route can validate ownership before recording the attachment.
export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const { data, error } = await supabaseAdmin.storage
      .from(SALE_CHAT_ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw error ?? new Error("Failed to create signed upload URL");
    }

    return cors(
      NextResponse.json({
        success: true,
        storagePath: data.path,
        signedUrl: data.signedUrl,
        token: data.token,
      }),
      req,
    );
  } catch (error) {
    console.error("POST /api/sale-chat/upload-url:", error);
    return errorResponse("Failed to create upload URL", 500, req);
  }
}
