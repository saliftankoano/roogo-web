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
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id, userId } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const membership = await getHotelMembership(user.id, id);
    if (membership?.role !== "admin") {
      return errorResponse("Forbidden", 403, req);
    }
    if (userId === user.id) {
      return errorResponse("Admins cannot remove themselves", 400, req);
    }

    const { data: removed, error } = await supabaseAdmin
      .from("hotel_members")
      .update({ status: "removed", updated_at: new Date().toISOString() })
      .eq("hotel_id", id)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!removed) return errorResponse("Member not found", 404, req);

    return cors(NextResponse.json({ success: true }), req);
  } catch (error) {
    console.error("Error removing hotel member:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
