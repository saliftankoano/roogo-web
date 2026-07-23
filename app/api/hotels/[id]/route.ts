import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembership } from "@/lib/hotel-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const membership = await getHotelMembership(user.id, id);
    if (membership?.role !== "admin") {
      return errorResponse("Forbidden", 403, req);
    }

    const body = await req.json().catch(() => null);
    const updates: Record<string, string | null> = {};
    if (typeof body?.name === "string" && body.name.trim().length >= 2) {
      updates.name = body.name.trim();
    }
    if (typeof body?.city === "string") updates.city = body.city.trim() || null;
    if (typeof body?.phone === "string") {
      updates.phone = body.phone.trim() || null;
    }
    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", 400, req);
    }
    updates.updated_at = new Date().toISOString();

    const { data: hotel, error } = await supabaseAdmin
      .from("hotels")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return cors(NextResponse.json({ success: true, hotel }), req);
  } catch (error) {
    console.error("Error updating hotel:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
