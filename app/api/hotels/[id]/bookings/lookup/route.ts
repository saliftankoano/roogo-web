import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembership } from "@/lib/hotel-auth";
import { normalizeBookingCode } from "@/lib/booking-codes";
import {
  DESK_BOOKING_SELECT,
  DESK_VISIBLE_STATUSES,
  serializeDeskBooking,
} from "@/lib/hotel-desk";

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

    const url = new URL(req.url);
    const rawCode = url.searchParams.get("code");
    const rawPhone = url.searchParams.get("phone");
    if (!rawCode && !rawPhone) {
      return errorResponse("Provide a booking code or a phone number", 400, req);
    }

    // Results are strictly scoped to this hotel's properties.
    const { data: properties, error: propertiesError } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("hotel_id", id);
    if (propertiesError) throw propertiesError;

    const propertyIds = (properties ?? []).map((p) => p.id);
    if (propertyIds.length === 0) {
      return cors(NextResponse.json({ bookings: [] }), req);
    }

    let query = supabaseAdmin
      .from("daily_booking_requests")
      .select(DESK_BOOKING_SELECT)
      .in("property_id", propertyIds)
      .in("status", DESK_VISIBLE_STATUSES)
      .order("start_date", { ascending: false })
      .limit(10);

    if (rawCode) {
      query = query.eq("booking_code", normalizeBookingCode(rawCode));
    } else {
      const digits = (rawPhone ?? "").replace(/\D/g, "");
      if (digits.length < 6) {
        return errorResponse("Phone number is too short", 400, req);
      }
      // Match guests whose phone ends with the searched digits (handles
      // +226 prefixes and spacing differences).
      const { data: guests, error: guestsError } = await supabaseAdmin
        .from("users")
        .select("id")
        .ilike("phone", `%${digits.slice(-8)}%`)
        .limit(20);
      if (guestsError) throw guestsError;

      const guestIds = (guests ?? []).map((g) => g.id);
      if (guestIds.length === 0) {
        return cors(NextResponse.json({ bookings: [] }), req);
      }
      query = query.in("renter_id", guestIds);
    }

    const { data: bookings, error } = await query;
    if (error) throw error;

    return cors(
      NextResponse.json({
        bookings: (bookings ?? []).map(serializeDeskBooking),
      }),
      req,
    );
  } catch (error) {
    console.error("Error looking up hotel booking:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
