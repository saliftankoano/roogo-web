import { reserveNotificationDelivery } from "@/lib/notification-deliveries";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PROPERTY_REVIEW_EVENT_TYPE = "property_submitted_for_review";

type ReviewPropertyRow = {
  id: string;
  status: string | null;
  is_test: boolean | null;
  quartier: string | null;
  city: string | null;
  address: string | null;
  agent_id: string | null;
};

export async function notifyStaffPropertySubmittedForReview(
  propertyId: string,
) {
  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id, status, is_test, quartier, city, address, agent_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError || !property) {
    console.error("Unable to load property for staff review notification:", propertyError);
    return { attempted: 0, sent: 0 };
  }

  const reviewProperty = property as ReviewPropertyRow;
  if (reviewProperty.status !== "en_attente" || reviewProperty.is_test) {
    return { attempted: 0, sent: 0 };
  }

  const { data: staffUsers, error: staffError } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("user_type", ["staff", "founder"]);

  if (staffError || !staffUsers) {
    console.error("Unable to load staff users for review notification:", staffError);
    return { attempted: 0, sent: 0 };
  }

  let attempted = 0;
  let sent = 0;
  const propertyLabel =
    reviewProperty.quartier ||
    reviewProperty.city ||
    reviewProperty.address ||
    "Roogo";

  for (const staffUser of staffUsers as { id: string }[]) {
    const reserved = await reserveNotificationDelivery({
      userId: staffUser.id,
      notificationType: "propertyReviews",
      eventType: PROPERTY_REVIEW_EVENT_TYPE,
      subjectId: propertyId,
      metadata: { propertyId },
    });

    if (!reserved) continue;
    attempted += 1;

    const didSend = await notifyUserWithTemplate(
      staffUser.id,
      "propertyReviews",
      "properties.submittedForReview",
      { propertyLabel },
      {
        type: PROPERTY_REVIEW_EVENT_TYPE,
        propertyId,
      },
    );

    if (didSend) sent += 1;
  }

  return { attempted, sent };
}
