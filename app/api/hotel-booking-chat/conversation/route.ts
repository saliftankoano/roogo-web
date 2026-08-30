import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import {
  getOrCreateHotelBookingConversation,
  loadHotelBookingMessages,
  markHotelConversationRead,
  resolveHotelBookingChatAccess,
} from "@/lib/hotel-booking-chat";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);
    const bookingId = new URL(req.url).searchParams.get("bookingId") || "";
    if (!bookingId) return errorResponse("Missing booking id", 400, req);

    const access = await resolveHotelBookingChatAccess(user.id, bookingId);
    if (!access) return errorResponse("Forbidden", 403, req);
    const conversation = await getOrCreateHotelBookingConversation({
      bookingId,
      hotelId: access.hotelId,
      guestId: access.booking.renter_id,
    });
    await markHotelConversationRead(conversation.id, access.role);
    const messages = await loadHotelBookingMessages(conversation.id);

    return cors(
      NextResponse.json({
        success: true,
        role: access.role,
        booking: {
          id: access.booking.id,
          code: access.booking.booking_code,
          status: access.booking.status,
        },
        conversation: { ...conversation, [`unread_for_${access.role}`]: 0 },
        messages,
      }),
      req,
    );
  } catch (error) {
    console.error("GET hotel booking chat:", error);
    return errorResponse("Failed to load booking chat", 500, req);
  }
}
