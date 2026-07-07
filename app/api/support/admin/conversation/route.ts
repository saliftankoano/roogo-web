import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  loadMessagesWithAttachments,
  markSupportConversationRead,
} from "@/lib/support-chat";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { isStaffLikeUserType } from "@/lib/user-types";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Staff: full thread for one conversation; marks it read for staff.
export async function GET(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isStaffLikeUserType(user.user_type)) {
      return errorResponse("Staff access only", 403, req);
    }

    const conversationId = new URL(req.url).searchParams.get("id");
    if (!conversationId) {
      return errorResponse("Missing conversation id", 400, req);
    }

    const { data: conversation, error } = await supabaseAdmin
      .from("support_conversations")
      .select(
        "*, user:user_id(id, full_name, email, avatar_url, user_type, phone)",
      )
      .eq("id", conversationId)
      .maybeSingle();

    if (error) throw error;
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    // Zero staff unread and stamp read_at on the user's messages so the user sees
    // "Lu". Skip when nothing is unread to avoid a no-op UPDATE + Realtime broadcast.
    if (conversation.unread_for_staff > 0) {
      await markSupportConversationRead(conversationId, "staff");
      conversation.unread_for_staff = 0;
    }

    const messages = await loadMessagesWithAttachments(conversationId);

    return cors(
      NextResponse.json({ success: true, conversation, messages }),
      req,
    );
  } catch (error) {
    console.error("GET /api/support/admin/conversation:", error);
    return errorResponse("Failed to load conversation", 500, req);
  }
}
