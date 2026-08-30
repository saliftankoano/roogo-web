import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import {
  mapPawaPayPayoutStatus,
  normalizeBurkinaPhone,
  normalizePawaPayProvider,
  updateOwnerPayoutFromPawaPayStatus,
} from "@/lib/owner-wallet";
import { initiatePawaPayPayout } from "@/lib/pawapay-payouts";
import { isHotelFinanceAdmin } from "@/lib/hotel-auth";

const DEFAULT_PAYOUT_MIN = 100;
const DEFAULT_PAYOUT_MAX = 2_000_000;
const DEPOSIT_SPLIT_WITHDRAWAL_FEE_BPS = 500; // 5% fee on deposit_split earnings at cash-out

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
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
    const canUseWallet =
      ["owner", "agent", "staff", "founder"].includes(user.user_type) ||
      (user.user_type === "hotel" && (await isHotelFinanceAdmin(user.id)));
    if (!canUseWallet) {
      return errorResponse(
        "Only listing owners and hotel admins can request payouts",
        403,
        req,
      );
    }

    const body = (await req.json()) as {
      earningIds?: unknown;
      provider?: unknown;
      phoneNumber?: unknown;
    };

    const earningIds = Array.isArray(body.earningIds)
      ? body.earningIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    const uniqueEarningIds = [...new Set(earningIds)];
    if (uniqueEarningIds.length === 0) {
      return errorResponse("Select at least one rent credit", 400, req);
    }

    const provider =
      typeof body.provider === "string"
        ? normalizePawaPayProvider(body.provider)
        : null;
    if (!provider) return errorResponse("Invalid payout provider", 400, req);

    const phoneNumber =
      typeof body.phoneNumber === "string"
        ? normalizeBurkinaPhone(body.phoneNumber)
        : null;
    if (!phoneNumber)
      return errorResponse("Invalid payout phone number", 400, req);

    const { data: earnings, error: earningsError } = await supabaseAdmin
      .from("owner_earnings")
      .select("id, owner_id, net_amount, currency, source_type, available_at")
      .eq("owner_id", user.id)
      .lte("available_at", new Date().toISOString())
      .in("id", uniqueEarningIds);

    if (earningsError) {
      console.error("Error fetching selected owner earnings:", earningsError);
      return errorResponse(
        "Failed to validate selected rent credits",
        500,
        req,
      );
    }

    if (!earnings || earnings.length !== uniqueEarningIds.length) {
      return errorResponse(
        "One or more rent credits are not available",
        400,
        req,
      );
    }

    const { data: activeItems, error: activeItemsError } = await supabaseAdmin
      .from("owner_payout_items")
      .select("earning_id")
      .in("earning_id", uniqueEarningIds)
      .is("released_at", null);

    if (activeItemsError) {
      console.error("Error checking active payout items:", activeItemsError);
      return errorResponse(
        "Failed to validate selected rent credits",
        500,
        req,
      );
    }

    if ((activeItems || []).length > 0) {
      return errorResponse(
        "One or more selected rent credits are already reserved for payout",
        400,
        req,
      );
    }

    // Compute per-earning withdrawal fees. deposit_split credits carry a 5%
    // withdrawal-time fee to preserve platform margin on damage settlements;
    // rent credits were already feed at credit-time so no further deduction.
    const feesByEarning = new Map<string, number>();
    let totalWithdrawalFee = 0;
    for (const earning of earnings) {
      const net = Number(earning.net_amount || 0);
      const fee =
        earning.source_type === "deposit_split"
          ? Math.round((net * DEPOSIT_SPLIT_WITHDRAWAL_FEE_BPS) / 10_000)
          : 0;
      feesByEarning.set(earning.id, fee);
      totalWithdrawalFee += fee;
    }

    const grossAmount = earnings.reduce(
      (sum, earning) => sum + Number(earning.net_amount || 0),
      0,
    );
    const amount = grossAmount - totalWithdrawalFee;
    if (amount < DEFAULT_PAYOUT_MIN || amount > DEFAULT_PAYOUT_MAX) {
      return errorResponse(
        `Payout amount must be between ${DEFAULT_PAYOUT_MIN} and ${DEFAULT_PAYOUT_MAX} XOF`,
        400,
        req,
      );
    }

    const payoutId = crypto.randomUUID();
    const { data: payout, error: payoutError } = await supabaseAdmin
      .from("owner_payouts")
      .insert({
        owner_id: user.id,
        payout_id: payoutId,
        amount,
        currency: "XOF",
        provider,
        recipient_phone: phoneNumber,
        status: "requested",
        metadata: {
          earningIds: uniqueEarningIds,
          grossAmount,
          withdrawalFee: totalWithdrawalFee,
        },
      })
      .select("*")
      .single();

    if (payoutError || !payout) {
      console.error("Error creating owner payout:", payoutError);
      return errorResponse("Failed to create payout request", 500, req);
    }

    const { error: itemsError } = await supabaseAdmin
      .from("owner_payout_items")
      .insert(
        earnings.map((earning) => ({
          payout_id: payout.id,
          earning_id: earning.id,
          amount: earning.net_amount,
          withdrawal_fee_amount: feesByEarning.get(earning.id) || 0,
        })),
      );

    if (itemsError) {
      await supabaseAdmin
        .from("owner_payouts")
        .update({
          status: "rejected",
          failure_reason: "Selected rent credits are no longer available",
        })
        .eq("id", payout.id);
      return errorResponse(
        "One or more selected rent credits are no longer available",
        400,
        req,
      );
    }

    const result = await initiatePawaPayPayout({
      payoutId,
      amount,
      phoneNumber,
      provider,
      customerMessage: "Roogo payout",
      metadata: {
        ownerId: user.id,
        earningIds: uniqueEarningIds,
      },
    });

    await updateOwnerPayoutFromPawaPayStatus(
      payoutId,
      result.pawaPayStatus,
      result.payload,
      result.failureReason,
    );

    if (result.clientError) {
      return errorResponse(
        result.clientError.message,
        result.clientError.httpStatus,
        req,
      );
    }

    return cors(
      NextResponse.json({
        success: true,
        payoutId,
        status: mapPawaPayPayoutStatus(result.pawaPayStatus),
        amount,
      }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/owner-wallet/payouts:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
