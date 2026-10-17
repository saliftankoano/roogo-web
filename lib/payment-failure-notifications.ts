import { createHash } from "node:crypto";
import { after } from "next/server";
import { sendTransactionalSmsWithResult } from "@/lib/africastalking";
import {
  claimPaymentFailureDelivery,
  beginPaymentFailureSend,
  claimPaymentFailureSmsCooldown,
  updateNotificationDeliveryMetadata,
  persistNotificationDeliveryOutcome,
} from "@/lib/notification-deliveries";
import {
  paymentFailureMessage,
  paymentFailureSmsMessage,
  paymentFailureTitle,
  shouldRetryPaymentFailureNotification,
  type PaymentFailureLocale,
} from "@/lib/payment-failures";
import {
  getUserPushNotificationContext,
  removeUserPushTokens,
  sendExpoPushNotificationsWithResult,
} from "@/lib/push-notifications";
import { releaseMonthlyPropertyLockPayment } from "@/lib/property-lock-finalization";

const EVENT_TYPE = "payments.failed";
const SMS_COOLDOWN_MS = 15 * 60 * 1000;
const RETRY_DELAYS_MS = [2_500, 7_500];

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function normalizeSmsPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function hashPhone(phone: string) {
  return createHash("sha256").update(phone).digest("hex");
}

export type PaymentFailureNotificationInput = {
  depositId: string;
  failureCode: string;
  payerPhone?: string | null;
  userId?: string | null;
  transactionId?: string | null;
  transactionType?: string | null;
  propertyId?: string | null;
  locale?: PaymentFailureLocale;
};

export async function queuePaymentFailureNotification(
  input: PaymentFailureNotificationInput,
) {
  // A property reservation claim is payment state, not notification state.
  // Release it before returning a failure response so an immediate retry is
  // never blocked by optional background delivery work.
  if (input.transactionType === "property_lock") {
    await releaseMonthlyPropertyLockPayment(input.depositId).catch((error) => {
      console.error("Failed to release property payment claim:", error);
    });
  }

  after(async () => {
    let pushRejected = false;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const result = await notifyPaymentFailure(input, {
        fallbackToSmsOnPushFailure:
          pushRejected && attempt === RETRY_DELAYS_MS.length,
      }).catch((error) => {
        console.error("Failed-payment notification failed:", error);
        return { delivered: false, reason: "claim_failed" as const };
      });
      if (result.reason === "push" && !result.delivered) pushRejected = true;
      if (!shouldRetryPaymentFailureNotification(result)) return;

      const delayMs = RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) return;
      await wait(delayMs);
    }
  });
}

export async function notifyPaymentFailure(
  input: PaymentFailureNotificationInput,
  options: { fallbackToSmsOnPushFailure?: boolean } = {},
) {
  const phone = input.payerPhone ? normalizeSmsPhone(input.payerPhone) : "";
  const phoneHash = phone ? hashPhone(phone) : null;
  const failureCode = input.failureCode.toUpperCase();
  const baseMetadata: Record<string, unknown> = {
    failureCode,
    phoneHash,
    transactionId: input.transactionId ?? null,
    transactionType: input.transactionType ?? null,
    propertyId: input.propertyId ?? null,
  };

  const reserved = await claimPaymentFailureDelivery({
    userId: input.userId,
    notificationType: "payments",
    eventType: EVENT_TYPE,
    subjectId: input.depositId,
    metadata: baseMetadata,
  });
  if (reserved === null) {
    return { delivered: false, reason: "claim_failed" as const };
  }
  if (!reserved) return { delivered: false, reason: "duplicate" as const };

  // Fence every outcome to this lease. Retry only persistence, never the send.
  const persist = (
    update: Parameters<typeof updateNotificationDeliveryMetadata>[0],
  ) => persistNotificationDeliveryOutcome({ ...update, attemptId: reserved });

  let locale: PaymentFailureLocale = input.locale ?? "fr";
  let pushTokens: string[] = [];
  let pushEnabled = true;
  let pushAttempted = false;

  if (input.userId) {
    const pushLookup = await getUserPushNotificationContext(
      input.userId,
      "payments",
    );
    if (pushLookup.status === "retry") {
      await persist({
        eventType: EVENT_TYPE,
        subjectId: input.depositId,
        metadata: {
          ...baseMetadata,
          channel: "none",
          pushContextLookupFailed: true,
          pushSent: false,
          smsSent: false,
        },
        deliveryStatus: "failed",
      });
      return { delivered: false, reason: "push_context" as const };
    }
    const pushContext = pushLookup.context;
    locale = pushContext.locale === "en" ? "en" : "fr";
    pushTokens = pushContext.tokens;
    pushEnabled = pushContext.enabled;
  }

  if (input.userId && !pushEnabled) {
    await persist({
      eventType: EVENT_TYPE,
      subjectId: input.depositId,
      metadata: {
        ...baseMetadata,
        channel: "none",
        pushEnabled: false,
        pushSent: false,
        smsSent: false,
      },
      deliveryStatus: "sent",
    });
    return { delivered: false, reason: "push_disabled" as const };
  }

  if (pushTokens.length > 0 && !options.fallbackToSmsOnPushFailure) {
    const begun = await beginPaymentFailureSend(
      input.depositId,
      reserved,
      "push",
    );
    if (!begun)
      return {
        delivered: false,
        reason:
          begun === null ? ("claim_failed" as const) : ("duplicate" as const),
      };
    pushAttempted = true;
    const pushResult = await sendExpoPushNotificationsWithResult({
      to: pushTokens,
      title: paymentFailureTitle(locale),
      body: paymentFailureMessage(failureCode, locale),
      data: {
        type: "payment_failed",
        depositId: input.depositId,
        transactionId: input.transactionId,
        transactionType: input.transactionType,
        propertyId: input.propertyId,
        failureCode,
      },
      sound: "default",
    });
    await removeUserPushTokens(pushResult.invalidTokens).catch(() => {});

    {
      await persist({
        eventType: EVENT_TYPE,
        subjectId: input.depositId,
        metadata: {
          ...baseMetadata,
          channel: "push",
          pushEnabled: true,
          pushSent: pushResult.accepted,
          invalidPushTokens: pushResult.invalidTokens.length,
          smsSent: false,
        },
        deliveryStatus:
          pushResult.outcome === "accepted"
            ? "sent"
            : pushResult.outcome === "rejected"
              ? "failed"
              : "uncertain",
      });
      return {
        delivered: pushResult.accepted,
        reason:
          pushResult.outcome === "unknown"
            ? ("push_unknown" as const)
            : ("push" as const),
      };
    }
  }

  if (!phone || !phoneHash) {
    await persist({
      eventType: EVENT_TYPE,
      subjectId: input.depositId,
      metadata: {
        ...baseMetadata,
        channel: "none",
        pushAttempted,
        pushSent: false,
        smsSent: false,
      },
      deliveryStatus: "sent",
    });
    return { delivered: false, reason: "missing_phone" as const };
  }

  const smsClaimed = await claimPaymentFailureSmsCooldown({
    subjectId: input.depositId,
    phoneHash,
    failureCode,
    since: new Date(Date.now() - SMS_COOLDOWN_MS),
    attemptId: reserved,
  });
  if (smsClaimed === null) {
    await persist({
      eventType: EVENT_TYPE,
      subjectId: input.depositId,
      metadata: {
        ...baseMetadata,
        channel: "sms",
        smsCooldownClaimFailed: true,
        smsSent: false,
      },
      deliveryStatus: "failed",
    });
    return { delivered: false, reason: "sms_claim_failed" as const };
  }
  const onCooldown = !smsClaimed;
  let smsOutcome: "accepted" | "rejected" | "unknown" = "rejected";
  if (!onCooldown) {
    const begun = await beginPaymentFailureSend(
      input.depositId,
      reserved,
      "sms",
    );
    if (!begun)
      return {
        delivered: false,
        reason:
          begun === null ? ("claim_failed" as const) : ("duplicate" as const),
      };
    smsOutcome = await sendTransactionalSmsWithResult(
      phone,
      paymentFailureSmsMessage(failureCode, locale),
    );
  }
  const smsSent = smsOutcome === "accepted";

  await persist({
    eventType: EVENT_TYPE,
    subjectId: input.depositId,
    metadata: {
      ...baseMetadata,
      channel: "sms",
      pushAttempted,
      pushSent: pushAttempted ? false : undefined,
      smsCooldownSuppressed: onCooldown,
      smsSent,
    },
    deliveryStatus:
      onCooldown || smsSent
        ? "sent"
        : smsOutcome === "rejected"
          ? "failed"
          : "uncertain",
    releaseSmsClaim: !onCooldown && smsOutcome === "rejected",
  });

  return {
    delivered: smsSent,
    reason: onCooldown
      ? "sms_cooldown"
      : smsOutcome === "unknown"
        ? "sms_unknown"
        : "sms",
  } as const;
}
