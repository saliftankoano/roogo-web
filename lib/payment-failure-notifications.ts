import { createHash } from "node:crypto";
import { after } from "next/server";
import { sendTransactionalSms } from "@/lib/africastalking";
import {
  claimPaymentFailureDelivery,
  claimPaymentFailureSmsCooldown,
  updateNotificationDeliveryMetadata,
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

export function queuePaymentFailureNotification(
  input: PaymentFailureNotificationInput,
) {
  after(async () => {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const result = await notifyPaymentFailure(input, {
        fallbackToSmsOnPushFailure: attempt === RETRY_DELAYS_MS.length,
      }).catch((error) => {
        console.error("Failed-payment notification failed:", error);
        return { delivered: false, reason: "claim_failed" as const };
      });
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

  let locale: PaymentFailureLocale = input.locale ?? "fr";
  let pushTokens: string[] = [];
  let pushEnabled = true;
  let pushAttempted = false;

  if (input.userId) {
    const pushContext = await getUserPushNotificationContext(
      input.userId,
      "payments",
    );
    if (pushContext) {
      locale = pushContext.locale === "en" ? "en" : "fr";
      pushTokens = pushContext.tokens;
      pushEnabled = pushContext.enabled;
    }
  }

  if (pushTokens.length > 0) {
    if (!pushEnabled) {
      await updateNotificationDeliveryMetadata({
        eventType: EVENT_TYPE,
        subjectId: input.depositId,
        metadata: {
          ...baseMetadata,
          channel: "push",
          pushEnabled: false,
          pushSent: false,
          smsSent: false,
        },
        deliveryStatus: "sent",
      });
      return { delivered: false, reason: "push_disabled" as const };
    }

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
    await removeUserPushTokens(pushResult.invalidTokens);

    if (pushResult.accepted || !options.fallbackToSmsOnPushFailure) {
      await updateNotificationDeliveryMetadata({
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
        deliveryStatus: pushResult.accepted ? "sent" : "failed",
      });
      return { delivered: pushResult.accepted, reason: "push" as const };
    }
  }

  if (!phone || !phoneHash) {
    await updateNotificationDeliveryMetadata({
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
  });
  if (smsClaimed === null) {
    await updateNotificationDeliveryMetadata({
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
  const smsSent = onCooldown
    ? false
    : await sendTransactionalSms(
        phone,
        paymentFailureSmsMessage(failureCode, locale),
      );

  await updateNotificationDeliveryMetadata({
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
    deliveryStatus: onCooldown || smsSent ? "sent" : "failed",
    releaseSmsClaim: !onCooldown && !smsSent,
  });

  return {
    delivered: smsSent,
    reason: onCooldown ? "sms_cooldown" : "sms",
  } as const;
}
