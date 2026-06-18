import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { getPropertyLabel } from "@/lib/daily-bookings";

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
    if (requestRow.renter_id !== user.id) return errorResponse("Forbidden", 403, req);
    if (requestRow.status !== "confirmed") {
      return errorResponse("This booking cannot be checked in", 409, req);
    }

    const checkedInAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("daily_booking_requests")
      .update({
        status: "checked_in",
        checkin_confirmed_at: checkedInAt,
      })
      .eq("id", id)
      .eq("status", "confirmed")
      .select("*")
      .single();

    if (updateError) throw updateError;

    const propertyLabel = getPropertyLabel(requestRow.properties || {});
    await notifyUserWithTemplate(
      requestRow.owner_id,
      "payments",
      "dailyBookings.checkinConfirmedOwner",
      { propertyLabel },
      {
        type: "daily_booking_checkin_confirmed",
        dailyBookingRequestId: id,
        propertyId: requestRow.property_id,
      },
    );

    return cors(NextResponse.json({ success: true, request: updated }), req);
  } catch (error) {
    console.error("Error confirming daily check-in:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
