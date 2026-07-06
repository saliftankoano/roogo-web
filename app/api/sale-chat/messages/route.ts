import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  getSaleConversation,
  postSaleMessage,
  resolveRole,
  withSignedSaleAttachmentUrls,
} from "@/lib/sale-chat";
import { notifySaleMessageCoalesced } from "@/lib/sale-notifications";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyStaffSaleMessage } from "@/lib/sale-notifications";

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

// Send a message in a sale conversation. Roogo is the only counterparty, so the
// caller is either the thread's user or a staff member. No consent gate.
export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const payload = (await req.json()) as {
      conversationId?: unknown;
      body?: unknown;
      attachments?: unknown;
    };
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId : "";
    if (!conversationId)
      return errorResponse("conversationId is required", 400, req);

    const conversation = await getSaleConversation(conversationId);
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const role = resolveRole(conversation, {
      id: user.id,
      user_type: user.user_type,
    });
    if (!role) return errorResponse("Forbidden", 403, req);

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

    const invalid = attachments.find(
      (a) => !a.storagePath.startsWith(`${user.id}/`),
    );
    if (invalid) return errorResponse("Invalid attachment path", 400, req);

    const { message } = await postSaleMessage({
      conversationId,
      senderId: user.id,
      senderType: role,
      body: body || null,
      attachments,
    });

    // Notify the other side. Staff → the thread's user (coalesced). User → the Roogo
    // team (assigned staff if any, else all staff so the thread gets picked up).
    if (role === "staff") {
      const senderLabel = "Roogo";
      notifySaleMessageCoalesced({
        recipientId: conversation.user_id,
        conversationId: conversation.id,
        senderLabel,
      }).catch((e) => console.error("sale message notify failed:", e));
    } else {
      const senderLabel = user.full_name || "Un utilisateur";
      notifyStaffSaleMessage({
        conversation,
        senderLabel,
      }).catch((e) => console.error("sale message staff notify failed:", e));
    }

    const signedAttachments = await withSignedSaleAttachmentUrls(
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
    console.error("POST /api/sale-chat/messages:", error);
    return errorResponse("Failed to send message", 500, req);
  }
}
