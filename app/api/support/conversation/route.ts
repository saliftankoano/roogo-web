import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getOrCreateConversation,
  loadMessagesWithAttachments,
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
    const messages = await loadMessagesWithAttachments(conversation.id);

    if (conversation.unread_for_user > 0) {
      await supabaseAdmin
        .from("support_conversations")
        .update({ unread_for_user: 0 })
        .eq("id", conversation.id);
      conversation.unread_for_user = 0;
    }

    return cors(
      NextResponse.json({ success: true, conversation, messages }),
      req,
    );
  } catch (error) {
    console.error("GET /api/support/conversation:", error);
    return errorResponse("Failed to load conversation", 500, req);
  }
}
