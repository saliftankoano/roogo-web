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
  getPropertyLabel,
  hasDailyDateConflict,
  toDailyCheckinAt,
  toDailyCheckoutAt,
} from "@/lib/daily-bookings";

const createDailyBookingSchema = z.object({
  propertyId: z.uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().positive().max(50).optional(),
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

    const { propertyId, startDate, endDate } = parsed.data;
    const guestCount = parsed.data.guestCount ?? 1;
    const property = await fetchDailyProperty(propertyId);
    if (!property) return errorResponse("Property not found", 404, req);
    if (property.period !== "day") {
      return errorResponse("This property is not a daily rental", 400, req);
    }
    if (property.agent_id === user.id) {
      return errorResponse("Owners cannot request their own property", 400, req);
    }
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

    const quote = await computeDailyBookingQuote({
      property,
      startDate,
      endDate,
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
        metadata: {
          cautionType: quote.cautionType,
          cautionValeur: quote.cautionValeur,
          minimumNights: property.sejour_minimum ?? 1,
        },
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating daily booking request:", error);
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
      NextResponse.json({ success: true, request: requestRow }, { status: 201 }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/daily-booking-requests:", error);
    return errorResponse(safeError(error, "Failed to create request"), 500, req);
  }
}
