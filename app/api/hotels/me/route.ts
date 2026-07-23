import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getMembershipsForUser } from "@/lib/hotel-auth";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const memberships = await getMembershipsForUser(user.id);
    if (memberships.length === 0) {
      return cors(NextResponse.json({ hotel: null, role: null }), req);
    }

    // A user belongs to at most one hotel in the CVP; take the first.
    const membership = memberships[0];

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .eq("id", membership.hotelId)
      .single();
    if (hotelError) throw hotelError;

    const { data: properties, error: propertiesError } = await supabaseAdmin
      .from("properties")
      .select("id, quartier, city, address, status, property_type, price, frequence")
      .eq("hotel_id", membership.hotelId);
    if (propertiesError) throw propertiesError;

    return cors(
      NextResponse.json({
        hotel,
        role: membership.role,
        properties: properties ?? [],
      }),
      req,
    );
  } catch (error) {
    console.error("Error fetching hotel:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
