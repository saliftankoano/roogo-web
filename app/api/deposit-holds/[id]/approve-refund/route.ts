import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import {
  mapPawaPayPayoutStatus,
  normalizePawaPayProvider,
} from "@/lib/owner-wallet";
import { initiatePawaPayPayout } from "@/lib/pawapay-payouts";
import { notifyUser } from "@/lib/push-notifications";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: holdId } = await params;
    if (!holdId) return errorResponse("Missing hold id", 400, req);

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

    const { data: hold, error: holdError } = await supabaseAdmin
      .from("deposit_holds")
      .select(
        "id, owner_id, renter_id, amount, currency, status, renter_payout_phone, renter_payout_provider",
      )
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) {
      console.error("Error loading deposit hold:", holdError);
      return errorResponse("Failed to load deposit hold", 500, req);
    }
    if (!hold) return errorResponse("Deposit hold not found", 404, req);
    if (hold.owner_id !== user.id) return errorResponse("Forbidden", 403, req);
    if (hold.status !== "held") {
      return errorResponse(
        "This deposit can no longer be refunded from this screen",
        409,
        req,
      );
    }

    const provider = normalizePawaPayProvider(hold.renter_payout_provider);
    if (!provider) {
      return errorResponse(
        "Renter payout provider is invalid. Ask the renter to update it.",
        400,
        req,
      );
    }
    const phoneNumber = hold.renter_payout_phone;
    if (!phoneNumber) {
      return errorResponse(
        "Renter payout phone is missing. Ask the renter to update it.",
        400,
        req,
      );
    }

    // Atomic transition: only one caller can move held -> refunded_full.
    // We flip here rather than at callback time so the UI can reflect the
    // intent immediately; the PawaPay status drives deposit_refunds only.
    const { data: transitioned, error: transitionError } = await supabaseAdmin
      .from("deposit_holds")
      .update({
        status: "refunded_full",
        resolved_renter_amount: hold.amount,
        resolved_owner_amount: 0,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", holdId)
      .eq("status", "held")
      .select("id")
      .maybeSingle();

    if (transitionError) {
      console.error("Error transitioning deposit hold:", transitionError);
      return errorResponse("Failed to approve refund", 500, req);
    }
    if (!transitioned) {
      return errorResponse(
        "This deposit is no longer eligible for refund (state changed)",
        409,
        req,
      );
    }

    const refundId = crypto.randomUUID();
    const { data: refund, error: refundError } = await supabaseAdmin
      .from("deposit_refunds")
      .insert({
        hold_id: holdId,
        refund_id: refundId,
        amount: hold.amount,
        currency: hold.currency || "XOF",
        provider,
        recipient_phone: phoneNumber,
        status: "requested",
        metadata: {
          trigger: "owner_approved_refund",
          approvedBy: user.id,
        },
      })
      .select("id")
      .single();

    if (refundError || !refund) {
      console.error("Error creating deposit_refunds row:", refundError);
      // Roll back the hold transition so the owner can retry.
      await supabaseAdmin
        .from("deposit_holds")
        .update({
          status: "held",
          resolved_renter_amount: null,
          resolved_owner_amount: null,
          resolved_by: null,
          resolved_at: null,
        })
        .eq("id", holdId);
      return errorResponse("Failed to record refund", 500, req);
    }

    const result = await initiatePawaPayPayout({
      payoutId: refundId,
      amount: hold.amount,
      phoneNumber,
      provider,
      customerMessage: "Roogo caution refund",
      metadata: {
        holdId,
        renterId: hold.renter_id,
      },
    });

    const mappedStatus = mapPawaPayPayoutStatus(result.pawaPayStatus);
    const payloadJson =
      result.payload && typeof result.payload === "object"
        ? (result.payload as Record<string, unknown>)
        : { raw: String(result.payload ?? "") };

    await supabaseAdmin
      .from("deposit_refunds")
      .update({
        status: mappedStatus,
        failure_reason:
          typeof result.failureReason === "string"
            ? result.failureReason
            : null,
        metadata: {
          trigger: "owner_approved_refund",
          approvedBy: user.id,
          pawaPay: payloadJson,
        },
        completed_at: mappedStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("refund_id", refundId);

    if (result.clientError) {
      return errorResponse(
        result.clientError.message,
        result.clientError.httpStatus,
        req,
      );
    }

    try {
      await notifyUser(
        hold.renter_id,
        "payments",
        "Caution remboursée",
        "Le propriétaire a validé votre séjour. Votre caution est en route vers Mobile Money.",
        { holdId, type: "deposit_refund_approved" },
      );
    } catch (err) {
      console.error("Approve-refund notify failed:", err);
    }

    return cors(
      NextResponse.json({
        success: true,
        refundId,
        status: mappedStatus,
        amount: hold.amount,
      }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/deposit-holds/[id]/approve-refund:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
