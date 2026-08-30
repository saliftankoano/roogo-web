import { getHotelMembershipForProperty } from "@/lib/hotel-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
export { normalizeHotelChatBody } from "@/lib/hotel-chat-validation";

export type HotelChatRole = "guest" | "hotel";

export async function resolveHotelBookingChatAccess(userId: string, bookingId: string) {
  const { data: booking, error } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("id, renter_id, property_id, booking_code, status, properties:property_id(hotel_id)")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) return null;

  const property = Array.isArray(booking.properties)
    ? booking.properties[0]
    : booking.properties;
  const hotelId = property?.hotel_id;
  if (!hotelId) return null;
  if (booking.renter_id === userId) {
    return { role: "guest" as const, booking, hotelId };
  }
  const membership = await getHotelMembershipForProperty(userId, booking.property_id);
  if (!membership) return null;
  return { role: "hotel" as const, booking, hotelId };
}

export async function getOrCreateHotelBookingConversation(params: {
  bookingId: string;
  hotelId: string;
  guestId: string;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("hotel_booking_conversations")
    .select("*")
    .eq("booking_request_id", params.bookingId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("hotel_booking_conversations")
    .insert({
      booking_request_id: params.bookingId,
      hotel_id: params.hotelId,
      guest_id: params.guestId,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: raced, error: racedError } = await supabaseAdmin
        .from("hotel_booking_conversations")
        .select("*")
        .eq("booking_request_id", params.bookingId)
        .single();
      if (racedError) throw racedError;
      return raced;
    }
    throw error;
  }
  return data;
}

export async function loadHotelBookingMessages(conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from("hotel_booking_messages")
    .select("id, conversation_id, sender_id, sender_role, body, read_at, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function markHotelConversationRead(
  conversationId: string,
  role: HotelChatRole,
) {
  await Promise.all([
    supabaseAdmin
      .from("hotel_booking_conversations")
      .update(role === "guest" ? { unread_for_guest: 0 } : { unread_for_hotel: 0 })
      .eq("id", conversationId),
    supabaseAdmin
      .from("hotel_booking_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .neq("sender_role", role)
      .is("read_at", null),
  ]);
}

export async function postHotelBookingMessage(params: {
  conversationId: string;
  senderId: string;
  senderRole: HotelChatRole;
  body: string;
}) {
  const { data: message, error } = await supabaseAdmin
    .from("hotel_booking_messages")
    .insert({
      conversation_id: params.conversationId,
      sender_id: params.senderId,
      sender_role: params.senderRole,
      body: params.body,
    })
    .select("*")
    .single();
  if (error) throw error;

  const preview = params.body.slice(0, 140);
  const unreadColumn =
    params.senderRole === "guest" ? "unread_for_hotel" : "unread_for_guest";
  const { data: conversation } = await supabaseAdmin
    .from("hotel_booking_conversations")
    .select("unread_for_guest, unread_for_hotel")
    .eq("id", params.conversationId)
    .single();
  const nextUnread =
    Number(
      unreadColumn === "unread_for_guest"
        ? conversation?.unread_for_guest
        : conversation?.unread_for_hotel,
    ) + 1;
  await supabaseAdmin
    .from("hotel_booking_conversations")
    .update({
      last_message_at: message.created_at,
      last_message_preview: preview,
      [unreadColumn]: nextUnread,
    })
    .eq("id", params.conversationId);

  return message;
}
