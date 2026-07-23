import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembership } from "@/lib/hotel-auth";
import {
  DESK_BOOKING_SELECT,
  DESK_VISIBLE_STATUSES,
  serializeDeskBooking,
} from "@/lib/hotel-desk";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const date = url.searchParams.get("date") ?? "";
    if (!DATE_RE.test(date)) {
      return errorResponse("Invalid date", 400, req);
    }

    const { data: properties, error: propertiesError } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("hotel_id", id);
    if (propertiesError) throw propertiesError;

    const propertyIds = (properties ?? []).map((p) => p.id);
    if (propertyIds.length === 0) {
      return cors(
        NextResponse.json({
          arrivals: [],
          departures: [],
          inHouse: [],
          pending: [],
        }),
        req,
      );
    }

    const [arrivalsRes, departuresRes, inHouseRes, pendingRes] =
      await Promise.all([
        supabaseAdmin
          .from("daily_booking_requests")
          .select(DESK_BOOKING_SELECT)
          .in("property_id", propertyIds)
          .eq("start_date", date)
          .in("status", DESK_VISIBLE_STATUSES)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("daily_booking_requests")
          .select(DESK_BOOKING_SELECT)
          .in("property_id", propertyIds)
          .eq("end_date", date)
          .in("status", DESK_VISIBLE_STATUSES)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("daily_booking_requests")
          .select(DESK_BOOKING_SELECT)
          .in("property_id", propertyIds)
          .lt("start_date", date)
          .gt("end_date", date)
          .eq("status", "checked_in")
          .order("start_date", { ascending: true }),
        supabaseAdmin
          .from("daily_booking_requests")
          .select(DESK_BOOKING_SELECT)
          .in("property_id", propertyIds)
          .eq("status", "requested")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: true }),
      ]);

    for (const res of [arrivalsRes, departuresRes, inHouseRes, pendingRes]) {
      if (res.error) throw res.error;
    }

    return cors(
      NextResponse.json({
        arrivals: (arrivalsRes.data ?? []).map(serializeDeskBooking),
        departures: (departuresRes.data ?? []).map(serializeDeskBooking),
        inHouse: (inHouseRes.data ?? []).map(serializeDeskBooking),
        pending: (pendingRes.data ?? []).map(serializeDeskBooking),
      }),
      req,
    );
  } catch (error) {
    console.error("Error fetching hotel desk bookings:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
