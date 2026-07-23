import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembershipForProperty } from "@/lib/hotel-auth";
import { parseRoomTypePayload, syncHotelPropertyPrice } from "@/lib/room-types";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: roomTypes, error } = await supabaseAdmin
      .from("room_types")
      .select("*")
      .eq("property_id", id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("nightly_rate", { ascending: true });
    if (error) throw error;

    return cors(NextResponse.json({ roomTypes: roomTypes ?? [] }), req);
  } catch (error) {
    console.error("Error fetching room types:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const membership = await getHotelMembershipForProperty(user.id, id);
    if (membership?.role !== "admin") {
      return errorResponse("Forbidden", 403, req);
    }

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return errorResponse("Invalid payload", 400, req);

    const parsed = parseRoomTypePayload(body);
    if ("error" in parsed) return errorResponse(parsed.error, 400, req);

    const { data: roomType, error } = await supabaseAdmin
      .from("room_types")
      .insert({ ...parsed.value, property_id: id })
      .select("*")
      .single();
    if (error) throw error;

    await syncHotelPropertyPrice(id);

    return cors(
      NextResponse.json({ success: true, roomType }, { status: 201 }),
      req,
    );
  } catch (error) {
    console.error("Error creating room type:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
