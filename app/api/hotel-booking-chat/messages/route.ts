import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import {
  getOrCreateHotelBookingConversation,
  postHotelBookingMessage,
  resolveHotelBookingChatAccess,
} from "@/lib/hotel-booking-chat";
import { normalizeHotelChatBody } from "@/lib/hotel-chat-validation";
import { notifyUser } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);
    const payload = await req.json().catch(() => ({}));
    const bookingId = typeof payload.bookingId === "string" ? payload.bookingId : "";
    const body = normalizeHotelChatBody(payload.body);
    if (!bookingId || !body) return errorResponse("Invalid message", 400, req);

    const access = await resolveHotelBookingChatAccess(user.id, bookingId);
    if (!access) return errorResponse("Forbidden", 403, req);
    const conversation = await getOrCreateHotelBookingConversation({
      bookingId,
      hotelId: access.hotelId,
      guestId: access.booking.renter_id,
    });
    const message = await postHotelBookingMessage({
      conversationId: conversation.id,
      senderId: user.id,
      senderRole: access.role,
      body,
    });
    const recipients =
      access.role === "hotel"
        ? [access.booking.renter_id]
        : (
            (
              await supabaseAdmin
                .from("hotel_members")
                .select("user_id")
                .eq("hotel_id", access.hotelId)
                .eq("status", "active")
            ).data || []
          ).map((member) => member.user_id);
    void Promise.allSettled(
      recipients
        .filter((recipientId) => recipientId !== user.id)
        .map((recipientId) =>
          notifyUser(
            recipientId,
            "messages",
            access.role === "hotel" ? "Message de votre hôtel" : "Message d'un client",
            body.slice(0, 140),
            { type: "hotel_booking_message", bookingId },
          ),
        ),
    );
    return cors(NextResponse.json({ success: true, message }), req);
  } catch (error) {
    console.error("POST hotel booking chat:", error);
    return errorResponse("Failed to send booking message", 500, req);
  }
}
