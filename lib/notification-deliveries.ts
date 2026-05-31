import { supabaseAdmin } from "@/lib/supabase-admin";
import type { NotificationType } from "@/lib/push-notifications";

export type NotificationDeliveryReservation = {
  userId: string;
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
