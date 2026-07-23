import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembershipForProperty } from "@/lib/hotel-auth";
import { parseRoomTypePayload, syncHotelPropertyPrice } from "@/lib/room-types";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

async function requireAdminForRoomType(req: Request, roomTypeId: string) {
  const user = await getAuthenticatedUser(req);
  if (!user) return { error: errorResponse("Unauthorized", 401, req) };

  const { data: roomType, error } = await supabaseAdmin
    .from("room_types")
    .select("*")
    .eq("id", roomTypeId)
    .maybeSingle();
  if (error) throw error;
  if (!roomType) return { error: errorResponse("Room type not found", 404, req) };

  const membership = await getHotelMembershipForProperty(
    user.id,
    roomType.property_id,
  );
  if (membership?.role !== "admin") {
    return { error: errorResponse("Forbidden", 403, req) };
  }
  return { roomType };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await requireAdminForRoomType(req, id);
    if ("error" in guard) return guard.error;

    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return errorResponse("Invalid payload", 400, req);

    // Merge with the existing row so partial updates work with the same parser.
    const parsed = parseRoomTypePayload({
      name: body.name ?? guard.roomType.name,
      description: body.description ?? guard.roomType.description,
      photos: body.photos ?? guard.roomType.photos,
      nightlyRate: body.nightlyRate ?? body.nightly_rate ?? guard.roomType.nightly_rate,
      capacity: body.capacity ?? guard.roomType.capacity,
      amenities: body.amenities ?? guard.roomType.amenities,
      totalCount: body.totalCount ?? body.total_count ?? guard.roomType.total_count,
      sortOrder: body.sortOrder ?? body.sort_order ?? guard.roomType.sort_order,
    });
    if ("error" in parsed) return errorResponse(parsed.error, 400, req);

    const { data: roomType, error } = await supabaseAdmin
      .from("room_types")
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    await syncHotelPropertyPrice(guard.roomType.property_id);

    return cors(NextResponse.json({ success: true, roomType }), req);
  } catch (error) {
    console.error("Error updating room type:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await requireAdminForRoomType(req, id);
    if ("error" in guard) return guard.error;

    // A published hotel must keep at least one bookable room type: otherwise
    // the listing stays live advertising a price for inventory that no longer
    // exists (properties.price is synced from room rates).
    if (guard.roomType.is_active) {
      const [{ data: property, error: propertyError }, { count: otherActive, error: activeError }] =
        await Promise.all([
          supabaseAdmin
            .from("properties")
            .select("status")
            .eq("id", guard.roomType.property_id)
            .maybeSingle(),
          supabaseAdmin
            .from("room_types")
            .select("id", { count: "exact", head: true })
            .eq("property_id", guard.roomType.property_id)
            .eq("is_active", true)
            .neq("id", id),
        ]);
      if (propertyError) throw propertyError;
      if (activeError) throw activeError;
      if (property?.status === "en_ligne" && (otherActive ?? 0) === 0) {
        return errorResponse(
          "Un hôtel publié doit garder au moins un type de chambre.",
          400,
          req,
        );
      }
    }

    const { count, error: bookingsError } = await supabaseAdmin
      .from("daily_booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("room_type_id", id);
    if (bookingsError) throw bookingsError;

    if ((count ?? 0) > 0) {
      // Bookings reference this type: soft-delete so history stays intact.
      const { error } = await supabaseAdmin
        .from("room_types")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("room_types")
        .delete()
        .eq("id", id);
      // 23503: a booking landed between the count and the delete; the FK is
      // ON DELETE RESTRICT precisely for this race. Fall back to soft-delete.
      if (error?.code === "23503") {
        const { error: softDeleteError } = await supabaseAdmin
          .from("room_types")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (softDeleteError) throw softDeleteError;
      } else if (error) {
        throw error;
      }
    }

    await syncHotelPropertyPrice(guard.roomType.property_id);

    return cors(NextResponse.json({ success: true }), req);
  } catch (error) {
    console.error("Error deleting room type:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
