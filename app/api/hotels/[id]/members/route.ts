import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembership } from "@/lib/hotel-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const membership = await getHotelMembership(user.id, id);
    if (!membership) return errorResponse("Forbidden", 403, req);

    const { data: members, error } = await supabaseAdmin
      .from("hotel_members")
      .select(
        "id, role, status, created_at, users:user_id(id, full_name, email, phone, avatar_url)",
      )
      .eq("hotel_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) throw error;

    return cors(NextResponse.json({ members: members ?? [] }), req);
  } catch (error) {
    console.error("Error listing hotel members:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
