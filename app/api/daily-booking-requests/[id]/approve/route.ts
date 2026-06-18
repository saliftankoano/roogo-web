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
    if (requestRow.owner_id !== user.id) return errorResponse("Forbidden", 403, req);

    if (requestRow.status === "approved_awaiting_payment") {
      return cors(NextResponse.json({ success: true, request: requestRow }), req);
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

    const conflict = await hasDailyDateConflict({
      propertyId: requestRow.property_id,
      startDate: requestRow.start_date,
      endDate: requestRow.end_date,
      excludeRequestId: id,
    });
    if (conflict) {
      return errorResponse("These dates are no longer available", 409, req);
    }

    const approvedAt = new Date();
    const paymentExpiresAt = addHoursIso(approvedAt, DAILY_PAYMENT_WINDOW_HOURS);
    const { data: updated, error: updateError } = await supabaseAdmin
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

    await createSoftHoldForDailyRequest(updated as DailyBookingRequestRow);

    const propertyLabel = getPropertyLabel(requestRow.properties || {});
    const deadline = new Date(paymentExpiresAt).toLocaleString("fr-BF", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Africa/Ouagadougou",
    });

    await Promise.allSettled([
      notifyUserWithTemplate(
        requestRow.renter_id,
        "payments",
        "dailyBookings.requestApprovedRenter",
        { propertyLabel, deadline },
        {
          type: "daily_booking_request_approved",
          dailyBookingRequestId: id,
          propertyId: requestRow.property_id,
        },
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
