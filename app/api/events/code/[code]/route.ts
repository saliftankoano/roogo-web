import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { normalizeEventCode } from "@/lib/hotel-events";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = normalizeEventCode((await params).code);
  const roomTypeId = new URL(req.url).searchParams.get("roomTypeId");
  if (!code || !roomTypeId)
    return errorResponse("Invalid event lookup", 400, req);
  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, code, name, city, start_date, end_date, per_diem_limit")
    .ilike("code", code)
    .eq("status", "open")
    .maybeSingle();
  if (!event) return errorResponse("Event not found", 404, req);
  const { data: block } = await supabaseAdmin
    .from("event_room_blocks")
    .select(
      "id, hotel_id, property_id, room_type_id, count_pledged, event_nightly_rate",
    )
    .eq("event_id", event.id)
    .eq("room_type_id", roomTypeId)
    .eq("status", "pledged")
    .maybeSingle();
  if (!block)
    return errorResponse("This room is not part of the event", 404, req);
  return cors(
    NextResponse.json({
      success: true,
      event: {
        id: event.id,
        code: event.code,
        name: event.name,
        city: event.city,
        startDate: event.start_date,
        endDate: event.end_date,
        perDiemLimit: event.per_diem_limit,
        eventNightlyRate: block.event_nightly_rate,
      },
    }),
    req,
  );
}
