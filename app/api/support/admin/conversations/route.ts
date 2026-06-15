import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { isStaffLikeUserType } from "@/lib/user-types";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Staff inbox: all conversations, unread first then most recent.
export async function GET(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isStaffLikeUserType(user.user_type)) {
      return errorResponse("Staff access only", 403, req);
    }

    const { data, error } = await supabaseAdmin
      .from("support_conversations")
      .select(
        "id, status, last_message_at, last_message_preview, unread_for_staff, assigned_to_staff_id, user:user_id(id, full_name, email, avatar_url, user_type)",
      )
      .order("unread_for_staff", { ascending: false })
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) throw error;

    return cors(
      NextResponse.json({ success: true, conversations: data ?? [] }),
      req,
    );
  } catch (error) {
    console.error("GET /api/support/admin/conversations:", error);
    return errorResponse("Failed to load conversations", 500, req);
  }
}
