import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getDailyCompletionEligibleAt,
  getPropertyLabel,
  maybeCompleteDailyBooking,
  releaseSoftHoldForDailyRequest,
  sendDailyBookingReminder,
  type DailyBookingRequestRow,
} from "@/lib/daily-bookings";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

const BATCH_LIMIT = 50;

async function expireRequested(nowIso: string) {
  const { data: requests, error } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("*, properties:property_id(quartier, address)")
    .eq("status", "requested")
    .lt("expires_at", nowIso)
    .limit(BATCH_LIMIT);

  if (error) throw error;

  let expired = 0;
  for (const request of requests || []) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("daily_booking_requests")
      .update({ status: "request_expired" })
      .eq("id", request.id)
      .eq("status", "requested")
      .select("id")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) continue;
    expired += 1;

    await notifyUserWithTemplate(
      request.renter_id,
      "payments",
      "dailyBookings.requestExpiredRenter",
      { propertyLabel: getPropertyLabel(request.properties || {}) },
      {
        type: "daily_booking_request_expired",
        dailyBookingRequestId: request.id,
        propertyId: request.property_id,
      },
    ).catch((err) => console.error("Daily request expiry notify failed:", err));
  }

  return expired;
}

async function expirePaymentWindows(nowIso: string) {
  const { data: requests, error } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("*, properties:property_id(quartier, address)")
    .in("status", ["approved_awaiting_payment", "payment_pending"])
    .lt("payment_expires_at", nowIso)
    .limit(BATCH_LIMIT);

  if (error) throw error;

  let expired = 0;
  for (const request of requests || []) {
    if (request.transaction_id) {
      const { data: transaction } = await supabaseAdmin
        .from("transactions")
        .select("status")
        .eq("id", request.transaction_id)
        .maybeSingle();
      if (transaction?.status === "completed") continue;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("daily_booking_requests")
      .update({ status: "payment_expired" })
      .eq("id", request.id)
      .in("status", ["approved_awaiting_payment", "payment_pending"])
      .select("id")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) continue;
    expired += 1;
    await releaseSoftHoldForDailyRequest(request.id);

    await notifyUserWithTemplate(
      request.renter_id,
      "payments",
      "dailyBookings.paymentExpiredRenter",
      { propertyLabel: getPropertyLabel(request.properties || {}) },
      {
        type: "daily_booking_payment_expired",
        dailyBookingRequestId: request.id,
        propertyId: request.property_id,
      },
    ).catch((err) => console.error("Daily payment expiry notify failed:", err));
  }

  return expired;
}

async function sendReminders(now: Date) {
  const nowIso = now.toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneHourAhead = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const { data: checkins, error: checkinError } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("*, properties:property_id(quartier, address)")
    .in("status", ["confirmed"])
    .gte("checkin_at", oneHourAgo)
    .lte("checkin_at", oneHourAhead)
    .limit(BATCH_LIMIT);

  if (checkinError) throw checkinError;

  const { data: checkouts, error: checkoutError } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("*, properties:property_id(quartier, address)")
    .in("status", ["confirmed", "checked_in"])
    .gte("checkout_at", oneHourAgo)
    .lte("checkout_at", oneHourAhead)
    .limit(BATCH_LIMIT);

  if (checkoutError) throw checkoutError;

  let checkinReminders = 0;
  for (const row of checkins || []) {
    const request = row as DailyBookingRequestRow & {
      properties?: { quartier?: string | null; address?: string | null };
    };
    const sent = await sendDailyBookingReminder({
      request,
      eventType: "dailyBookings.checkinReminderRenter",
      userId: request.renter_id,
      copyKey: "dailyBookings.checkinReminderRenter",
      params: {
        propertyLabel: getPropertyLabel(request.properties || {}),
        time: new Date(request.checkin_at).toLocaleTimeString("fr-BF", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Ouagadougou",
        }),
      },
      data: { type: "daily_booking_checkin_reminder" },
    });
    if (sent) checkinReminders += 1;
  }

  let checkoutReminders = 0;
  for (const row of checkouts || []) {
    const request = row as DailyBookingRequestRow & {
      properties?: { quartier?: string | null; address?: string | null };
    };
    const sent = await sendDailyBookingReminder({
      request,
      eventType: "dailyBookings.checkoutReminderRenter",
      userId: request.renter_id,
      copyKey: "dailyBookings.checkoutReminderRenter",
      params: {
        propertyLabel: getPropertyLabel(request.properties || {}),
        time: new Date(request.checkout_at).toLocaleTimeString("fr-BF", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Ouagadougou",
        }),
      },
      data: { type: "daily_booking_checkout_reminder" },
    });
    if (sent) checkoutReminders += 1;
  }

  const { error: reviewError } = await supabaseAdmin
    .from("daily_booking_requests")
    .update({ status: "post_checkout_review" })
    .in("status", ["confirmed", "checked_in", "checkout_reported"])
    .lt("checkout_at", nowIso);

  if (reviewError) throw reviewError;

  return { checkinReminders, checkoutReminders };
}

async function completeEligible(nowIso: string) {
  const { data: requests, error } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("id, checkout_at")
    .in("status", [
      "confirmed",
      "checked_in",
      "checkout_reported",
      "post_checkout_review",
      "issue_open",
    ])
    .lt("checkout_at", nowIso)
    .limit(BATCH_LIMIT);

  if (error) throw error;

  let completed = 0;
  for (const request of requests || []) {
    if (getDailyCompletionEligibleAt(request.checkout_at) > new Date(nowIso)) {
      continue;
    }
    const result = await maybeCompleteDailyBooking(request.id);
    if (result.completed) completed += 1;
  }

  return completed;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const nowIso = now.toISOString();

    const [expiredRequests, expiredPayments, reminders, completed] =
      await Promise.all([
        expireRequested(nowIso),
        expirePaymentWindows(nowIso),
        sendReminders(now),
        completeEligible(nowIso),
      ]);

    return NextResponse.json({
      success: true,
      expiredRequests,
      expiredPayments,
      reminders,
      completed,
      timestamp: nowIso,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Daily booking cron failed";
    console.error("Daily booking lifecycle cron failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
