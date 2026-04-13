import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";
import { notifyUser } from "@/lib/push-notifications";
import { captureServerEvent } from "@/lib/posthog-server";

// PawaPay IPs to whitelist
const PAWAPAY_IPS = [
  "3.64.89.224", // Sandbox
  "18.192.208.15", // Production
  "18.195.113.136", // Production
  "3.72.212.107", // Production
  "54.73.125.42", // Production
  "54.155.38.214", // Production
  "54.73.130.113", // Production
];

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (step: string, data: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ 
      route: "POST /api/pawapay/callback", 
      requestId, 
      step, 
      ...data, 
      timestamp: new Date().toISOString() 
    }));
  };

  try {
    // 0. IP Whitelisting
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    log("callback-received", { 
      clientIp, 
      forwardedFor,
      nodeEnv: process.env.NODE_ENV 
    });

    if (process.env.NODE_ENV === "production") {
      if (!clientIp || !PAWAPAY_IPS.includes(clientIp)) {
        log("ip-blocked", { clientIp, allowedIPs: PAWAPAY_IPS });
        return NextResponse.json({ error: "Unauthorized IP" }, { status: 403 });
      }
    }

    // 1. Parse Body
    const body = await req.json();
    const data = Array.isArray(body) ? body[0] : body;

    const transactionId = data.depositId || data.payoutId || data.refundId;
    const { status, failureReason } = data;

    log("callback-parsed", { 
      transactionId, 
      status, 
      failureReason,
      idType: data.depositId ? "deposit" : data.payoutId ? "payout" : data.refundId ? "refund" : "unknown",
      bodyKeys: Object.keys(data),
      rawBody: JSON.stringify(data).slice(0, 500)
    });

    if (!transactionId || !status) {
      log("invalid-payload", { transactionId, status, data });
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const resolveWebProvider = (callbackPayload: unknown): string | null => {
      if (!callbackPayload || typeof callbackPayload !== "object") return null;
      const payload = callbackPayload as Record<string, unknown>;

      const directProvider =
        typeof payload.provider === "string" ? payload.provider : null;
      const directCorrespondent =
        typeof payload.correspondent === "string" ? payload.correspondent : null;

      const payer =
        payload.payer && typeof payload.payer === "object"
          ? (payload.payer as Record<string, unknown>)
          : null;
      const accountDetails =
        payer?.accountDetails && typeof payer.accountDetails === "object"
          ? (payer.accountDetails as Record<string, unknown>)
          : null;
      const nestedProvider =
        typeof accountDetails?.provider === "string"
          ? accountDetails.provider
          : null;

      const providerHint = `${directProvider || ""} ${directCorrespondent || ""} ${nestedProvider || ""}`.toUpperCase();
      if (providerHint.includes("ORANGE")) return "web_orange";
      if (providerHint.includes("MOOV")) return "web_moov";
      return null;
    };

    // 2. Map Status
    let dbStatus = "pending";
    if (status === "COMPLETED") dbStatus = "completed";
    if (status === "ACCEPTED") dbStatus = "pending"; // ACCEPTED = queued, not confirmed
    if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED")
      dbStatus = "failed";
    if (status === "REFUNDED") dbStatus = "refunded";
    if (status === "SUBMITTED") dbStatus = "submitted";

    log("status-mapped", { 
      transactionId, 
      pawaPayStatus: status, 
      mappedDbStatus: dbStatus 
    });

    // 3. Update Supabase
    const supabase = getSupabaseClient();

    // Fetch the transaction first
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("deposit_id", transactionId)
      .single();

    if (fetchError || !transaction) {
      log("transaction-not-found", { 
        transactionId, 
        fetchError: String(fetchError),
        pawaPayStatus: status,
        failureReason: failureReason ? JSON.stringify(failureReason) : null,
        fullPayload: JSON.stringify(data).slice(0, 1000)
      });
      
      // Still return 200 OK to PawaPay to acknowledge receipt
      // Even if we can't find the transaction, we don't want PawaPay to retry
      return NextResponse.json({ 
        received: true, 
        warning: "Transaction not found in database" 
      }, { status: 200 });
    }

    log("transaction-found", { 
      transactionId, 
      previousStatus: transaction.status, 
      type: transaction.type,
      propertyId: transaction.property_id,
      userId: transaction.user_id
    });

    // Extract detailed failure information
    let detailedFailureReason = null;
    if (dbStatus === "failed" && failureReason) {
      // PawaPay sends failureReason as an object with failureMessage, failureCode, etc.
      if (typeof failureReason === 'object') {
        detailedFailureReason = JSON.stringify(failureReason);
      } else {
        detailedFailureReason = String(failureReason);
      }
    }

    const inferredProvider = resolveWebProvider(data);

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        status: dbStatus,
        provider: inferredProvider || transaction.provider,
        failure_reason: detailedFailureReason || null,
        metadata: { ...(transaction.metadata || {}), ...data }, // Merge metadata
        updated_at: new Date().toISOString(),
      })
      .eq("deposit_id", transactionId);

    if (updateError) {
      log("db-update-failed", { transactionId, error: String(updateError) });
      return NextResponse.json(
        { error: "Database update failed" },
        { status: 500 }
      );
    }

    log("db-updated", { transactionId, newStatus: dbStatus });

    // 4. Handle Post-Payment Logic
    if (dbStatus === "completed") {
      if (transaction.status !== "completed") {
        await captureServerEvent(transaction.user_id || transactionId, "payment_completed", {
          deposit_id: transactionId,
          amount: transaction.amount || 0,
          currency: transaction.currency || "XOF",
          transaction_type: transaction.type || "unknown",
          provider: transaction.provider || "unknown",
          property_id: transaction.property_id || null,
          source: "pawapay_callback",
        });
      }

      let notificationTitle = "Paiement confirmé";
      let notificationBody = "Votre paiement a été traité avec succès";
      const getPropertyLabel = async (propertyId: string) => {
        const { data: property } = await supabase
          .from("properties")
          .select("quartier, address")
          .eq("id", propertyId)
          .single();

        if (!property) return null;
        return property.quartier || property.address || null;
      };

      if (transaction.type === "property_lock") {
        const propertyId = transaction.property_id;

        if (propertyId) {
          log("post-payment-lock", { transactionId, propertyId });
          const propertyLabel = await getPropertyLabel(propertyId);

          const { error: lockError } = await supabase
            .from("properties")
            .update({ status: "locked" })
            .eq("id", propertyId);
          
          if (lockError) {
            log("post-payment-lock-failed", { transactionId, propertyId, error: String(lockError) });
          } else {
            log("post-payment-lock-success", { transactionId, propertyId });
          }

          if (propertyLabel) {
            notificationTitle = "Bien réservé avec succès";
            notificationBody = `Votre réservation pour "${propertyLabel}" est confirmée`;
          }
        }
      } else if (transaction.type === "boost") {
        const propertyId = transaction.property_id;
        if (propertyId) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7); // Boost for 7 days

          log("post-payment-boost", { transactionId, propertyId, expiresAt: expiresAt.toISOString() });
          const propertyLabel = await getPropertyLabel(propertyId);

          const { error: boostError } = await supabase
            .from("properties")
            .update({
              is_boosted: true,
              boost_expires_at: expiresAt.toISOString(),
            })
            .eq("id", propertyId);
          
          if (boostError) {
            log("post-payment-boost-failed", { transactionId, propertyId, error: String(boostError) });
          } else {
            log("post-payment-boost-success", { transactionId, propertyId });
          }

          if (propertyLabel) {
            notificationTitle = "Boost activé";
            notificationBody = `"${propertyLabel}" est maintenant en avant pour 7 jours`;
          }
        }
      } else if (transaction.type === "listing") {
        notificationTitle = "Annonce publiée";
        notificationBody = "Votre annonce est maintenant en ligne";
      }

      // Send payment confirmation notification
      if (transaction.user_id) {
        log("sending-payment-notification", { 
          userId: transaction.user_id, 
          transactionId,
          type: transaction.type 
        });
        
        await notifyUser(
          transaction.user_id,
          "payments",
          notificationTitle,
          notificationBody,
          {
            type: "payment_completed",
            transactionId: transaction.id,
            depositId: transactionId,
            transactionType: transaction.type,
            amount: transaction.amount,
          }
        );
      }
    }

    if (dbStatus === "failed" && transaction.status !== "failed") {
      await captureServerEvent(transaction.user_id || transactionId, "payment_failed", {
        deposit_id: transactionId,
        amount: transaction.amount || 0,
        currency: transaction.currency || "XOF",
        transaction_type: transaction.type || "unknown",
        provider: transaction.provider || "unknown",
        property_id: transaction.property_id || null,
        failure_reason: detailedFailureReason || "Payment failed",
        source: "pawapay_callback",
      });
    }

    log("callback-complete", { transactionId, finalStatus: dbStatus });

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    log("unhandled-error", { error: String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
