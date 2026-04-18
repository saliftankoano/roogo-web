import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import {
  mapPawaPayPayoutStatus,
  normalizeBurkinaPhone,
  normalizePawaPayProvider,
  updateOwnerPayoutFromPawaPayStatus,
} from "@/lib/owner-wallet";

const DEFAULT_PAYOUT_MIN = 100;
const DEFAULT_PAYOUT_MAX = 2_000_000;

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
    if (!["owner", "agent"].includes(user.user_type)) {
      return errorResponse(
        "Only owners and agents can request payouts",
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
      .select("id, owner_id, net_amount, currency")
      .eq("owner_id", user.id)
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

    const amount = earnings.reduce(
      (sum, earning) => sum + Number(earning.net_amount || 0),
      0,
    );
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
        metadata: { earningIds: uniqueEarningIds },
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

    const pawaPayConfig = resolvePawaPayConfig();
    const payload = {
      payoutId,
      amount: amount.toString(),
      currency: "XOF",
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber,
          provider,
        },
      },
      customerMessage: "Roogo payout",
      metadata: {
        ownerId: user.id,
        earningIds: uniqueEarningIds,
      },
    };

    const response = await fetch(`${pawaPayConfig.url}/v2/payouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaPayConfig.token}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    if (!response.ok) {
      const statusCheck = await checkPayoutStatus(pawaPayConfig, payoutId);
      if (statusCheck?.status === "FOUND") {
        const data = statusCheck.data as Record<string, unknown> | undefined;
        const foundStatus =
          typeof data?.status === "string" ? data.status : "PROCESSING";
        await updateOwnerPayoutFromPawaPayStatus(
          payoutId,
          foundStatus,
          data || statusCheck,
          data?.failureReason,
        );

        return cors(
          NextResponse.json({
            success: true,
            payoutId,
            status: mapPawaPayPayoutStatus(foundStatus),
            amount,
          }),
          req,
        );
      }

      await updateOwnerPayoutFromPawaPayStatus(
        payoutId,
        "FAILED",
        result,
        result.failureReason || result.message,
      );

      return errorResponse(
        typeof result.message === "string"
          ? result.message
          : "Failed to initiate payout",
        response.status,
        req,
      );
    }

    const initiationStatus =
      typeof result.status === "string" ? result.status : "ACCEPTED";
    const status = mapPawaPayPayoutStatus(initiationStatus);
    await updateOwnerPayoutFromPawaPayStatus(
      payoutId,
      initiationStatus,
      result,
      result.failureReason,
    );

    return cors(
      NextResponse.json({
        success: true,
        payoutId,
        status,
        amount,
      }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/owner-wallet/payouts:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

async function checkPayoutStatus(
  config: ReturnType<typeof resolvePawaPayConfig>,
  payoutId: string,
) {
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
