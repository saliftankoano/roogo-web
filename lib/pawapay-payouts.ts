import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapPawaPayPayoutStatus } from "@/lib/owner-wallet";

const FAILED_REFUND_STATUSES = new Set(["failed", "rejected", "not_found"]);

export interface InitiatePawaPayPayoutParams {
  payoutId: string;
  amount: number;
  currency?: string;
  phoneNumber: string;
  provider: string;
  customerMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface InitiatePawaPayPayoutResult {
  pawaPayStatus: string;
  payload: unknown;
  failureReason?: unknown;
  clientError?: { message: string; httpStatus: number };
}

function formatPawaPayMetadata(
  metadata: Record<string, unknown>,
): Array<Record<string, string | number | boolean>> {
  const formatted: Array<Record<string, string | number | boolean>> = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    const normalizedValue =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? value
        : JSON.stringify(value);
    formatted.push({ [key]: normalizedValue });
  }

  return formatted;
}

export async function initiatePawaPayPayout(
  params: InitiatePawaPayPayoutParams,
): Promise<InitiatePawaPayPayoutResult> {
  const config = resolvePawaPayConfig();
  const {
    payoutId,
    amount,
    currency = "XOF",
    phoneNumber,
    provider,
    customerMessage = "Roogo payout",
    metadata = {},
  } = params;
  const formattedMetadata = formatPawaPayMetadata(metadata);

  const body = {
    payoutId,
    amount: amount.toString(),
    currency,
    recipient: {
      type: "MMO",
      accountDetails: {
        phoneNumber,
        provider,
      },
    },
    customerMessage,
    metadata: formattedMetadata,
  };

  const response = await fetch(`${config.url}/v2/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { message: responseText };
  }

  if (!response.ok) {
    const statusCheck = await fetchPawaPayPayoutStatus(config, payoutId);
    if (statusCheck?.status === "FOUND") {
      const data = statusCheck.data as Record<string, unknown> | undefined;
      const foundStatus =
        typeof data?.status === "string" ? data.status : "PROCESSING";
      return {
        pawaPayStatus: foundStatus,
        payload: data || statusCheck,
        failureReason: data?.failureReason,
      };
    }

    return {
      pawaPayStatus: "FAILED",
      payload: result,
      failureReason: result.failureReason || result.message,
      clientError: {
        message:
          typeof result.message === "string"
            ? result.message
            : "Failed to initiate payout",
        httpStatus: response.status,
      },
    };
  }

  const initiationStatus =
    typeof result.status === "string" ? result.status : "ACCEPTED";

  return {
    pawaPayStatus: initiationStatus,
    payload: result,
    failureReason: result.failureReason,
  };
}

export async function updateDepositRefundFromPawaPayStatus(
  refundId: string,
  pawaPayStatus: string,
  payload: unknown,
  failureReason?: unknown,
): Promise<{ updated: boolean; status: string; holdId?: string }> {
  const status = mapPawaPayPayoutStatus(pawaPayStatus);
  const detailedFailure =
    failureReason && typeof failureReason === "object"
      ? JSON.stringify(failureReason)
      : failureReason
        ? String(failureReason)
        : null;

  const updatePayload: Record<string, unknown> = {
    status,
    failure_reason: FAILED_REFUND_STATUSES.has(status)
      ? detailedFailure || "Refund failed"
      : null,
    metadata: payload && typeof payload === "object" ? payload : { payload },
    updated_at: new Date().toISOString(),
  };

  if (status === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { data: refund, error } = await supabaseAdmin
    .from("deposit_refunds")
    .update(updatePayload)
    .eq("refund_id", refundId)
    .select("id, hold_id")
    .maybeSingle();

  if (error) throw error;

  return {
    updated: Boolean(refund),
    status,
    holdId: (refund as { hold_id?: string } | null)?.hold_id,
  };
}

async function fetchPawaPayPayoutStatus(
  config: ReturnType<typeof resolvePawaPayConfig>,
  payoutId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${config.url}/v2/payouts/${payoutId}`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
