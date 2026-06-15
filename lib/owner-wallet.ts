import { supabaseAdmin } from "@/lib/supabase-admin";

export const OWNER_RENT_FEE_RATE_BPS = 700;
export const MONTHLY_FREE_SUCCESS_FEE_RATE_BPS = 5000;

export type OwnerPayoutStatus =
  | "requested"
  | "accepted"
  | "processing"
  | "enqueued"
  | "completed"
  | "failed"
  | "rejected"
  | "not_found";

const FAILED_PAYOUT_STATUSES = new Set<OwnerPayoutStatus>([
  "failed",
  "rejected",
  "not_found",
]);

export function calculateOwnerRentAmounts(
  grossRentAmount: number,
  feeRateBps = OWNER_RENT_FEE_RATE_BPS,
) {
  const gross = Math.max(0, Math.round(Number(grossRentAmount) || 0));
  const feeAmount = Math.round((gross * feeRateBps) / 10000);

  return {
    grossRentAmount: gross,
    feeRateBps,
    feeAmount,
    netAmount: gross - feeAmount,
  };
}

export function normalizeBurkinaPhone(phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, "");

  if (digits.length === 8) return `226${digits}`;
  if (digits.length === 11 && digits.startsWith("226")) return digits;
  if (digits.length === 9 && digits.startsWith("0")) {
    return `226${digits.slice(1)}`;
  }

  return null;
}

export function normalizePawaPayProvider(provider: string): string | null {
  if (provider === "ORANGE_MONEY" || provider === "ORANGE_BFA") {
    return "ORANGE_BFA";
  }

  if (provider === "MOOV_MONEY" || provider === "MOOV_BFA") {
    return "MOOV_BFA";
  }

  return null;
}

export function mapPawaPayPayoutStatus(status: string): OwnerPayoutStatus {
  const normalized = status.toUpperCase();
  if (normalized === "COMPLETED") return "completed";
  if (normalized === "ACCEPTED") return "accepted";
  if (normalized === "PROCESSING") return "processing";
  if (normalized === "ENQUEUED") return "enqueued";
  if (normalized === "FAILED") return "failed";
  if (normalized === "REJECTED") return "rejected";
  if (normalized === "NOT_FOUND") return "not_found";
  return "processing";
}

export async function creditOwnerEarningForSchedule(scheduleId: string) {
  const { data: schedule, error: scheduleError } = await supabaseAdmin
    .from("rent_schedules")
    .select(
      "id, owner_id, transaction_id, property_id, agreement_id, amount, status, paid_at, updated_at",
    )
    .eq("id", scheduleId)
    .maybeSingle();

  if (scheduleError) throw scheduleError;
  if (!schedule || schedule.status !== "paid") return { credited: false };

  const { data: transaction } = schedule.transaction_id
    ? await supabaseAdmin
        .from("transactions")
        .select("currency")
        .eq("id", schedule.transaction_id)
        .maybeSingle()
      : { data: null };

  const { data: pendingListingFee, error: listingFeeError } = await supabaseAdmin
    .from("property_listing_fees")
    .select("id, rate_bps, fee_amount, metadata")
    .eq("property_id", schedule.property_id)
    .eq("owner_id", schedule.owner_id)
    .eq("fee_type", "success_fee")
    .eq("status", "pending")
    .maybeSingle();

  if (listingFeeError) throw listingFeeError;

  const hasListingSuccessFee = Boolean(pendingListingFee);
  const pendingListingFeeMetadata =
    pendingListingFee?.metadata &&
    typeof pendingListingFee.metadata === "object" &&
    !Array.isArray(pendingListingFee.metadata)
      ? (pendingListingFee.metadata as Record<string, unknown>)
      : {};
  const amounts = hasListingSuccessFee
    ? {
        grossRentAmount: Math.max(0, Math.round(Number(schedule.amount) || 0)),
        feeRateBps: Number(pendingListingFee?.rate_bps) || MONTHLY_FREE_SUCCESS_FEE_RATE_BPS,
        feeAmount: Math.min(
          Math.max(0, Math.round(Number(schedule.amount) || 0)),
          Math.max(0, Math.round(Number(pendingListingFee?.fee_amount) || 0)),
        ),
        netAmount:
          Math.max(0, Math.round(Number(schedule.amount) || 0)) -
          Math.min(
            Math.max(0, Math.round(Number(schedule.amount) || 0)),
            Math.max(0, Math.round(Number(pendingListingFee?.fee_amount) || 0)),
          ),
      }
    : calculateOwnerRentAmounts(schedule.amount);
  const metadata = hasListingSuccessFee
    ? {
        feeKind: "listing_success_fee",
        listingFeeId: pendingListingFee?.id,
        normalRentFeeRateBps: OWNER_RENT_FEE_RATE_BPS,
      }
    : {};

  const { data: earning, error: insertError } = await supabaseAdmin
    .from("owner_earnings")
    .insert({
      owner_id: schedule.owner_id,
      schedule_id: schedule.id,
      transaction_id: schedule.transaction_id,
      property_id: schedule.property_id,
      agreement_id: schedule.agreement_id,
      gross_rent_amount: amounts.grossRentAmount,
      fee_rate_bps: amounts.feeRateBps,
      fee_amount: amounts.feeAmount,
      net_amount: amounts.netAmount,
      metadata,
      currency:
        transaction &&
        "currency" in transaction &&
        typeof transaction.currency === "string"
          ? transaction.currency
          : "XOF",
      earned_at:
        schedule.paid_at || schedule.updated_at || new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") return { credited: false };
    throw insertError;
  }

  if (hasListingSuccessFee && pendingListingFee?.id && earning?.id) {
    const { error: collectError } = await supabaseAdmin
      .from("property_listing_fees")
      .update({
        status: "collected",
        owner_earning_id: earning.id,
        collected_at: new Date().toISOString(),
        metadata: {
          ...pendingListingFeeMetadata,
          feeKind: "listing_success_fee",
          collectedFromScheduleId: schedule.id,
        },
      })
      .eq("id", pendingListingFee.id)
      .eq("status", "pending");

    if (collectError) throw collectError;
  }

  return { credited: true, earningId: earning?.id as string | undefined };
}

export async function creditOwnerEarningsForSchedules(scheduleIds: string[]) {
  const uniqueScheduleIds = [...new Set(scheduleIds.filter(Boolean))];
  const results = [];

  for (const scheduleId of uniqueScheduleIds) {
    results.push(await creditOwnerEarningForSchedule(scheduleId));
  }

  return results;
}

export async function updateOwnerPayoutFromPawaPayStatus(
  payoutId: string,
  pawaPayStatus: string,
  payload: unknown,
  failureReason?: unknown,
) {
  const status = mapPawaPayPayoutStatus(pawaPayStatus);
  const detailedFailure =
    failureReason && typeof failureReason === "object"
      ? JSON.stringify(failureReason)
      : failureReason
        ? String(failureReason)
        : null;

  const updatePayload: Record<string, unknown> = {
    status,
    failure_reason: FAILED_PAYOUT_STATUSES.has(status)
      ? detailedFailure || "Payout failed"
      : null,
    metadata: payload && typeof payload === "object" ? payload : { payload },
    updated_at: new Date().toISOString(),
  };

  if (status === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { data: payout, error } = await supabaseAdmin
    .from("owner_payouts")
    .update(updatePayload)
    .eq("payout_id", payoutId)
    .select("id")
    .maybeSingle();

  if (error) throw error;

  if (payout?.id && FAILED_PAYOUT_STATUSES.has(status)) {
    await supabaseAdmin
      .from("owner_payout_items")
      .update({ released_at: new Date().toISOString() })
      .eq("payout_id", payout.id)
      .is("released_at", null);
  }

  return { updated: Boolean(payout), status };
}
