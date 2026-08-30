import { NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { summarizeEventDashboard } from "@/lib/hotel-events";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getStaffOrFounder(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = (await params).id;
  const [{ data: event }, { data: blocks }, { data: bookings }] =
    await Promise.all([
      supabaseAdmin.from("events").select("*").eq("id", id).maybeSingle(),
      supabaseAdmin
        .from("event_room_blocks")
        .select(
          "*, hotel:hotel_id(id, name, city), room_type:room_type_id(id, name)",
        )
        .eq("event_id", id)
        .eq("status", "pledged"),
      supabaseAdmin
        .from("daily_booking_requests")
        .select(
          "id, status, total_amount, owner_net_amount, property_id, room_type_id, renter:renter_id(full_name, phone)",
        )
        .eq("event_id", id),
    ]);
  if (!event)
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({
    success: true,
    event,
    blocks: blocks || [],
    bookings: bookings || [],
    summary: summarizeEventDashboard(blocks || [], bookings || []),
  });
}
