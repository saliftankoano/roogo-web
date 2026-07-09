import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  SALE_CHAT_ATTACHMENTS_BUCKET,
  saleDocumentExtensionForMime,
} from "@/lib/sale-chat";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Signed upload URL for a sale-chat attachment (image by default, a voice note
// when the body asks for kind "audio", or a document for kind "document" with an
// allowlisted mimeType: PDF and common office types). Files live under the
// caller's user id so the messages route can validate ownership before
// recording the attachment.
export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    // The historical mobile client sends no body; treat that as an image upload.
    let kind: "image" | "audio" | "document" = "image";
    let documentMime: string | null = null;
    try {
      const payload = (await req.json()) as { kind?: unknown; mimeType?: unknown };
      if (payload?.kind === "audio") kind = "audio";
      else if (payload?.kind === "document") {
        kind = "document";
        documentMime = typeof payload.mimeType === "string" ? payload.mimeType : null;
      }
    } catch {
      // No/invalid JSON body: keep the image default.
    }

    let ext: string;
    if (kind === "audio") {
      ext = "m4a";
    } else if (kind === "document") {
      const documentExt = saleDocumentExtensionForMime(documentMime);
      if (!documentExt) {
        return errorResponse("Unsupported document type", 400, req);
      }
      ext = documentExt;
    } else {
      ext = "jpg";
    }
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
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
