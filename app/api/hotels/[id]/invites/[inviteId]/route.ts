import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembership } from "@/lib/hotel-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> },
) {
  try {
    const { id, inviteId } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const membership = await getHotelMembership(user.id, id);
    if (membership?.role !== "admin") {
      return errorResponse("Forbidden", 403, req);
    }

    const { data: revoked, error } = await supabaseAdmin
      .from("hotel_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("hotel_id", id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!revoked) return errorResponse("Invite not found", 404, req);

    return cors(NextResponse.json({ success: true }), req);
  } catch (error) {
    console.error("Error revoking hotel invite:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
