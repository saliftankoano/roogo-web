import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  getSaleConversation,
  loadSaleMessagesWithAttachments,
  markSaleConversationRead,
  resolveRole,
} from "@/lib/sale-chat";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// GET one conversation + its message history. Marks the caller's role as read.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const { id } = await params;
    const conversation = await getSaleConversation(id);
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const role = resolveRole(conversation, {
      id: user.id,
      user_type: user.user_type,
    });
    if (!role) return errorResponse("Forbidden", 403, req);

    // Staff see who on the team wrote each message; owners and buyers only ever
    // see the Roogo team identity, so sender names are never included for them.
    const messages = await loadSaleMessagesWithAttachments(id, {
      includeSenderNames: role === "staff",
    });

    // Best-effort read receipt; don't fail the request on a counter update error.
    markSaleConversationRead(id, role).catch((e) =>
      console.error("markSaleConversationRead failed:", e),
    );

    return cors(
      NextResponse.json({
        success: true,
        conversation,
        role,
        messages,
      }),
      req,
    );
  } catch (error) {
    console.error("GET /api/sale-chat/conversations/[id]:", error);
    return errorResponse("Failed to load conversation", 500, req);
  }
}
