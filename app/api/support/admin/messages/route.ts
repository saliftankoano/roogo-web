import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  notifyUserSupportReply,
  postSupportMessage,
} from "@/lib/support-chat";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { isStaffLikeUserType } from "@/lib/user-types";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Staff replies to a conversation; notifies the conversation's user.
export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isStaffLikeUserType(user.user_type)) {
      return errorResponse("Staff access only", 403, req);
    }

    const payload = (await req.json()) as {
      conversationId?: unknown;
      body?: unknown;
    };
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId : "";
    const body = typeof payload.body === "string" ? payload.body.trim() : "";

    if (!conversationId) return errorResponse("Missing conversation id", 400, req);
    if (!body) return errorResponse("Message is empty", 400, req);

    const { data: conversation, error: convError } = await supabaseAdmin
      .from("support_conversations")
      .select("id, user_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (convError) throw convError;
    if (!conversation) return errorResponse("Conversation not found", 404, req);

    const { message } = await postSupportMessage({
      conversationId,
      senderId: user.id,
      senderType: "staff",
      body,
    });

    await notifyUserSupportReply({
      userId: conversation.user_id,
      conversationId,
      preview: body,
    });

    return cors(NextResponse.json({ success: true, message }), req);
  } catch (error) {
    console.error("POST /api/support/admin/messages:", error);
    return errorResponse("Failed to send reply", 500, req);
  }
}
