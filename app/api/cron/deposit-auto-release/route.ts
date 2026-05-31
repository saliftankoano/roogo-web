import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  initiatePawaPayPayout,
  updateDepositRefundFromPawaPayStatus,
} from "@/lib/pawapay-payouts";
import {
  mapPawaPayPayoutStatus,
  normalizePawaPayProvider,
} from "@/lib/owner-wallet";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

const BATCH_LIMIT = 25;

interface EligibleHold {
  id: string;
  renter_id: string;
  amount: number;
  currency: string | null;
  renter_payout_phone: string | null;
  renter_payout_provider: string | null;
  review_deadline_at: string | null;
}

async function releaseOne(hold: EligibleHold): Promise<{
  holdId: string;
  outcome: "refunded" | "missing_payout_info" | "failed" | "not_eligible";
  refundStatus?: string | null;
}> {
  const provider = normalizePawaPayProvider(hold.renter_payout_provider || "");
  const phoneNumber = hold.renter_payout_phone;

  // Atomic transition held -> auto_refunded so we never double-pay.
  const { data: transitioned, error: transitionError } = await supabaseAdmin
    .from("deposit_holds")
    .update({
      status: "auto_refunded",
      resolved_renter_amount: hold.amount,
      resolved_owner_amount: 0,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", hold.id)
    .eq("status", "held")
    .select("id")
    .maybeSingle();

  if (transitionError) {
    console.error(
      "Auto-release transition error for hold",
      hold.id,
      transitionError,
    );
    return { holdId: hold.id, outcome: "failed" };
  }
  if (!transitioned) {
    return { holdId: hold.id, outcome: "not_eligible" };
  }

  if (!provider || !phoneNumber) {
    console.error(
      "Auto-release skipped payout for hold due to missing payout info",
      hold.id,
    );
    return { holdId: hold.id, outcome: "missing_payout_info" };
  }

  const refundId = crypto.randomUUID();
  const { error: refundInsertError } = await supabaseAdmin
    .from("deposit_refunds")
    .insert({
      hold_id: hold.id,
      refund_id: refundId,
      amount: hold.amount,
      currency: hold.currency || "XOF",
      provider,
      recipient_phone: phoneNumber,
      status: "requested",
      metadata: { trigger: "auto_release_cron" },
    });

  if (refundInsertError) {
    console.error(
      "Auto-release deposit_refunds insert failed for hold",
      hold.id,
      refundInsertError,
    );
    return { holdId: hold.id, outcome: "failed" };
  }

  const result = await initiatePawaPayPayout({
    payoutId: refundId,
    amount: hold.amount,
    phoneNumber,
    provider,
    customerMessage: "Roogo caution refund",
    metadata: { holdId: hold.id, renterId: hold.renter_id, trigger: "auto" },
  });
  await updateDepositRefundFromPawaPayStatus(
    refundId,
    result.pawaPayStatus,
    result.payload,
    result.failureReason,
  );

  const refundStatus = mapPawaPayPayoutStatus(result.pawaPayStatus);

  try {
    await notifyUserWithTemplate(
      hold.renter_id,
      "payments",
      "deposits.autoRefunded",
      undefined,
      { holdId: hold.id, type: "deposit_auto_refunded" },
    );
  } catch (err) {
    console.error("Auto-release notify failed for hold", hold.id, err);
  }

  return { holdId: hold.id, outcome: "refunded", refundStatus };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const nowIso = new Date().toISOString();

    const { data: holds, error } = await supabaseAdmin
      .from("deposit_holds")
      .select(
        "id, renter_id, amount, currency, renter_payout_phone, renter_payout_provider, review_deadline_at",
      )
      .eq("status", "held")
      .lt("review_deadline_at", nowIso)
      .order("review_deadline_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) {
      console.error("Auto-release query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const eligible = (holds || []) as EligibleHold[];
    const results = [];
    for (const hold of eligible) {
      const res = await releaseOne(hold);
      results.push(res);
    }

    const refunded = results.filter((r) => r.outcome === "refunded").length;
    const missingInfo = results.filter(
      (r) => r.outcome === "missing_payout_info",
    ).length;
    const failed = results.filter((r) => r.outcome === "failed").length;
    const notEligible = results.filter(
      (r) => r.outcome === "not_eligible",
    ).length;

    return NextResponse.json({
      success: failed === 0,
      considered: eligible.length,
      refunded,
      missingInfo,
      failed,
      notEligible,
      timestamp: nowIso,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auto-release cron failed";
    console.error("Deposit auto-release cron failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
