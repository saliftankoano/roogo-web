import { addHours } from "date-fns";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  computeJournalierPricing,
  nightsBetween,
  type CautionType,
} from "@/lib/journalier-pricing";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { reserveNotificationDelivery } from "@/lib/notification-deliveries";
import { unescapeText } from "@/lib/text-sanitize";

export const DAILY_REQUEST_APPROVAL_HOURS = 12;
export const DAILY_PAYMENT_WINDOW_HOURS = 2;
export const DAILY_PAYOUT_ISSUE_WINDOW_HOURS = 12;
export const DAILY_DEPOSIT_REVIEW_HOURS = 72;
export const DAILY_PAYOUT_HOLD_UNTIL = "9999-12-31T00:00:00.000Z";

export const DAILY_CHECKIN_HOUR_UTC = 14;
export const DAILY_CHECKOUT_HOUR_UTC = 12;

type SupabaseLike = typeof supabaseAdmin;

export type DailyBookingRequestStatus =
  | "requested"
  | "request_declined"
  | "request_expired"
  | "approved_awaiting_payment"
  | "payment_pending"
  | "payment_expired"
  | "confirmed"
  | "checked_in"
  | "checkin_issue"
  | "checkout_reported"
  | "post_checkout_review"
  | "issue_open"
  | "completed"
  | "cancelled"
  | "refunded";

const FINALIZED_DAILY_REQUEST_STATUSES = new Set<DailyBookingRequestStatus>([
  "confirmed",
  "checked_in",
  "checkin_issue",
  "checkout_reported",
  "post_checkout_review",
  "issue_open",
  "completed",
]);

export interface DailyBookingRequestRow {
  id: string;
  property_id: string;
  owner_id: string;
  renter_id: string;
  transaction_id: string | null;
  agreement_id: string | null;
  status: DailyBookingRequestStatus;
  start_date: string;
  end_date: string;
  checkin_at: string;
  checkout_at: string;
  guest_count: number;
  nightly_rate: number;
  nights: number;
  stay_amount: number;
  original_caution_amount: number;
  caution_amount: number;
  caution_cap_amount: number;
  renter_service_fee_bps: number;
  renter_service_fee_amount: number;
  owner_commission_bps: number;
  owner_commission_amount: number;
  owner_net_amount: number;
  total_amount: number;
  currency: string;
  expires_at: string;
  approved_at: string | null;
  payment_expires_at: string | null;
  paid_at: string | null;
  checkin_confirmed_at: string | null;
  checkout_reported_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface PropertyForDailyBooking {
  id: string;
  agent_id: string;
  address: string | null;
  quartier: string | null;
  price: number;
  period: string | null;
  caution_type: CautionType;
  caution_valeur: number | null;
  sejour_minimum: number | null;
  capacite_max: number | null;
  caution_mois?: number | null;
  loyer_avance_mois?: number | null;
  interdictions?: string[] | null;
  dos_and_donts?: string[] | null;
}

export function addHoursIso(date: Date, hours: number) {
  return addHours(date, hours).toISOString();
}

export function toDailyCheckinAt(startDate: string) {
  return new Date(
    `${startDate}T${String(DAILY_CHECKIN_HOUR_UTC).padStart(2, "0")}:00:00.000Z`,
  ).toISOString();
}

export function toDailyCheckoutAt(endDate: string) {
  return new Date(
    `${endDate}T${String(DAILY_CHECKOUT_HOUR_UTC).padStart(2, "0")}:00:00.000Z`,
  ).toISOString();
}

export function getDailyCompletionEligibleAt(checkoutAt: string) {
  return addHours(new Date(checkoutAt), DAILY_PAYOUT_ISSUE_WINDOW_HOURS);
}

export function getPropertyLabel(property: {
  quartier?: string | null;
  address?: string | null;
}) {
  return unescapeText(property.quartier || property.address || "") || "votre bien";
}

export async function fetchDailyProperty(propertyId: string) {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select(
      "id, agent_id, address, quartier, price, period, caution_type, caution_valeur, sejour_minimum, capacite_max, caution_mois, loyer_avance_mois, interdictions, dos_and_donts",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (error) throw error;
  return data as PropertyForDailyBooking | null;
}

export async function hasDailyDateConflict({
  propertyId,
  startDate,
  endDate,
  excludeRequestId,
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
  excludeRequestId?: string;
}) {
  const nowIso = new Date().toISOString();

  let query = supabaseAdmin
    .from("property_blocked_dates")
    .select("id, block_type, booking_request_id, expires_at")
    .eq("property_id", propertyId)
    .in("block_type", ["owner_block", "booked", "booking_hold"])
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (excludeRequestId) {
    query = query.or(
      `booking_request_id.is.null,booking_request_id.neq.${excludeRequestId}`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).some((block) => {
    if (block.block_type !== "booking_hold") return true;
    return !block.expires_at || block.expires_at > nowIso;
  });
}

export async function computeDailyBookingQuote({
  property,
  startDate,
  endDate,
}: {
  property: PropertyForDailyBooking;
  startDate: string;
  endDate: string;
}) {
  const nights = nightsBetween(startDate, endDate);
  if (nights <= 0) {
    throw new Error("Booking must span at least one night");
  }

  const minimumNights = Math.max(1, Number(property.sejour_minimum || 1));
  if (nights < minimumNights) {
    throw new Error(`Minimum stay is ${minimumNights} night(s)`);
  }

  const { data: listingConfig, error: listingConfigError } = await supabaseAdmin
    .from("listing_config")
    .select("daily_owner_commission_percentage")
    .eq("id", "default")
    .single();

  if (listingConfigError) throw listingConfigError;

  const commissionPercentage = Number(
    listingConfig?.daily_owner_commission_percentage,
  );
  if (!Number.isFinite(commissionPercentage)) {
    throw new Error("Daily owner commission is not configured");
  }

  return computeJournalierPricing({
    nightlyRate: property.price,
    nights,
    cautionType: property.caution_type,
    cautionValeur: property.caution_valeur,
    ownerCommissionPercentage: commissionPercentage,
  });
}

export function serializeDailyBookingRequest(row: Record<string, unknown>) {
  const property = row.properties ?? row.property ?? null;
  const renter = row.renter ?? null;
  const owner = row.owner ?? null;
  return {
    ...row,
    property,
    owner,
    renter,
    properties: undefined,
  };
}

export async function createSoftHoldForDailyRequest(
  request: DailyBookingRequestRow,
) {
  const { error: deleteError } = await supabaseAdmin
    .from("property_blocked_dates")
    .delete()
    .eq("booking_request_id", request.id)
    .eq("block_type", "booking_hold");

  if (deleteError) throw deleteError;

  const { error } = await supabaseAdmin.from("property_blocked_dates").insert({
    property_id: request.property_id,
    start_date: request.start_date,
    end_date: request.end_date,
    block_type: "booking_hold",
    booking_request_id: request.id,
    expires_at: request.payment_expires_at,
    created_by: request.owner_id,
    note: "Daily booking payment hold",
  });

  if (error) throw error;
}

export async function releaseSoftHoldForDailyRequest(requestId: string) {
  const { error } = await supabaseAdmin
    .from("property_blocked_dates")
    .delete()
    .eq("booking_request_id", requestId)
    .eq("block_type", "booking_hold");

  if (error) throw error;
}

export async function convertSoftHoldToBooked(
  request: DailyBookingRequestRow,
  agreementId?: string,
) {
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("property_blocked_dates")
    .update({
      block_type: "booked",
      expires_at: null,
      agreement_id: agreementId ?? request.agreement_id,
      note: "Daily booking confirmed",
    })
    .eq("booking_request_id", request.id)
    .eq("block_type", "booking_hold")
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (updated) return;

  const { data: existingBooked, error: existingError } = await supabaseAdmin
    .from("property_blocked_dates")
    .select("id")
    .eq("booking_request_id", request.id)
    .eq("block_type", "booked")
    .limit(1);

  if (existingError) throw existingError;
  if (existingBooked && existingBooked.length > 0) return;

  const { error: insertError } = await supabaseAdmin
    .from("property_blocked_dates")
    .insert({
      property_id: request.property_id,
      start_date: request.start_date,
      end_date: request.end_date,
      block_type: "booked",
      booking_request_id: request.id,
      agreement_id: agreementId ?? request.agreement_id,
      created_by: request.renter_id,
      note: "Daily booking confirmed",
    });

  if (insertError) throw insertError;
}

async function createDailyAgreementForRequest(
  request: DailyBookingRequestRow,
  transactionId: string,
) {
  if (request.agreement_id) return request.agreement_id;

  const { data: existingAgreement, error: existingAgreementError } =
    await supabaseAdmin
      .from("rental_agreements")
      .select("id")
      .eq("transaction_id", transactionId)
      .eq("property_frequence", "journalier")
      .maybeSingle();

  if (existingAgreementError) throw existingAgreementError;
  if (existingAgreement?.id) return existingAgreement.id as string;

  const property = await fetchDailyProperty(request.property_id);
  if (!property) throw new Error("Property not found");

  const nowIso = new Date().toISOString();
  const { data: agreement, error: agreementError } = await supabaseAdmin
    .from("rental_agreements")
    .insert({
      property_id: request.property_id,
      owner_id: request.owner_id,
      renter_id: request.renter_id,
      transaction_id: transactionId,
      status: "active",
      monthly_rent: request.nightly_rate,
      caution_mois: 0,
      loyer_avance_mois: 1,
      dos_and_donts: property.dos_and_donts || [],
      interdictions: property.interdictions || [],
      terms_text: null,
      start_date: request.start_date,
      end_date: request.end_date,
      property_frequence: "journalier",
      renter_signed_at: nowIso,
      owner_signed_at: nowIso,
    })
    .select("id")
    .single();

  if (agreementError) throw agreementError;

  return agreement.id as string;
}

async function ensureDailyDepositHold({
  request,
  transactionId,
  agreementId,
  transactionMetadata,
}: {
  request: DailyBookingRequestRow;
  transactionId: string;
  agreementId: string;
  transactionMetadata: Record<string, unknown>;
}) {
  if (request.caution_amount <= 0) return;

  const payoutPhone =
    typeof transactionMetadata.payoutPhone === "string"
      ? transactionMetadata.payoutPhone
      : null;
  const payoutProvider =
    typeof transactionMetadata.payoutProvider === "string"
      ? transactionMetadata.payoutProvider
      : null;

  if (!payoutPhone || !payoutProvider) return;

  const reviewDeadlineAt = addHours(
    new Date(request.checkout_at),
    DAILY_DEPOSIT_REVIEW_HOURS,
  ).toISOString();

  const { error } = await supabaseAdmin.from("deposit_holds").insert({
    agreement_id: agreementId,
    property_id: request.property_id,
    owner_id: request.owner_id,
    renter_id: request.renter_id,
    amount: request.caution_amount,
    currency: request.currency || "XOF",
    source_transaction_id: transactionId,
    renter_payout_phone: payoutPhone,
    renter_payout_provider: payoutProvider,
    status: "held",
    stay_end_at: request.checkout_at,
    review_deadline_at: reviewDeadlineAt,
    metadata: { dailyBookingRequestId: request.id },
  });

  if (error && error.code !== "23505") throw error;
}

async function ensureDailyOwnerEarning({
  request,
  transactionId,
  agreementId,
}: {
  request: DailyBookingRequestRow;
  transactionId: string;
  agreementId: string;
}) {
  if (request.stay_amount <= 0) return;

  const availableAt = getDailyCompletionEligibleAt(
    request.checkout_at,
  ).toISOString();

  const { error } = await supabaseAdmin.from("owner_earnings").insert({
    owner_id: request.owner_id,
    schedule_id: null,
    transaction_id: transactionId,
    property_id: request.property_id,
    agreement_id: agreementId,
    source_type: "daily_stay",
    gross_rent_amount: request.stay_amount,
    fee_rate_bps: request.owner_commission_bps,
    fee_amount: request.owner_commission_amount,
    net_amount: request.owner_net_amount,
    currency: request.currency || "XOF",
    earned_at: new Date().toISOString(),
    available_at: availableAt,
    metadata: { dailyBookingRequestId: request.id },
  });

  if (error && error.code !== "23505") throw error;
}

export async function finalizeDailyBookingAfterPayment(
  transactionId: string,
  client: SupabaseLike = supabaseAdmin,
) {
  const { data: transaction, error: transactionError } = await client
    .from("transactions")
    .select("id, deposit_id, status, type, property_id, user_id, amount, currency, metadata")
    .eq("id", transactionId)
    .maybeSingle();

  if (transactionError) throw transactionError;
  if (!transaction || transaction.type !== "property_lock") {
    return { finalized: false, reason: "not_property_lock" };
  }

  const metadata =
    transaction.metadata &&
    typeof transaction.metadata === "object" &&
    !Array.isArray(transaction.metadata)
      ? (transaction.metadata as Record<string, unknown>)
      : {};
  const requestId =
    typeof metadata.dailyBookingRequestId === "string"
      ? metadata.dailyBookingRequestId
      : null;

  if (!requestId) return { finalized: false, reason: "no_daily_request" };

  const { data: requestRow, error: requestError } = await client
    .from("daily_booking_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) throw requestError;
  if (!requestRow) return { finalized: false, reason: "request_missing" };

  const request = requestRow as DailyBookingRequestRow;
  if (
    request.agreement_id &&
    FINALIZED_DAILY_REQUEST_STATUSES.has(request.status)
  ) {
    return {
      finalized: true,
      requestId,
      agreementId: request.agreement_id,
      idempotent: true,
    };
  }

  if (
    request.property_id !== transaction.property_id ||
    request.renter_id !== transaction.user_id
  ) {
    throw new Error("Daily booking request does not match transaction");
  }

  const agreementId = await createDailyAgreementForRequest(
    request,
    transaction.id,
  );

  await convertSoftHoldToBooked(request, agreementId);
  await ensureDailyDepositHold({
    request,
    transactionId: transaction.id,
    agreementId,
    transactionMetadata: metadata,
  });
  await ensureDailyOwnerEarning({
    request,
    transactionId: transaction.id,
    agreementId,
  });

  const paidAt = new Date().toISOString();
  const { error: updateError } = await client
    .from("daily_booking_requests")
    .update({
      status: "confirmed",
      transaction_id: transaction.id,
      agreement_id: agreementId,
      paid_at: paidAt,
    })
    .eq("id", request.id);

  if (updateError) throw updateError;

  try {
    const { data: property } = await client
      .from("properties")
      .select("quartier, address")
      .eq("id", request.property_id)
      .maybeSingle();
    const propertyLabel = getPropertyLabel(property || {});

    await Promise.all([
      notifyUserWithTemplate(
        request.renter_id,
        "payments",
        "dailyBookings.paymentConfirmedRenter",
        { propertyLabel },
        {
          type: "daily_booking_payment_confirmed",
          dailyBookingRequestId: request.id,
          agreementId,
          propertyId: request.property_id,
        },
      ),
      notifyUserWithTemplate(
        request.owner_id,
        "payments",
        "dailyBookings.paymentConfirmedOwner",
        { propertyLabel },
        {
          type: "daily_booking_payment_confirmed_owner",
          dailyBookingRequestId: request.id,
          agreementId,
          propertyId: request.property_id,
        },
      ),
    ]);
  } catch (error) {
    console.error("Daily booking payment notification failed:", error);
  }

  return { finalized: true, requestId, agreementId };
}

export async function finalizeDailyBookingAfterPaymentDepositId(
  depositId: string,
) {
  const { data: transaction, error } = await supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("deposit_id", depositId)
    .maybeSingle();

  if (error) throw error;
  if (!transaction?.id) return { finalized: false, reason: "transaction_missing" };
  return finalizeDailyBookingAfterPayment(transaction.id);
}

export async function pauseDailyBookingPayout(requestId: string) {
  const { data: request } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("agreement_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!request?.agreement_id) return;

  const { error } = await supabaseAdmin
    .from("owner_earnings")
    .update({ available_at: DAILY_PAYOUT_HOLD_UNTIL })
    .eq("agreement_id", request.agreement_id)
    .eq("source_type", "daily_stay");

  if (error) throw error;
}

export async function maybeCompleteDailyBooking(requestId: string) {
  const { data: requestRow, error: requestError } = await supabaseAdmin
    .from("daily_booking_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) throw requestError;
  if (!requestRow) return { completed: false, reason: "missing" };

  const request = requestRow as DailyBookingRequestRow;
  const eligibleAt = getDailyCompletionEligibleAt(request.checkout_at);
  if (eligibleAt > new Date()) return { completed: false, reason: "too_early" };

  const { data: openIssues, error: issueError } = await supabaseAdmin
    .from("daily_booking_issues")
    .select("id")
    .eq("booking_request_id", requestId)
    .eq("status", "open")
    .limit(1);

  if (issueError) throw issueError;
  if (openIssues && openIssues.length > 0) {
    await pauseDailyBookingPayout(requestId);
    return { completed: false, reason: "open_issue" };
  }

  const completedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("daily_booking_requests")
    .update({
      status: "completed",
      completed_at: completedAt,
    })
    .eq("id", requestId)
    .in("status", [
      "confirmed",
      "checked_in",
      "checkout_reported",
      "post_checkout_review",
      "issue_open",
    ]);

  if (updateError) throw updateError;

  if (request.agreement_id) {
    const availableAt = eligibleAt.toISOString();
    const { error: earningError } = await supabaseAdmin
      .from("owner_earnings")
      .update({ available_at: availableAt })
      .eq("agreement_id", request.agreement_id)
      .eq("source_type", "daily_stay")
      .gt("available_at", availableAt);

    if (earningError) throw earningError;
  }

  try {
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("quartier, address")
      .eq("id", request.property_id)
      .maybeSingle();
    const propertyLabel = getPropertyLabel(property || {});

    await Promise.all([
      notifyUserWithTemplate(
        request.owner_id,
        "payments",
        "dailyBookings.payoutAvailable",
        { propertyLabel },
        {
          type: "daily_booking_payout_available",
          dailyBookingRequestId: request.id,
          agreementId: request.agreement_id,
          propertyId: request.property_id,
        },
      ),
      notifyUserWithTemplate(
        request.renter_id,
        "payments",
        "dailyBookings.completedRenter",
        { propertyLabel },
        {
          type: "daily_booking_completed",
          dailyBookingRequestId: request.id,
          agreementId: request.agreement_id,
          propertyId: request.property_id,
        },
      ),
    ]);
  } catch (error) {
    console.error("Daily booking completion notification failed:", error);
  }

  return { completed: true };
}

export async function sendDailyBookingReminder({
  request,
  eventType,
  userId,
  copyKey,
  notificationType = "payments",
  params,
  data,
}: {
  request: DailyBookingRequestRow;
  eventType: string;
  userId: string;
  copyKey: Parameters<typeof notifyUserWithTemplate>[2];
  notificationType?: Parameters<typeof notifyUserWithTemplate>[1];
  params?: Record<string, string | number | null | undefined>;
  data?: Record<string, unknown>;
}) {
  const reserved = await reserveNotificationDelivery({
    userId,
    notificationType,
    eventType,
    subjectId: request.id,
    metadata: data,
  });

  if (!reserved) return false;

  return notifyUserWithTemplate(userId, notificationType, copyKey, params, {
    ...data,
    dailyBookingRequestId: request.id,
    propertyId: request.property_id,
  });
}
