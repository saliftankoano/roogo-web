import { supabaseAdmin } from "@/lib/supabase-admin";

export const OWNER_RENT_FEE_RATE_BPS = 700;

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

export function calculateOwnerRentAmounts(grossRentAmount: number) {
  const gross = Math.max(0, Math.round(Number(grossRentAmount) || 0));
  const feeAmount = Math.round((gross * OWNER_RENT_FEE_RATE_BPS) / 10000);

  return {
    grossRentAmount: gross,
    feeRateBps: OWNER_RENT_FEE_RATE_BPS,
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

  const amounts = calculateOwnerRentAmounts(schedule.amount);

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
