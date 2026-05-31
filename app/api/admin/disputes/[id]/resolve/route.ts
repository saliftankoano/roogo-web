import { auth, currentUser } from "@clerk/nextjs/server";
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
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: holdId } = await params;
    if (!holdId) {
      return NextResponse.json({ error: "Missing hold id" }, { status: 400 });
    }

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await currentUser();
    const userType = user?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const staffUser = await getOrSyncUserByClerkId(userId);
    if (!staffUser) {
      return NextResponse.json({ error: "Staff user not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      ownerAmount?: unknown;
      renterAmount?: unknown;
      notes?: unknown;
    };
    const ownerAmount = Math.max(0, Math.round(Number(body.ownerAmount) || 0));
    const renterAmount = Math.max(0, Math.round(Number(body.renterAmount) || 0));
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    const { data: hold, error: holdError } = await supabaseAdmin
      .from("deposit_holds")
      .select(
        "id, agreement_id, property_id, owner_id, renter_id, amount, currency, status, renter_payout_phone, renter_payout_provider",
      )
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) {
      console.error("Error loading hold for resolve:", holdError);
      return NextResponse.json(
        { error: "Failed to load dispute" },
        { status: 500 },
      );
    }
    if (!hold) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }
    if (hold.status !== "disputed") {
      return NextResponse.json(
        { error: "Ce litige n'est plus ouvert" },
        { status: 409 },
      );
    }
    if (ownerAmount + renterAmount !== hold.amount) {
      return NextResponse.json(
        {
          error: `La somme doit être égale à la caution (${hold.amount} ${hold.currency || "XOF"}).`,
        },
        { status: 400 },
      );
    }

    let finalStatus: "resolved_split" | "resolved_owner_full" | "resolved_renter_full";
    if (ownerAmount === 0) finalStatus = "resolved_renter_full";
    else if (renterAmount === 0) finalStatus = "resolved_owner_full";
    else finalStatus = "resolved_split";

    // Atomic transition disputed -> resolved_*. Race-safe.
    const resolvedAt = new Date().toISOString();
    const { data: transitioned, error: transitionError } = await supabaseAdmin
      .from("deposit_holds")
      .update({
        status: finalStatus,
        resolved_owner_amount: ownerAmount,
        resolved_renter_amount: renterAmount,
        resolved_by: staffUser.id,
        resolved_at: resolvedAt,
      })
      .eq("id", holdId)
      .eq("status", "disputed")
      .select("id")
      .maybeSingle();

    if (transitionError) {
      console.error("Error transitioning hold to resolved:", transitionError);
      return NextResponse.json(
        { error: "Failed to resolve dispute" },
        { status: 500 },
      );
    }
    if (!transitioned) {
      return NextResponse.json(
        { error: "Ce litige a déjà été traité" },
        { status: 409 },
      );
    }

    // Close the active claim.
    await supabaseAdmin
      .from("deposit_claims")
      .update({
        status: "resolved",
        resolved_at: resolvedAt,
      })
      .eq("hold_id", holdId)
      .eq("status", "submitted");

    // Owner share -> owner_earnings with source_type='deposit_split'. 5%
    // withdrawal fee is deducted later at payout time, not here.
    if (ownerAmount > 0) {
      const { error: earningError } = await supabaseAdmin
        .from("owner_earnings")
        .insert({
          owner_id: hold.owner_id,
          hold_id: holdId,
          property_id: hold.property_id,
          agreement_id: hold.agreement_id,
          source_type: "deposit_split",
          gross_rent_amount: ownerAmount,
          fee_rate_bps: 0,
          fee_amount: 0,
          net_amount: ownerAmount,
          currency: hold.currency || "XOF",
          earned_at: resolvedAt,
        });

      if (earningError) {
        console.error(
          "Error inserting owner_earnings for deposit split:",
          earningError,
        );
        // Don't roll back the hold — the dispute IS resolved. Log and continue.
      }
    }

    // Renter share -> PawaPay payout via deposit_refunds.
    let refundStatus: string | null = null;
    let refundId: string | null = null;
    if (renterAmount > 0) {
      const provider = normalizePawaPayProvider(
        hold.renter_payout_provider || "",
      );
      const phoneNumber = hold.renter_payout_phone;

      if (!provider || !phoneNumber) {
        console.error(
          "Cannot refund renter — missing payout phone/provider on hold",
          holdId,
        );
        refundStatus = "missing_payout_info";
      } else {
        refundId = crypto.randomUUID();
        const { error: refundInsertError } = await supabaseAdmin
          .from("deposit_refunds")
          .insert({
            hold_id: holdId,
            refund_id: refundId,
            amount: renterAmount,
            currency: hold.currency || "XOF",
            provider,
            recipient_phone: phoneNumber,
            status: "requested",
            metadata: {
              trigger: "admin_resolved_dispute",
              resolvedBy: staffUser.id,
              notes,
            },
          });

        if (refundInsertError) {
          console.error(
            "Error inserting deposit_refunds row on resolve:",
            refundInsertError,
          );
          refundStatus = "refund_record_failed";
        } else {
          const result = await initiatePawaPayPayout({
            payoutId: refundId,
            amount: renterAmount,
            phoneNumber,
            provider,
            customerMessage: "Roogo caution settlement",
            metadata: { holdId, renterId: hold.renter_id, notes },
          });
          await updateDepositRefundFromPawaPayStatus(
            refundId,
            result.pawaPayStatus,
            result.payload,
            result.failureReason,
          );
          refundStatus = mapPawaPayPayoutStatus(result.pawaPayStatus);
        }
      }
    }

    const formatXof = (n: number) =>
      `${n.toLocaleString("fr-FR")} FCFA`;

    try {
      await Promise.all([
        notifyUserWithTemplate(
          hold.renter_id,
          "payments",
          renterAmount > 0
            ? "deposits.resolvedRenterRefunded"
            : "deposits.resolvedRenterOwnerKept",
          { amount: formatXof(renterAmount) },
          { holdId, type: "deposit_resolved", finalStatus },
        ),
        notifyUserWithTemplate(
          hold.owner_id,
          "payments",
          ownerAmount > 0
            ? "deposits.resolvedOwnerCredited"
            : "deposits.resolvedOwnerRenterRefunded",
          { amount: formatXof(ownerAmount) },
          { holdId, type: "deposit_resolved", finalStatus },
        ),
      ]);
    } catch (err) {
      console.error("Resolve notify failed:", err);
    }

    return NextResponse.json({
      success: true,
      status: finalStatus,
      ownerAmount,
      renterAmount,
      refundId,
      refundStatus,
    });
  } catch (error) {
    console.error("Admin resolve POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
