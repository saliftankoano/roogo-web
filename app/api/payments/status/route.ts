import { cors, corsOptions } from "@/lib/api-helpers";
import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { getSupabaseClient } from "@/lib/user-sync";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import type { NotificationCopyKey } from "@/lib/notification-copy";
import { captureServerEvent } from "@/lib/posthog-server";
import { resolvePawaPayConfig } from "@/lib/pawapay-config";
import { creditOwnerEarningForSchedule } from "@/lib/owner-wallet";
import { notifyOwnerRentReceivedForSchedule } from "@/lib/rent-notifications";
import { voidPendingReferralForTransaction } from "@/lib/referrals";
import { unescapeText } from "@/lib/text-sanitize";
import {
  finalizeDailyBookingAfterPayment,
  isBlockedDailyFinalize,
} from "@/lib/daily-bookings";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = (step: string, data: Record<string, unknown> = {}) => {
    console.log(
      JSON.stringify({
        route: "POST /api/payments/status",
        requestId,
        step,
        ...data,
        timestamp: new Date().toISOString(),
      }),
    );
  };

  try {
    // 1. Verify Clerk Token
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    if (!token) {
      log("error", { error: "Missing token" });
      return cors(
        NextResponse.json({ error: "Missing token" }, { status: 401 }),
      );
    }

    let clerkUserId = "";
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub ?? "";
    } catch (error) {
      log("auth-failed", { error: String(error) });
      return cors(
        NextResponse.json({ error: "Invalid token" }, { status: 401 }),
      );
    }

    // 2. Parse Body
    const body = await req.json();
    const { depositId } = body;

    if (!depositId) {
      log("error", { error: "Missing depositId" });
      return cors(
        NextResponse.json({ error: "Missing depositId" }, { status: 400 }),
      );
    }

    log("checking-status", { depositId });

    const supabase = getSupabaseClient();
    const getPropertyLabel = async (propertyId: string) => {
      const { data: propertyData } = await supabase
        .from("properties")
        .select("quartier, address")
        .eq("id", propertyId)
        .single();

      if (!propertyData) return null;
      const raw = propertyData.quartier || propertyData.address || null;
      return raw ? unescapeText(raw) : null;
    };

    const resolveWebProvider = (statusPayload: unknown): string | null => {
      if (!statusPayload || typeof statusPayload !== "object") return null;
      const payload = statusPayload as Record<string, unknown>;

      const directProvider =
        typeof payload.provider === "string" ? payload.provider : null;
      const directCorrespondent =
        typeof payload.correspondent === "string"
          ? payload.correspondent
          : null;

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

      const providerHint =
        `${directProvider || ""} ${directCorrespondent || ""} ${nestedProvider || ""}`.toUpperCase();
      if (providerHint.includes("ORANGE")) return "web_orange";
      if (providerHint.includes("MOOV")) return "web_moov";
      return null;
    };

    const getPaymentContext = async (
      transactionRecord: Record<string, unknown> | null,
    ) => {
      if (!transactionRecord) return null;

      const metadataRaw = transactionRecord.metadata;
      const metadata =
        metadataRaw && typeof metadataRaw === "object"
          ? (metadataRaw as Record<string, unknown>)
          : null;

      const addOns = Array.isArray(metadata?.add_ons)
        ? metadata.add_ons.filter(
            (value): value is string => typeof value === "string",
          )
        : [];

      const tierId =
        typeof metadata?.tier_id === "string" ? metadata.tier_id : null;
      const description =
        typeof metadata?.description === "string" ? metadata.description : null;

      let propertyLabel: string | null = null;
      if (
        typeof transactionRecord.property_id === "string" &&
        transactionRecord.property_id
      ) {
        propertyLabel = await getPropertyLabel(transactionRecord.property_id);
      }

      return {
        transactionType:
          typeof transactionRecord.type === "string"
            ? transactionRecord.type
            : null,
        amount:
          typeof transactionRecord.amount === "number"
            ? transactionRecord.amount
            : null,
        currency:
          typeof transactionRecord.currency === "string"
            ? transactionRecord.currency
            : "XOF",
        propertyId:
          typeof transactionRecord.property_id === "string"
            ? transactionRecord.property_id
            : null,
        propertyLabel,
        tierId,
        addOns,
        description,
      };
    };

    // 3. Check DB first (callback may have already updated it)
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("deposit_id", depositId)
      .single();

    if (fetchError || !transaction) {
      log("transaction-not-found-in-db", {
        depositId,
        fetchError: String(fetchError),
        errorCode: fetchError?.code,
        errorDetails: fetchError?.details,
      });
      // Continue to check PawaPay API - transaction might exist there
    } else {
      log("db-status", {
        depositId,
        dbStatus: transaction.status,
        type: transaction.type,
      });

      // If the DB already has a terminal status (updated by callback), return immediately
      // No need to call PawaPay API again
      if (
        transaction.status === "completed" ||
        transaction.status === "failed" ||
        transaction.status === "refunded"
      ) {
        const pawaPayStatus =
          transaction.status === "completed"
            ? "COMPLETED"
            : transaction.status === "failed"
              ? "FAILED"
              : "REFUNDED";

        log("returning-db-status", {
          depositId,
          status: pawaPayStatus,
          source: "database",
        });

        const context = await getPaymentContext(
          transaction as Record<string, unknown>,
        );

        if (
          transaction.status === "completed" &&
          transaction.type === "property_lock" &&
          transaction.property_id
        ) {
          const { data: propertyRecord } = await supabase
            .from("properties")
            .select("period")
            .eq("id", transaction.property_id)
            .maybeSingle();

          if (propertyRecord?.period === "day") {
            // Escalation (support issue + renter notification) for a blocked
            // late payment lives inside finalize and fires exactly once, so
            // this poll-repeated path only needs the structured log.
            const finalizeResult = await finalizeDailyBookingAfterPayment(
              transaction.id,
            );
            if (isBlockedDailyFinalize(finalizeResult)) {
              log("post-payment-daily-booking-unconfirmed", {
                depositId,
                propertyId: transaction.property_id,
                reason: finalizeResult.reason,
              });
            }
          }
        }

        return cors(
          NextResponse.json({
            success: true,
            status: pawaPayStatus,
            raw: { status: pawaPayStatus, ...(transaction.metadata || {}) },
            context,
          }),
        );
      }
    }

    // 4. DB status is still pending/submitted - check PawaPay API for latest
    const pawaPayConfig = resolvePawaPayConfig();
    if (!pawaPayConfig.url) {
      log("error", { error: "PAWAPAY_URL not configured" });
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 },
        ),
      );
    }
    const pawaUrl = pawaPayConfig.url;
    const pawaToken = pawaPayConfig.token;

    if (!pawaToken) {
      log("error", { error: "PAWAPAY_API_TOKEN not configured" });
      return cors(
        NextResponse.json(
          { error: "Server configuration error" },
          { status: 500 },
        ),
      );
    }

    const pawaPayUrl = `${pawaUrl}/v2/deposits/${depositId}`;
    log("pawapay-request", { url: pawaPayUrl, depositId });

    const response = await fetch(pawaPayUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }

    log("pawapay-response", {
      depositId,
      httpStatus: response.status,
      ok: response.ok,
      resultType: Array.isArray(result) ? "array" : typeof result,
      result: JSON.stringify(result).slice(0, 500),
    });

    if (!response.ok) {
      if (response.status === 404) {
        log("deposit-not-found", { depositId });
        return cors(
          NextResponse.json(
            {
              success: true,
              status: "NOT_FOUND",
              error: "Deposit not found in PawaPay system",
              raw: result,
            },
            { status: 200 },
          ),
        );
      }

      log("pawapay-error", { depositId, httpStatus: response.status, result });
      return cors(
        NextResponse.json(
          {
            success: false,
            error: "Failed to check status",
            details: result,
          },
          { status: response.status },
        ),
      );
    }

    const statusData = Array.isArray(result) ? result[0] : result;
    const status = statusData?.status || statusData?.depositStatus;

    log("status-extracted", {
      depositId,
      extractedStatus: status,
    });

    // 5. Update Supabase with PawaPay status
    if (status && transaction) {
      let dbStatus = "pending";
      if (status === "COMPLETED") dbStatus = "completed";
      if (status === "ACCEPTED" || status === "SUBMITTED")
        dbStatus = "submitted";
      if (
        status === "FAILED" ||
        status === "CANCELLED" ||
        status === "REJECTED"
      )
        dbStatus = "failed";
      if (status === "REFUNDED") dbStatus = "refunded";

      log("db-update", {
        depositId,
        pawaPayStatus: status,
        mappedDbStatus: dbStatus,
        previousDbStatus: transaction.status,
      });

      const inferredProvider = resolveWebProvider(statusData);

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status: dbStatus,
          provider: inferredProvider || transaction.provider,
          metadata: {
            ...((transaction.metadata as Record<string, unknown>) || {}),
            pawapay: statusData,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("deposit_id", depositId);

      if (updateError) {
        log("db-update-failed", { depositId, error: String(updateError) });
      }

      if (dbStatus === "failed") {
        await voidPendingReferralForTransaction(supabase, transaction.id);
        const metadata =
          transaction.metadata && typeof transaction.metadata === "object"
            ? (transaction.metadata as Record<string, unknown>)
            : {};
        const dailyBookingRequestId =
          typeof metadata.dailyBookingRequestId === "string"
            ? metadata.dailyBookingRequestId
            : null;
        if (dailyBookingRequestId) {
          await supabase
            .from("daily_booking_requests")
            .update({
              status: "approved_awaiting_payment",
              transaction_id: null,
            })
            .eq("id", dailyBookingRequestId)
            .eq("transaction_id", transaction.id);
        }
      }

      // Handle post-payment logic if it just became completed
      if (dbStatus === "completed" && transaction.status !== "completed") {
        await captureServerEvent(
          transaction.user_id || clerkUserId || depositId,
          "payment_completed",
          {
            deposit_id: depositId,
            amount: transaction.amount || 0,
            currency: transaction.currency || "XOF",
            transaction_type: transaction.type || "unknown",
            provider: transaction.provider || "unknown",
            property_id: transaction.property_id || null,
            source: "status_polling",
          },
        );

        log("post-payment-logic", {
          depositId,
          type: transaction.type,
          propertyId: transaction.property_id,
        });

        let suppressPaymentNotification = false;
        let notificationCopyKey: NotificationCopyKey =
          "payments.genericCompleted";
        let notificationParams: Record<string, string | number> = {};

        if (transaction.type === "boost" && transaction.property_id) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 7);

          const propertyLabel = await getPropertyLabel(transaction.property_id);

          await supabase
            .from("properties")
            .update({
              is_boosted: true,
              boost_expires_at: expiresAt.toISOString(),
            })
            .eq("id", transaction.property_id);

          if (propertyLabel) {
            notificationCopyKey = "payments.boostActivated";
            notificationParams = { propertyLabel };
          }
        } else if (
          transaction.type === "property_lock" &&
          transaction.property_id
        ) {
          const propertyLabel = await getPropertyLabel(transaction.property_id);
          const { data: propertyRecord } = await supabase
            .from("properties")
            .select("period")
            .eq("id", transaction.property_id)
            .maybeSingle();

          let dailyFinalizeBlocked = false;
          if (propertyRecord?.period !== "day") {
            await supabase
              .from("properties")
              .update({ status: "locked" })
              .eq("id", transaction.property_id);
          } else {
            const finalizeResult = await finalizeDailyBookingAfterPayment(
              transaction.id,
            );
            dailyFinalizeBlocked = isBlockedDailyFinalize(finalizeResult);
            if (dailyFinalizeBlocked) {
              log("post-payment-daily-booking-unconfirmed", {
                depositId,
                propertyId: transaction.property_id,
                reason: finalizeResult.reason,
              });
            }
          }

          if (propertyLabel) {
            notificationCopyKey =
              propertyRecord?.period === "day"
                ? "payments.stayReserved"
                : "payments.propertyReserved";
            notificationParams = { propertyLabel };
          }
          // Never announce a reserved stay when the late-payment guard
          // refused to confirm; finalize already notified the renter and
          // opened a support issue.
          if (dailyFinalizeBlocked) {
            suppressPaymentNotification = true;
          }
        } else if (
          transaction.type === "listing_submission" &&
          transaction.property_id
        ) {
          await supabase
            .from("properties")
            .update({
              transaction_id: transaction.id,
              payment_id: transaction.deposit_id,
            })
            .eq("id", transaction.property_id);

          notificationCopyKey = "payments.listingSubmitted";
        } else if (
          transaction.type === "rent_payment" &&
          transaction.metadata
        ) {
          const meta = transaction.metadata as Record<string, unknown>;
          const scheduleId = meta?.scheduleId as string | undefined;
          if (scheduleId) {
            await supabase
              .from("rent_schedules")
              .update({
                status: "paid",
                transaction_id: transaction.id,
                paid_at: new Date().toISOString(),
              })
              .eq("id", scheduleId);

            await creditOwnerEarningForSchedule(scheduleId);
            await notifyOwnerRentReceivedForSchedule(scheduleId);
          }
          notificationCopyKey = "payments.renterRentPaid";
        }

        // Send payment confirmation notification
        if (transaction.user_id && !suppressPaymentNotification) {
          log("sending-payment-notification", {
            userId: transaction.user_id,
            depositId,
            type: transaction.type,
          });

          await notifyUserWithTemplate(
            transaction.user_id,
            "payments",
            notificationCopyKey,
            notificationParams,
            {
              type: "payment_completed",
              transactionId: transaction.id,
              depositId: depositId,
              transactionType: transaction.type,
              amount: transaction.amount,
            },
          );
        }
      }

      if (dbStatus === "failed" && transaction.status !== "failed") {
        await captureServerEvent(
          transaction.user_id || clerkUserId || depositId,
          "payment_failed",
          {
            deposit_id: depositId,
            amount: transaction.amount || 0,
            currency: transaction.currency || "XOF",
            transaction_type: transaction.type || "unknown",
            provider: transaction.provider || "unknown",
            property_id: transaction.property_id || null,
            failure_reason:
              statusData?.failureReason?.failureMessage ||
              statusData?.failureReason ||
              "Payment failed",
            source: "status_polling",
          },
        );
      }
    }

    log("response-sent", {
      depositId,
      status,
      success: true,
    });

    const context = await getPaymentContext(
      transaction ? (transaction as Record<string, unknown>) : null,
    );

    return cors(
      NextResponse.json({
        success: true,
        status: status,
        raw: statusData,
        context,
      }),
    );
  } catch (error: unknown) {
    log("unhandled-error", {
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return cors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    );
  }
}
// trigger deploy
