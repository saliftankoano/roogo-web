import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  getOrCreateConversation,
  notifyStaffNewSupportMessage,
  postSupportMessage,
  withSignedAttachmentUrls,
} from "@/lib/support-chat";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

type AttachmentInput = {
  storagePath?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  width?: unknown;
  height?: unknown;
};

// User sends a support message (text and/or screenshots already uploaded via the
// signed upload URL). Records it, updates the thread, and notifies staff.
export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const payload = (await req.json()) as {
      body?: unknown;
      attachments?: unknown;
    };

    const body = typeof payload.body === "string" ? payload.body.trim() : "";
    const rawAttachments = Array.isArray(payload.attachments)
      ? (payload.attachments as AttachmentInput[])
      : [];

    const attachments = rawAttachments
      .map((a) => ({
        storagePath: typeof a.storagePath === "string" ? a.storagePath : "",
        mimeType: typeof a.mimeType === "string" ? a.mimeType : null,
        sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
        width: typeof a.width === "number" ? a.width : null,
        height: typeof a.height === "number" ? a.height : null,
      }))
      .filter((a) => a.storagePath);

    if (!body && attachments.length === 0) {
      return errorResponse("Message is empty", 400, req);
    }

    // Attachments must belong to this user's upload namespace.
    const invalid = attachments.find(
      (a) => !a.storagePath.startsWith(`${user.id}/`),
    );
    if (invalid) {
      return errorResponse("Invalid attachment path", 400, req);
    }

    const conversation = await getOrCreateConversation(user.id);

    const { message } = await postSupportMessage({
      conversationId: conversation.id,
      senderId: user.id,
      senderType: "user",
      body: body || null,
      attachments,
    });

    const userLabel = user.full_name || user.email || "Un utilisateur Roogo";
    await notifyStaffNewSupportMessage({
      conversationId: conversation.id,
      userLabel,
      preview: body || "📷 Image",
    });

    const signedAttachments = await withSignedAttachmentUrls(
      attachments.map((a, i) => ({
        id: `${message.id}-${i}`,
        message_id: message.id,
        storage_path: a.storagePath,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
        width: a.width,
        height: a.height,
      })),
    );

    return cors(
      NextResponse.json({
        success: true,
        message: { ...message, attachments: signedAttachments },
      }),
      req,
    );
  } catch (error) {
    console.error("POST /api/support/messages:", error);
    return errorResponse("Failed to send message", 500, req);
  }
}
