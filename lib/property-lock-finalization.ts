import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  claimRetryableNotificationDelivery,
  beginRetryableNotificationSend,
  persistNotificationDeliveryOutcome,
} from "@/lib/notification-deliveries";
import {
  getUserPushNotificationContext,
  removeUserPushTokens,
  sendExpoPushNotificationsWithResult,
} from "@/lib/push-notifications";
import { renderNotificationCopy } from "@/lib/notification-copy";
import { unescapeText } from "@/lib/text-sanitize";

export type PropertyLockCompletion = {
  paymentStatus: string | null;
  failureCode: string | null;
  transitioned: boolean;
  fulfillmentConflict: boolean;
};

export async function claimMonthlyPropertyLockPayment(
  propertyId: string,
  depositId: string,
) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_direct_property_lock_payment",
    {
      p_property_id: propertyId,
      p_deposit_id: depositId,
      p_hold_seconds: 1800,
    },
  );
  if (error) throw error;
  return data === true;
}

export async function releaseMonthlyPropertyLockPayment(depositId: string) {
  const { error } = await supabaseAdmin.rpc(
    "release_direct_property_lock_payment",
    { p_deposit_id: depositId },
  );
  if (error) throw error;
}

export async function notifyMonthlyPropertyLockConflict(depositId: string) {
  const { data: transaction, error: transactionError } = await supabaseAdmin
    .from("transactions")
    .select("id, user_id, property_id")
    .eq("deposit_id", depositId)
    .maybeSingle();
  if (transactionError) throw transactionError;
  if (!transaction?.user_id || !transaction.property_id) return;

  const [propertyResult, foundersResult] = await Promise.all([
    supabaseAdmin
      .from("properties")
      .select("quartier, address")
      .eq("id", transaction.property_id)
      .maybeSingle(),
    supabaseAdmin.from("users").select("id").eq("user_type", "founder"),
  ]);
  if (propertyResult.error) throw propertyResult.error;
  if (foundersResult.error) throw foundersResult.error;
  const property = propertyResult.data;
  const founders = foundersResult.data;
  const propertyLabel =
    unescapeText(property?.quartier || property?.address) || "ce bien";
  const recipients = [
    {
      userId: transaction.user_id,
      role: "customer",
      copyKey: "payments.propertyPaymentNeedsSupport" as const,
      type: "property_lock_conflict",
    },
    ...(founders ?? [])
      .filter((founder) => founder.id !== transaction.user_id)
      .map((founder) => ({
        userId: founder.id,
        role: "staff",
        copyKey: "payments.propertyPaymentConflictStaff" as const,
        type: "property_lock_conflict_staff",
      })),
  ];

  await Promise.all(
    recipients.map(async (recipient) => {
      const metadata = {
        propertyId: transaction.property_id,
        recipientRole: recipient.role,
      };
      const claimed = await claimRetryableNotificationDelivery({
        userId: recipient.userId,
        notificationType: "payments",
        eventType: "payments.property_lock_conflict",
        subjectId: depositId,
        metadata,
      });
      if (claimed === null) throw new Error("Conflict delivery claim failed");
      if (!claimed) return;

      const persist = (
        deliveryStatus: "sent" | "failed" | "uncertain",
        outcome: Record<string, unknown>,
      ) =>
        persistNotificationDeliveryOutcome({
          eventType: "payments.property_lock_conflict",
          subjectId: depositId,
          userId: recipient.userId,
          attemptId: claimed,
          metadata: { ...metadata, ...outcome },
          deliveryStatus,
        });

      const lookup = await getUserPushNotificationContext(
        recipient.userId,
        "payments",
      ).catch(() => ({ status: "retry" as const }));
      if (lookup.status === "retry") {
        await persist("failed", { channel: "none", reason: "push_context" });
        return;
      }
      const { enabled, tokens, locale } = lookup.context;
      if (!enabled || !tokens.length) {
        await persist("sent", {
          channel: "none",
          pushSent: false,
          reason: enabled ? "missing_token" : "push_disabled",
        });
        return;
      }
      const copy = renderNotificationCopy(recipient.copyKey, locale, {
        propertyLabel,
      });
      const begun = await beginRetryableNotificationSend(
        recipient.userId,
        "payments.property_lock_conflict",
        depositId,
        claimed,
      );
      if (begun === null) throw new Error("Conflict send claim failed");
      if (!begun) return;
      // Once sending starts, exceptions and lost acknowledgements are uncertain,
      // never evidence that a second push is safe.
      const result = await sendExpoPushNotificationsWithResult({
        to: tokens,
        title: copy.title,
        body: copy.body,
        sound: "default",
        data: {
          type: recipient.type,
          depositId,
          propertyId: transaction.property_id,
          customerId: transaction.user_id,
        },
      }).catch(() => ({
        accepted: false,
        outcome: "unknown" as const,
        invalidTokens: [],
      }));
      await persist(
        result.outcome === "accepted"
          ? "sent"
          : result.outcome === "rejected"
            ? "failed"
            : "uncertain",
        {
          channel: "push",
          pushSent: result.accepted,
          outcome: result.outcome,
        },
      );
      await removeUserPushTokens(result.invalidTokens).catch(() => {});
    }),
  );
}

export async function isMonthlyProperty(propertyId: string | null | undefined) {
  if (!propertyId) return false;
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("period")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.period !== "day");
}

export async function finalizeMonthlyPropertyLock(
  depositId: string,
  pawapay: unknown,
): Promise<PropertyLockCompletion> {
  const { data, error } = await supabaseAdmin
    .rpc("finalize_direct_property_lock", {
      p_deposit_id: depositId,
      p_pawapay: pawapay,
    })
    .maybeSingle();
  if (error) throw error;

  const completion = data as {
    payment_status?: unknown;
    failure_code?: unknown;
    transitioned?: unknown;
    fulfillment_conflict?: unknown;
  } | null;
  const result = {
    paymentStatus:
      typeof completion?.payment_status === "string"
        ? completion.payment_status
        : null,
    failureCode:
      typeof completion?.failure_code === "string"
        ? completion.failure_code
        : null,
    transitioned: completion?.transitioned === true,
    fulfillmentConflict: completion?.fulfillment_conflict === true,
  };
  if (result.fulfillmentConflict) {
    await notifyMonthlyPropertyLockConflict(depositId).catch((error) => {
      console.error("Failed to notify property-lock conflict:", error);
    });
  }
  return result;
}
