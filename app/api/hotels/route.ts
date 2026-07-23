import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const city = typeof body?.city === "string" ? body.city.trim() : null;
    const phone = typeof body?.phone === "string" ? body.phone.trim() : null;

    if (!name || name.length < 2) {
      return errorResponse("Hotel name is required", 400, req);
    }

    // Friendly pre-check; the partial unique index on hotel_members(user_id)
    // WHERE status = 'active' is the real guarantee against races.
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("hotel_members")
      .select("hotel_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);
    if (existingError) throw existingError;
    if (existingRows && existingRows.length > 0) {
      return errorResponse("You already belong to a hotel", 409, req);
    }

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .insert({ name, city, phone, created_by: user.id })
      .select("*")
      .single();
    if (hotelError) throw hotelError;

    const { error: memberError } = await supabaseAdmin
      .from("hotel_members")
      .insert({ hotel_id: hotel.id, user_id: user.id, role: "admin" });
    if (memberError) {
      // Lost a race with a concurrent join/create: remove the orphan hotel.
      await supabaseAdmin.from("hotels").delete().eq("id", hotel.id);
      if (memberError.code === "23505") {
        return errorResponse("You already belong to a hotel", 409, req);
      }
      throw memberError;
    }

    return cors(
      NextResponse.json({ success: true, hotel, role: "admin" }, { status: 201 }),
      req,
    );
  } catch (error) {
    console.error("Error creating hotel:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
