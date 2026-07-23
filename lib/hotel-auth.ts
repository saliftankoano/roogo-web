import { supabaseAdmin } from "@/lib/supabase-admin";

export type HotelRole = "admin" | "staff";

export type HotelMembership = {
  hotelId: string;
  role: HotelRole;
};

export async function getHotelMembership(
  userId: string,
  hotelId: string,
): Promise<HotelMembership | null> {
  const { data, error } = await supabaseAdmin
    .from("hotel_members")
    .select("hotel_id, role")
    .eq("hotel_id", hotelId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { hotelId: data.hotel_id, role: data.role as HotelRole };
}

export async function getMembershipsForUser(
  userId: string,
): Promise<HotelMembership[]> {
  const { data, error } = await supabaseAdmin
    .from("hotel_members")
    .select("hotel_id, role")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) throw error;
  return (data ?? []).map((row) => ({
    hotelId: row.hotel_id,
    role: row.role as HotelRole,
  }));
}

export async function getHotelMembershipForProperty(
  userId: string,
  propertyId: string,
): Promise<HotelMembership | null> {
  const { data: property, error } = await supabaseAdmin
    .from("properties")
    .select("hotel_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) throw error;
  if (!property?.hotel_id) return null;
  return getHotelMembership(userId, property.hotel_id);
}

export type HotelBookingAction =
  | "approve"
  | "decline"
  | "check_in"
  | "checkout"
  | "lookup";

const ADMIN_ONLY_ACTIONS: HotelBookingAction[] = ["approve", "decline"];

/**
 * Returns the membership if `userId` may perform `action` on a booking of
 * `propertyId`, otherwise null. Admins can do everything; staff can handle
 * check-in/checkout and lookups but not approve/decline.
 */
export async function getHotelBookingActor(
  userId: string,
  propertyId: string,
  action: HotelBookingAction,
): Promise<HotelMembership | null> {
  const membership = await getHotelMembershipForProperty(userId, propertyId);
  if (!membership) return null;
  if (ADMIN_ONLY_ACTIONS.includes(action) && membership.role !== "admin") {
    return null;
  }
  return membership;
}
