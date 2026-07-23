import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import {
  getDailyCompletionEligibleAt,
  getPropertyLabel,
} from "@/lib/daily-bookings";
import { getHotelBookingActor } from "@/lib/hotel-auth";

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
      .select("*, properties:property_id(quartier, address)")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!requestRow) return errorResponse("Request not found", 404, req);
    if (requestRow.renter_id !== user.id) {
      // Hotel desk staff and admins can register a guest's departure.
      const actor = requestRow.room_type_id
        ? await getHotelBookingActor(user.id, requestRow.property_id, "checkout")
        : null;
      if (!actor) return errorResponse("Forbidden", 403, req);
    }
    if (!["confirmed", "checked_in", "post_checkout_review"].includes(requestRow.status)) {
      return errorResponse("This booking cannot be checked out", 409, req);
    }

    const checkoutReportedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("daily_booking_requests")
      .update({
        status: "checkout_reported",
        checkout_reported_at: checkoutReportedAt,
      })
      .eq("id", id)
      .in("status", ["confirmed", "checked_in", "post_checkout_review"])
      .select("*")
      .single();

    if (updateError) throw updateError;

    const propertyLabel = getPropertyLabel(requestRow.properties || {});
    const deadline = getDailyCompletionEligibleAt(
      requestRow.checkout_at,
    ).toLocaleString("fr-BF", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Africa/Ouagadougou",
    });

    await notifyUserWithTemplate(
      requestRow.owner_id,
      "payments",
      "dailyBookings.checkoutReportedOwner",
      { propertyLabel, deadline },
      {
        type: "daily_booking_checkout_reported",
        dailyBookingRequestId: id,
        propertyId: requestRow.property_id,
      },
    );

    return cors(NextResponse.json({ success: true, request: updated }), req);
  } catch (error) {
    console.error("Error confirming daily checkout:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
