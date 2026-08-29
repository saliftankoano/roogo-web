import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { z } from "zod";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { captureServerEvent } from "@/lib/posthog-server";
import {
  DAILY_REQUEST_APPROVAL_HOURS,
  addHoursIso,
  computeDailyBookingQuote,
  fetchDailyProperty,
  fetchRoomType,
  getPropertyLabel,
  hasDailyDateConflict,
  isHotelProperty,
  toDailyCheckinAt,
  toDailyCheckoutAt,
} from "@/lib/daily-bookings";
import { normalizeEventCode } from "@/lib/hotel-events";

const createDailyBookingSchema = z.object({
  propertyId: z.uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().positive().max(50).optional(),
  roomTypeId: z.uuid().optional(),
  eventCode: z.string().max(24).optional(),
});

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const parsed = createDailyBookingSchema.safeParse(await req.json());
    if (!parsed.success) {
      return errorResponse("Invalid request data", 400, req);
    }

    const { propertyId, startDate, endDate, roomTypeId } = parsed.data;
    const guestCount = parsed.data.guestCount ?? 1;
    const property = await fetchDailyProperty(propertyId);
    if (!property) return errorResponse("Property not found", 404, req);
    if (property.period !== "day") {
      return errorResponse("This property is not a daily rental", 400, req);
    }
    if (property.agent_id === user.id) {
      return errorResponse(
        "Owners cannot request their own property",
        400,
        req,
      );
    }

    const isHotel = isHotelProperty(property);
    let roomType = null;
    let eventId: string | null = null;
    let eventName: string | null = null;
    let eventCode: string | null = null;
    let eventNightlyRate: number | null = null;
    if (isHotel) {
      if (!roomTypeId) {
        return errorResponse(
          "A room type is required for hotel bookings",
          400,
          req,
        );
      }
      roomType = await fetchRoomType(roomTypeId);
      if (
        !roomType ||
        !roomType.is_active ||
        roomType.property_id !== propertyId
      ) {
        return errorResponse("Room type not found", 404, req);
      }
      if (guestCount > roomType.capacity) {
        return errorResponse("Guest count exceeds room capacity", 400, req);
      }

      // Count-based inventory: a request only needs a room free right now;
      // the hard re-check happens under lock at approval time.
      const { data: available, error: availabilityError } =
        await supabaseAdmin.rpc("room_type_available", {
          p_room_type_id: roomTypeId,
          p_start: startDate,
          p_end: endDate,
          p_exclude_request_id: null,
        });
      if (availabilityError) throw availabilityError;
      if (!available) {
        return errorResponse("These dates are not available", 409, req);
      }

      if (parsed.data.eventCode) {
        eventCode = normalizeEventCode(parsed.data.eventCode);
        if (!eventCode) return errorResponse("Invalid event code", 400, req);
        const { data: event } = await supabaseAdmin
          .from("events")
          .select("id, name, start_date, end_date, status")
          .ilike("code", eventCode)
          .eq("status", "open")
          .maybeSingle();
        if (
          !event ||
          startDate < event.start_date ||
          endDate > event.end_date
        ) {
          return errorResponse("Booking dates are outside the event", 400, req);
        }
        const { data: block } = await supabaseAdmin
          .from("event_room_blocks")
          .select("count_pledged, event_nightly_rate")
          .eq("event_id", event.id)
          .eq("room_type_id", roomTypeId)
          .eq("hotel_id", property.hotel_id)
          .eq("status", "pledged")
          .maybeSingle();
        if (!block)
          return errorResponse("Room is not pledged to this event", 400, req);
        const { count: eventBookings, error: countError } = await supabaseAdmin
          .from("daily_booking_requests")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("room_type_id", roomTypeId)
          .in("status", [
            "requested",
            "approved_awaiting_payment",
            "payment_pending",
            "confirmed",
            "checked_in",
            "checkin_issue",
            "checkout_reported",
            "post_checkout_review",
            "issue_open",
          ])
          .lt("start_date", endDate)
          .gt("end_date", startDate);
        if (countError) throw countError;
        if ((eventBookings || 0) >= block.count_pledged) {
          return errorResponse("The event room block is full", 409, req);
        }
        eventId = event.id;
        eventName = event.name;
        eventNightlyRate = block.event_nightly_rate;
      }
    } else {
      if (property.capacite_max && guestCount > Number(property.capacite_max)) {
        return errorResponse("Guest count exceeds property capacity", 400, req);
      }

      const conflict = await hasDailyDateConflict({
        propertyId,
        startDate,
        endDate,
      });
      if (conflict) {
        return errorResponse("These dates are not available", 409, req);
      }
    }

    const quote = await computeDailyBookingQuote({
      property,
      startDate,
      endDate,
      roomType:
        roomType && eventNightlyRate != null
          ? { ...roomType, nightly_rate: eventNightlyRate }
          : roomType,
    });
    const now = new Date();
    const expiresAt = addHoursIso(now, DAILY_REQUEST_APPROVAL_HOURS);
    const checkinAt = toDailyCheckinAt(startDate);
    const checkoutAt = toDailyCheckoutAt(endDate);

    const { data: requestRow, error } = await supabaseAdmin
      .from("daily_booking_requests")
      .insert({
        property_id: propertyId,
        owner_id: property.agent_id,
        renter_id: user.id,
        status: "requested",
        start_date: startDate,
        end_date: endDate,
        checkin_at: checkinAt,
        checkout_at: checkoutAt,
        guest_count: guestCount,
        nightly_rate: quote.nightlyRate,
        nights: quote.nights,
        stay_amount: quote.stayAmount,
        original_caution_amount: quote.originalCautionAmount,
        caution_amount: quote.cautionAmount,
        caution_cap_amount: quote.cautionCapAmount,
        renter_service_fee_bps: quote.renterServiceFeeBps,
        renter_service_fee_amount: quote.renterServiceFeeAmount,
        owner_commission_bps: quote.ownerCommissionBps,
        owner_commission_amount: quote.ownerCommissionAmount,
        owner_net_amount: quote.ownerNetAmount,
        total_amount: quote.totalAmount,
        currency: "XOF",
        expires_at: expiresAt,
        room_type_id: roomType?.id ?? null,
        event_id: eventId,
        metadata: {
          cautionType: quote.cautionType,
          cautionValeur: quote.cautionValeur,
          minimumNights: property.sejour_minimum ?? 1,
          ...(roomType ? { roomTypeName: roomType.name } : {}),
          ...(eventId
            ? {
                eventName,
                eventCode,
                standardNightlyRate: roomType?.nightly_rate,
                negotiatedNightlyRate: eventNightlyRate,
              }
            : {}),
        },
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating daily booking request:", error);
      if (String(error.message).includes("EVENT_ROOM_BLOCK_FULL")) {
        return errorResponse("The event room block is full", 409, req);
      }
      if (String(error.message).includes("EVENT_ROOM_BLOCK_UNAVAILABLE")) {
        return errorResponse("Room is not pledged to this event", 409, req);
      }
      return errorResponse("Failed to create booking request", 500, req);
    }

    const propertyLabel = getPropertyLabel(property);
    const renterName = user.full_name || "Un locataire";
    const deadline = new Date(expiresAt).toLocaleString("fr-BF", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Africa/Ouagadougou",
    });

    await Promise.allSettled([
      notifyUserWithTemplate(
        property.agent_id,
        "viewingRequests",
        "dailyBookings.requestSubmittedOwner",
        { renterName, propertyLabel, startDate, endDate },
        {
          type: "daily_booking_request",
          dailyBookingRequestId: requestRow.id,
          propertyId,
        },
      ),
      notifyUserWithTemplate(
        user.id,
        "payments",
        "dailyBookings.requestSubmittedRenter",
        { propertyLabel, deadline },
        {
          type: "daily_booking_request_submitted",
          dailyBookingRequestId: requestRow.id,
          propertyId,
        },
      ),
      captureServerEvent(user.id, "daily_booking_requested", {
        daily_booking_request_id: requestRow.id,
        property_id: propertyId,
        owner_id: property.agent_id,
        nights: quote.nights,
        total_amount: quote.totalAmount,
      }),
    ]);

    return cors(
      NextResponse.json(
        { success: true, request: requestRow },
        { status: 201 },
      ),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/daily-booking-requests:", error);
    return errorResponse(
      safeError(error, "Failed to create request"),
      500,
      req,
    );
  }
}
