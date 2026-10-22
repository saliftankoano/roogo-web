import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import {
  DAILY_PAYMENT_WINDOW_HOURS,
  addHoursIso,
  createSoftHoldForDailyRequest,
  getPropertyLabel,
  hasDailyDateConflict,
  type DailyBookingRequestRow,
} from "@/lib/daily-bookings";
import { getHotelBookingActor } from "@/lib/hotel-auth";
import { buildDailyBookingApprovalNotification } from "@/lib/daily-booking-notifications";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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

    const { data: requestRow, error: fetchError } = await supabaseAdmin
      .from("daily_booking_requests")
      .select(
        `
        *,
        properties:property_id(quartier, address)
        `,
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!requestRow) return errorResponse("Request not found", 404, req);

    const isHotelBooking = !!requestRow.room_type_id;
    if (requestRow.owner_id !== user.id) {
      // Hotel bookings may also be approved by an admin of the property's hotel.
      const actor = isHotelBooking
        ? await getHotelBookingActor(user.id, requestRow.property_id, "approve")
        : null;
      if (!actor) return errorResponse("Forbidden", 403, req);
    }

    if (requestRow.status === "approved_awaiting_payment") {
      return cors(
        NextResponse.json({ success: true, request: requestRow }),
        req,
      );
    }
    if (requestRow.status !== "requested") {
      return errorResponse("This request cannot be approved", 409, req);
    }
    if (new Date(requestRow.expires_at) < new Date()) {
      await supabaseAdmin
        .from("daily_booking_requests")
        .update({ status: "request_expired" })
        .eq("id", id)
        .eq("status", "requested");
      return errorResponse("This request has expired", 409, req);
    }

    const approvedAt = new Date();
    const paymentExpiresAt = addHoursIso(
      approvedAt,
      DAILY_PAYMENT_WINDOW_HOURS,
    );
    let updated: DailyBookingRequestRow;

    if (isHotelBooking) {
      // Atomic approval under an advisory lock on the room type: prevents two
      // concurrent approvals from overselling the last room. Never approve
      // hotel bookings via check-then-update.
      const { data: approvedRows, error: approveError } =
        await supabaseAdmin.rpc("approve_hotel_booking_request", {
          p_request_id: id,
          p_approved_at: approvedAt.toISOString(),
          p_payment_expires_at: paymentExpiresAt,
        });
      if (approveError) throw approveError;

      const approved = Array.isArray(approvedRows)
        ? approvedRows[0]
        : approvedRows;
      if (!approved) {
        return errorResponse("These dates are no longer available", 409, req);
      }
      updated = approved as DailyBookingRequestRow;
    } else {
      const conflict = await hasDailyDateConflict({
        propertyId: requestRow.property_id,
        startDate: requestRow.start_date,
        endDate: requestRow.end_date,
        excludeRequestId: id,
      });
      if (conflict) {
        return errorResponse("These dates are no longer available", 409, req);
      }

      const { data: updatedRow, error: updateError } = await supabaseAdmin
        .from("daily_booking_requests")
        .update({
          status: "approved_awaiting_payment",
          approved_at: approvedAt.toISOString(),
          payment_expires_at: paymentExpiresAt,
        })
        .eq("id", id)
        .eq("status", "requested")
        .select("*")
        .single();

      if (updateError) throw updateError;
      updated = updatedRow as DailyBookingRequestRow;

      // Hotel inventory is count-based via the request row itself; the
      // whole-property soft hold is only for regular daily rentals.
      await createSoftHoldForDailyRequest(updated);
    }

    const propertyLabel = getPropertyLabel(requestRow.properties || {});
    const deadline = new Date(paymentExpiresAt).toLocaleString("fr-BF", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Africa/Ouagadougou",
    });
    const renterNotification = buildDailyBookingApprovalNotification({
      isHotelBooking,
      requestId: id,
      propertyId: requestRow.property_id,
    });

    await Promise.allSettled([
      notifyUserWithTemplate(
        requestRow.renter_id,
        "payments",
        renterNotification.copyKey,
        { propertyLabel, deadline },
        renterNotification.data,
      ),
      notifyUserWithTemplate(
        requestRow.owner_id,
        "viewingRequests",
        "dailyBookings.requestApprovedOwner",
        { propertyLabel, deadline },
        {
          type: "daily_booking_request_approved_owner",
          dailyBookingRequestId: id,
          propertyId: requestRow.property_id,
        },
      ),
    ]);

    return cors(NextResponse.json({ success: true, request: updated }), req);
  } catch (error) {
    console.error("Error approving daily booking request:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
