import { reserveNotificationDelivery } from "@/lib/notification-deliveries";
import { formatXofAmount } from "@/lib/notification-copy";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

const OWNER_RENT_RECEIVED_EVENT_TYPE = "payments.ownerRentReceived";

type PaidRentSchedule = {
  id: string;
  owner_id: string;
  property_id: string;
  agreement_id: string;
  transaction_id: string | null;
  amount: number;
  properties:
    | {
        quartier: string | null;
        address: string | null;
      }
    | {
        quartier: string | null;
        address: string | null;
      }[]
    | null;
};

export async function notifyOwnerRentReceivedForSchedule(scheduleId: string) {
  const { data: schedule, error } = await supabaseAdmin
    .from("rent_schedules")
    .select(
      "id, owner_id, property_id, agreement_id, transaction_id, amount, properties(quartier, address)",
    )
    .eq("id", scheduleId)
    .maybeSingle();

  if (error || !schedule) {
    console.error("Unable to load rent schedule for owner notification:", error);
    return false;
  }

  const paidSchedule = schedule as PaidRentSchedule;
  const property = Array.isArray(paidSchedule.properties)
    ? paidSchedule.properties[0]
    : paidSchedule.properties;
  const propertyLabel = property?.quartier || property?.address || "votre bien";
  const subjectId = paidSchedule.transaction_id || paidSchedule.id;

  const reserved = await reserveNotificationDelivery({
    userId: paidSchedule.owner_id,
    notificationType: "payments",
    eventType: OWNER_RENT_RECEIVED_EVENT_TYPE,
    subjectId,
    metadata: {
      scheduleId: paidSchedule.id,
      transactionId: paidSchedule.transaction_id,
      propertyId: paidSchedule.property_id,
      agreementId: paidSchedule.agreement_id,
    },
  });

  if (!reserved) return false;

  return notifyUserWithTemplate(
    paidSchedule.owner_id,
    "payments",
    "payments.ownerRentReceived",
    {
      amount: formatXofAmount(paidSchedule.amount, "fr"),
      propertyLabel,
    },
    {
      type: "owner_rent_received",
      transactionId: paidSchedule.transaction_id,
      scheduleId: paidSchedule.id,
      propertyId: paidSchedule.property_id,
      agreementId: paidSchedule.agreement_id,
    },
  );
}
