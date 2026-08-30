import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { normalizeHotelEventCity, parseEventBlock } from "@/lib/hotel-events";
import { getHotelMembership } from "@/lib/hotel-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);
  const eventId = (await params).id;
  const { data: memberships } = await supabaseAdmin
    .from("hotel_members")
    .select("hotel_id, role")
    .eq("user_id", user.id)
    .eq("status", "active");
  const admin = memberships?.find((membership) => membership.role === "admin");
  if (!admin) return errorResponse("Forbidden", 403, req);
  const { data, error } = await supabaseAdmin
    .from("event_room_blocks")
    .select(
      "*, room_type:room_type_id(id, name, nightly_rate, total_count), property:property_id(id, quartier, city)",
    )
    .eq("event_id", eventId)
    .eq("hotel_id", admin.hotel_id);
  if (error) throw error;
  return cors(NextResponse.json({ success: true, blocks: data || [] }), req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);
  const eventId = (await params).id;
  const payload = await req.json().catch(() => ({}));
  const hotelId = typeof payload.hotelId === "string" ? payload.hotelId : "";
  const roomTypeId =
    typeof payload.roomTypeId === "string" ? payload.roomTypeId : "";
  const membership = await getHotelMembership(user.id, hotelId);
  if (membership?.role !== "admin") return errorResponse("Forbidden", 403, req);
  const parsed = parseEventBlock(payload);
  if ("error" in parsed) {
    return errorResponse(parsed.error || "Invalid event block", 400, req);
  }
  const [{ data: event }, { data: roomType }] = await Promise.all([
    supabaseAdmin
      .from("events")
      .select("id, city, status, per_diem_limit")
      .eq("id", eventId)
      .maybeSingle(),
    supabaseAdmin
      .from("room_types")
      .select(
        "id, property_id, total_count, nightly_rate, properties:property_id(hotel_id, city)",
      )
      .eq("id", roomTypeId)
      .maybeSingle(),
  ]);
  const property = Array.isArray(roomType?.properties)
    ? roomType?.properties[0]
    : roomType?.properties;
  if (
    !event ||
    event.status !== "open" ||
    !roomType ||
    !property ||
    property.hotel_id !== hotelId
  ) {
    return errorResponse("Event or room type not available", 400, req);
  }
  if (
    normalizeHotelEventCity(event.city) !==
    normalizeHotelEventCity(property.city)
  ) {
    return errorResponse("Hotel and event cities do not match", 400, req);
  }
  if (parsed.value.count_pledged > roomType.total_count) {
    return errorResponse("Pledged rooms exceed room inventory", 400, req);
  }
  if (
    event.per_diem_limit != null &&
    (parsed.value.event_nightly_rate ?? roomType.nightly_rate) >
      event.per_diem_limit
  ) {
    return errorResponse(
      "Effective room rate exceeds the event per diem",
      400,
      req,
    );
  }
  const { data, error } = await supabaseAdmin
    .from("event_room_blocks")
    .upsert(
      {
        event_id: eventId,
        hotel_id: hotelId,
        property_id: roomType.property_id,
        room_type_id: roomTypeId,
        ...parsed.value,
        status: "pledged",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,room_type_id" },
    )
    .select("*")
    .single();
  if (error) {
    if (error.message.includes("EVENT_ROOM_BLOCK_BELOW_RESERVED")) {
      return errorResponse(
        "Pledged rooms cannot be lower than existing event reservations",
        409,
        req,
      );
    }
    throw error;
  }
  return cors(NextResponse.json({ success: true, block: data }), req);
}
