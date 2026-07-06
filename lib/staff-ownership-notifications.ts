import { reserveNotificationDelivery } from "@/lib/notification-deliveries";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Notifies staff/founders that a seller submitted property ownership documents.
// Cloned from staff-identity-verification-notifications.ts.
const OWNERSHIP_REVIEW_EVENT_TYPE = "property_ownership_submitted";

type OwnershipSubmissionRow = {
  id: string;
  property_id: string;
  user_id: string;
  status: string | null;
  users:
    | { full_name: string | null; email: string | null }
    | { full_name: string | null; email: string | null }[]
    | null;
};

function firstUser(row: OwnershipSubmissionRow["users"]) {
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

export async function notifyStaffOwnershipSubmitted(submissionId: string) {
  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("property_ownership_submissions")
    .select("id, property_id, user_id, status, users:user_id(full_name, email)")
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionError || !submission) {
    console.error(
      "Unable to load ownership submission for staff notification:",
      submissionError,
    );
    return { attempted: 0, sent: 0 };
  }

  const ownershipSubmission = submission as OwnershipSubmissionRow;
  if (ownershipSubmission.status !== "pending") {
    return { attempted: 0, sent: 0 };
  }

  const { data: staffUsers, error: staffError } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("user_type", ["staff", "founder"]);

  if (staffError || !staffUsers) {
    console.error(
      "Unable to load staff users for ownership notification:",
      staffError,
    );
    return { attempted: 0, sent: 0 };
  }

  const submittingUser = firstUser(ownershipSubmission.users);
  const userLabel =
    submittingUser?.full_name || submittingUser?.email || "Un utilisateur Roogo";

  let attempted = 0;
  let sent = 0;

  for (const staffUser of staffUsers as { id: string }[]) {
    const reserved = await reserveNotificationDelivery({
      userId: staffUser.id,
      notificationType: "propertyReviews",
      eventType: OWNERSHIP_REVIEW_EVENT_TYPE,
      subjectId: ownershipSubmission.id,
      metadata: {
        submissionId: ownershipSubmission.id,
        propertyId: ownershipSubmission.property_id,
      },
    });

    if (!reserved) continue;
    attempted += 1;

    const didSend = await notifyUserWithTemplate(
      staffUser.id,
      "propertyReviews",
      "ownershipVerification.reviewRequested",
      { userLabel },
      {
        type: OWNERSHIP_REVIEW_EVENT_TYPE,
        submissionId: ownershipSubmission.id,
        propertyId: ownershipSubmission.property_id,
      },
    );

    if (didSend) sent += 1;
  }

  return { attempted, sent };
}
