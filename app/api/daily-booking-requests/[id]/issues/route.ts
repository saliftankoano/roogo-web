import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { z } from "zod";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import {
  getPropertyLabel,
  pauseDailyBookingPayout,
} from "@/lib/daily-bookings";

const issueSchema = z.object({
  issueType: z
    .enum([
      "checkin_access",
      "stay_problem",
      "checkout_problem",
      "guest_not_left",
      "owner_reported_issue",
      "other",
    ])
    .default("other"),
  reason: z.string().max(1000).optional(),
});

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

    const parsed = issueSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return errorResponse("Invalid issue data", 400, req);

    const { data: requestRow, error: fetchError } = await supabaseAdmin
      .from("daily_booking_requests")
      .select("*, properties:property_id(quartier, address)")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!requestRow) return errorResponse("Request not found", 404, req);

    const isRenter = requestRow.renter_id === user.id;
    const isOwner = requestRow.owner_id === user.id;
    const isStaff = ["staff", "founder", "admin"].includes(user.user_type);
    if (!isRenter && !isOwner && !isStaff) {
      return errorResponse("Forbidden", 403, req);
    }

    if (
      ![
        "confirmed",
        "checked_in",
        "checkin_issue",
        "checkout_reported",
        "post_checkout_review",
        "issue_open",
      ].includes(requestRow.status)
    ) {
      return errorResponse("This booking cannot receive issues", 409, req);
    }

    const reporterRole = isStaff ? "staff" : isOwner ? "owner" : "renter";
    const nextStatus =
      parsed.data.issueType === "checkin_access" ? "checkin_issue" : "issue_open";

    const { data: issue, error: insertError } = await supabaseAdmin
      .from("daily_booking_issues")
      .insert({
        booking_request_id: id,
        agreement_id: requestRow.agreement_id,
        property_id: requestRow.property_id,
        reporter_id: user.id,
        reporter_role: reporterRole,
        issue_type: parsed.data.issueType,
        reason: parsed.data.reason || null,
        status: "open",
      })
      .select("*")
      .single();

    if (insertError) throw insertError;

    await supabaseAdmin
      .from("daily_booking_requests")
      .update({ status: nextStatus })
      .eq("id", id);

    await pauseDailyBookingPayout(id);

    const propertyLabel = getPropertyLabel(requestRow.properties || {});
    const notifyUserId = isRenter ? requestRow.owner_id : requestRow.renter_id;
    await Promise.allSettled([
      notifyUserWithTemplate(
        notifyUserId,
        "payments",
        isRenter && parsed.data.issueType === "checkin_access"
          ? "dailyBookings.checkinIssueOwner"
          : "dailyBookings.issueOpened",
        { propertyLabel },
        {
          type: "daily_booking_issue_opened",
          dailyBookingRequestId: id,
          issueId: issue.id,
          propertyId: requestRow.property_id,
        },
      ),
      notifyUserWithTemplate(
        user.id,
        "payments",
        "dailyBookings.issueOpened",
        { propertyLabel },
        {
          type: "daily_booking_issue_opened",
          dailyBookingRequestId: id,
          issueId: issue.id,
          propertyId: requestRow.property_id,
        },
      ),
    ]);

    return cors(NextResponse.json({ success: true, issue }), req);
  } catch (error) {
    console.error("Error opening daily booking issue:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
