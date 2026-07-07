import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import {
  getOrCreateConversation,
  loadMessagesWithAttachments,
  markSupportConversationRead,
} from "@/lib/support-chat";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Returns the caller's single support conversation + full message history. Marks
// the thread as read for the user.
export async function GET(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const conversation = await getOrCreateConversation(user.id);

    // Zero the user's unread counter and stamp read_at on staff messages so the
    // staff side sees "Lu". Skip entirely when nothing is unread — a zero counter
    // means there are no unread incoming messages to stamp, so this avoids a no-op
    // UPDATE + Realtime broadcast on every idle open/poll.
    if (conversation.unread_for_user > 0) {
      await markSupportConversationRead(conversation.id, "user");
      conversation.unread_for_user = 0;
    }

    const messages = await loadMessagesWithAttachments(conversation.id);

    return cors(
      NextResponse.json({ success: true, conversation, messages }),
      req,
    );
  } catch (error) {
    console.error("GET /api/support/conversation:", error);
    return errorResponse("Failed to load conversation", 500, req);
  }
}
