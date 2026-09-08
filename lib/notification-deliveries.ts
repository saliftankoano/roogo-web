import { supabaseAdmin } from "@/lib/supabase-admin";
import type { NotificationType } from "@/lib/push-notifications";

export type NotificationDeliveryReservation = {
  userId?: string | null;
  notificationType: NotificationType;
  eventType: string;
  subjectId: string;
  metadata?: Record<string, unknown>;
};

export async function reserveNotificationDelivery({
  userId,
  notificationType,
  eventType,
  subjectId,
  metadata,
}: NotificationDeliveryReservation) {
  const { error } = await supabaseAdmin.from("notification_deliveries").insert({
    user_id: userId,
    notification_type: notificationType,
    event_type: eventType,
    subject_id: subjectId,
    metadata: metadata ?? {},
  });

  if (!error) return true;

  if (error.code === "23505") return false;

  if (error.code === "42P01") {
    console.warn(
      "notification_deliveries table is missing; sending without delivery reservation",
    );
    return true;
  }

  console.error("Failed to reserve notification delivery:", error);
  return false;
}

export async function claimPaymentFailureDelivery({
  userId,
  notificationType,
  eventType,
  subjectId,
  metadata,
}: NotificationDeliveryReservation) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_payment_failure_delivery",
    {
      p_user_id: userId ?? null,
      p_notification_type: notificationType,
      p_event_type: eventType,
      p_subject_id: subjectId,
      p_metadata: metadata ?? {},
      p_lease_seconds: 300,
    },
  );

  if (!error) return data === true;

  console.error("Failed to claim payment-failure delivery:", error);
  return null;
}

export async function claimRetryableNotificationDelivery({
  userId,
  notificationType,
  eventType,
  subjectId,
  metadata,
}: NotificationDeliveryReservation) {
  if (!userId) return null;
  const { data, error } = await supabaseAdmin.rpc(
    "claim_retryable_notification_delivery",
    {
      p_user_id: userId,
      p_notification_type: notificationType,
      p_event_type: eventType,
      p_subject_id: subjectId,
      p_metadata: metadata ?? {},
      p_lease_seconds: 300,
    },
  );

  if (!error) return data === true;

  console.error("Failed to claim retryable notification delivery:", error);
  return null;
}

export async function updateNotificationDeliveryMetadata({
  eventType,
  subjectId,
  userId,
  metadata,
  deliveryStatus,
  releaseSmsClaim = false,
}: {
  eventType: string;
  subjectId: string;
  userId?: string | null;
  metadata: Record<string, unknown>;
  deliveryStatus?: "sent" | "failed";
  releaseSmsClaim?: boolean;
}) {
  const patch: Record<string, unknown> = { metadata };
  if (deliveryStatus) {
    patch.delivery_status = deliveryStatus;
    patch.lease_expires_at =
      deliveryStatus === "failed"
        ? new Date(Date.now() + 2_000).toISOString()
        : null;
    if (deliveryStatus === "sent") patch.sent_at = new Date().toISOString();
  }
  if (releaseSmsClaim) {
    patch.sms_cooldown_key = null;
    patch.sms_claimed_at = null;
  }

  let query = supabaseAdmin
    .from("notification_deliveries")
    .update(patch)
    .eq("event_type", eventType)
    .eq("subject_id", subjectId);
  if (userId !== undefined) {
    query = userId ? query.eq("user_id", userId) : query.is("user_id", null);
  }
  const { error } = await query;

  if (error && error.code !== "42P01") {
    console.error("Failed to update notification delivery:", error);
  }
}

export async function claimPaymentFailureSmsCooldown({
  subjectId,
  phoneHash,
  failureCode,
  since,
}: {
  subjectId: string;
  phoneHash: string;
  failureCode: string;
  since: Date;
}) {
  const cooldownKey = `${phoneHash}:${failureCode}`;
  const { data, error } = await supabaseAdmin.rpc(
    "claim_payment_failure_sms_cooldown",
    {
      p_subject_id: subjectId,
      p_cooldown_key: cooldownKey,
      p_since: since.toISOString(),
    },
  );

  if (!error) return data === true;

  console.error("Failed to claim payment-failure SMS cooldown:", error);
  return null;
}

export async function countNotificationDeliveriesSince({
  userId,
  eventType,
  since,
}: {
  userId: string;
  eventType: string;
  since: Date;
}) {
  const { count, error } = await supabaseAdmin
    .from("notification_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", eventType)
    .gte("sent_at", since.toISOString());

  if (!error) return count ?? 0;

  if (error.code === "42P01") return 0;

  console.error("Failed to count notification deliveries:", error);
  return 0;
}
