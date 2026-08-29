import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembership } from "@/lib/hotel-auth";
import {
  normalizeHotelPayoutSettings,
  summarizeHotelOperations,
} from "@/lib/hotel-operations";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
    if (membership?.role !== "admin") return errorResponse("Forbidden", 403, req);

    const requestedDays = Number(new URL(req.url).searchParams.get("days") || 30);
    const periodDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - periodDays);

    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("id, name, payout_provider, payout_phone")
      .eq("id", id)
      .single();
    if (hotelError) throw hotelError;

    const { data: properties, error: propertiesError } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("hotel_id", id);
    if (propertiesError) throw propertiesError;
    const propertyIds = (properties || []).map((property) => property.id);

    const [{ data: bookings, error: bookingsError }, { data: roomTypes, error: roomsError }] =
      await Promise.all([
        propertyIds.length
          ? supabaseAdmin
              .from("daily_booking_requests")
              .select(
                "status, start_date, nights, stay_amount, owner_commission_amount, owner_net_amount",
              )
              .in("property_id", propertyIds)
              .gte("start_date", since.toISOString().slice(0, 10))
          : Promise.resolve({ data: [], error: null }),
        propertyIds.length
          ? supabaseAdmin
              .from("room_types")
              .select("total_count")
              .in("property_id", propertyIds)
              .eq("is_active", true)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (bookingsError) throw bookingsError;
    if (roomsError) throw roomsError;

    return cors(
      NextResponse.json({
        hotel: {
          id: hotel.id,
          name: hotel.name,
          payoutProvider: hotel.payout_provider,
          payoutPhone: hotel.payout_phone,
        },
        analytics: summarizeHotelOperations(bookings || [], roomTypes || [], periodDays),
      }),
      req,
    );
  } catch (error) {
    console.error("Error fetching hotel operations:", error);
    return errorResponse("Internal server error", 500, req);
  }
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
    if (membership?.role !== "admin") return errorResponse("Forbidden", 403, req);

    const parsed = normalizeHotelPayoutSettings(await req.json().catch(() => ({})));
    if ("error" in parsed) return errorResponse(parsed.error, 400, req);

    const { data: hotel, error } = await supabaseAdmin
      .from("hotels")
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, payout_provider, payout_phone")
      .single();
    if (error) throw error;

    return cors(
      NextResponse.json({
        success: true,
        hotel: {
          id: hotel.id,
          name: hotel.name,
          payoutProvider: hotel.payout_provider,
          payoutPhone: hotel.payout_phone,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("Error updating hotel payout settings:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
