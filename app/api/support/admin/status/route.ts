import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { isStaffLikeUserType } from "@/lib/user-types";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

const VALID_STATUSES = ["open", "resolved", "closed"] as const;

// Staff updates a conversation status (open / resolved / closed).
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
      status?: unknown;
    };
    const conversationId =
      typeof payload.conversationId === "string" ? payload.conversationId : "";
    const status =
      typeof payload.status === "string" ? payload.status : "";

    if (!conversationId) return errorResponse("Missing conversation id", 400, req);
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return errorResponse("Invalid status", 400, req);
    }

    const { data, error } = await supabaseAdmin
      .from("support_conversations")
      .update({ status })
      .eq("id", conversationId)
      .select("id, status")
      .single();

    if (error) throw error;

    return cors(NextResponse.json({ success: true, conversation: data }), req);
  } catch (error) {
    console.error("POST /api/support/admin/status:", error);
    return errorResponse("Failed to update status", 500, req);
  }
}
