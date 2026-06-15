import { reserveNotificationDelivery } from "@/lib/notification-deliveries";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

const IDENTITY_REVIEW_EVENT_TYPE = "identity_verification_submitted";

type VerificationSubmissionRow = {
  id: string;
  user_id: string;
  status: string | null;
  users:
    | {
        full_name: string | null;
        email: string | null;
        user_type: string | null;
      }
    | {
        full_name: string | null;
        email: string | null;
        user_type: string | null;
      }[]
    | null;
};

function firstUser(row: VerificationSubmissionRow["users"]) {
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

export async function notifyStaffIdentityVerificationSubmitted(
  submissionId: string,
) {
  const { data: submission, error: submissionError } = await supabaseAdmin
    .from("identity_verification_submissions")
    .select("id, user_id, status, users:user_id(full_name, email, user_type)")
    .eq("id", submissionId)
    .maybeSingle();

  if (submissionError || !submission) {
    console.error(
      "Unable to load identity verification submission for staff notification:",
      submissionError,
    );
    return { attempted: 0, sent: 0 };
  }

  const verificationSubmission = submission as VerificationSubmissionRow;
  if (verificationSubmission.status !== "pending") {
    return { attempted: 0, sent: 0 };
  }

  const { data: staffUsers, error: staffError } = await supabaseAdmin
    .from("users")
    .select("id")
    .in("user_type", ["staff", "founder"]);

  if (staffError || !staffUsers) {
    console.error(
      "Unable to load staff users for identity verification notification:",
      staffError,
    );
    return { attempted: 0, sent: 0 };
  }

  const submittingUser = firstUser(verificationSubmission.users);
  const userLabel =
    submittingUser?.full_name ||
    submittingUser?.email ||
    "Un utilisateur Roogo";

  let attempted = 0;
  let sent = 0;

  for (const staffUser of staffUsers as { id: string }[]) {
    const reserved = await reserveNotificationDelivery({
      userId: staffUser.id,
      notificationType: "propertyReviews",
      eventType: IDENTITY_REVIEW_EVENT_TYPE,
      subjectId: verificationSubmission.id,
      metadata: {
        submissionId: verificationSubmission.id,
        userId: verificationSubmission.user_id,
      },
    });

    if (!reserved) continue;
    attempted += 1;

    const didSend = await notifyUserWithTemplate(
      staffUser.id,
      "propertyReviews",
      "identityVerification.urgentReviewRequested",
      { userLabel },
      {
        type: IDENTITY_REVIEW_EVENT_TYPE,
        submissionId: verificationSubmission.id,
        userId: verificationSubmission.user_id,
      },
    );

    if (didSend) sent += 1;
  }

  return { attempted, sent };
}
