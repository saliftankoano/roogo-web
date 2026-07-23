import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Keeps the hotel listing's headline price equal to the cheapest active room
 * type. The card renders "A partir de {price} / nuit" and price-based sorting
 * reads properties.price, so it must track room rates, not the wizard value.
 */
export async function syncHotelPropertyPrice(propertyId: string) {
  const { data: cheapest, error } = await supabaseAdmin
    .from("room_types")
    .select("nightly_rate")
    .eq("property_id", propertyId)
    .eq("is_active", true)
    .order("nightly_rate", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!cheapest) return; // no active room types: keep the wizard price

  const { error: updateError } = await supabaseAdmin
    .from("properties")
    .update({ price: cheapest.nightly_rate })
    .eq("id", propertyId)
    .eq("property_type", "hotel");
  if (updateError) throw updateError;
}

export type RoomTypePayload = {
  name: string;
  description: string | null;
  photos: string[];
  nightly_rate: number;
  capacity: number;
  amenities: string[];
  total_count: number;
  sort_order: number | null;
};

export function parseRoomTypePayload(
  body: Record<string, unknown>,
): { value: RoomTypePayload } | { error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const nightlyRate = Number(body.nightlyRate ?? body.nightly_rate);
  const capacity = Number(body.capacity ?? 2);
  const totalCount = Number(body.totalCount ?? body.total_count);
  const description =
    typeof body.description === "string" ? body.description.trim() || null : null;
  const photos = Array.isArray(body.photos)
    ? body.photos.filter((p): p is string => typeof p === "string").slice(0, 10)
    : [];
  const amenities = Array.isArray(body.amenities)
    ? body.amenities.filter((a): a is string => typeof a === "string").slice(0, 20)
    : [];
  const rawSortOrder = body.sortOrder ?? body.sort_order;
  const sortOrder = Number.isInteger(rawSortOrder) ? Number(rawSortOrder) : null;

  if (!name || name.length < 2) return { error: "Room type name is required" };
  if (!Number.isFinite(nightlyRate) || nightlyRate < 0) {
    return { error: "Invalid nightly rate" };
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
    return { error: "Invalid capacity" };
  }
  if (!Number.isInteger(totalCount) || totalCount < 1 || totalCount > 500) {
    return { error: "Invalid room count" };
  }

  return {
    value: {
      name,
      description,
      photos,
      nightly_rate: Math.round(nightlyRate),
      capacity,
      amenities,
      total_count: totalCount,
      sort_order: sortOrder,
    },
  };
}
