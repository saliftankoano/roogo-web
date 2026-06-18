import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import {
  getPropertyLabel,
  releaseSoftHoldForDailyRequest,
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

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;

    const { data: requestRow, error: fetchError } = await supabaseAdmin
      .from("daily_booking_requests")
      .select("*, properties:property_id(quartier, address)")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!requestRow) return errorResponse("Request not found", 404, req);
    if (requestRow.owner_id !== user.id) return errorResponse("Forbidden", 403, req);
    if (!["requested", "approved_awaiting_payment"].includes(requestRow.status)) {
      return errorResponse("This request cannot be declined", 409, req);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("daily_booking_requests")
      .update({
        status: "request_declined",
        declined_at: new Date().toISOString(),
        metadata: {
          ...((requestRow.metadata as Record<string, unknown>) || {}),
          declineReason: reason,
        },
      })
      .eq("id", id)
      .in("status", ["requested", "approved_awaiting_payment"])
      .select("*")
      .single();

    if (updateError) throw updateError;
    await releaseSoftHoldForDailyRequest(id);

    const propertyLabel = getPropertyLabel(requestRow.properties || {});
    await notifyUserWithTemplate(
      requestRow.renter_id,
      "payments",
      "dailyBookings.requestDeclinedRenter",
      { propertyLabel },
      {
        type: "daily_booking_request_declined",
        dailyBookingRequestId: id,
        propertyId: requestRow.property_id,
      },
    );

    return cors(NextResponse.json({ success: true, request: updated }), req);
  } catch (error) {
    console.error("Error declining daily booking request:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
