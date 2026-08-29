import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyUserWithTemplate } from "@/lib/push-notifications";

type OwnershipSubmissionForReview = {
  id: string;
  property_id: string;
  user_id: string;
  documents: unknown;
  status: string;
};

// Staff approve/reject ownership documents. Cloned from the identity review route,
// but the verification status lives on the PROPERTY (gating en_ligne) rather than
// on the user. requireStaffSupabaseUser covers both staff and founder.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing submission id" }, { status: 400 });
    }

    const body = (await req.json()) as {
      decision?: unknown;
      reason?: unknown;
      notes?: unknown;
    };
    const decision = typeof body.decision === "string" ? body.decision : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });
    }
    if (decision === "reject" && reason.length < 3) {
      return NextResponse.json(
        { error: "A rejection reason is required" },
        { status: 400 },
      );
    }

    const { data: submission, error: loadError } = await supabaseAdmin
      .from("property_ownership_submissions")
      .select("id, property_id, user_id, documents, status")
      .eq("id", id)
      .maybeSingle<OwnershipSubmissionForReview>();

    if (loadError) {
      console.error("Ownership review load failed:", loadError);
      return NextResponse.json({ error: "Failed to load submission" }, { status: 500 });
    }
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: "This submission has already been reviewed" },
        { status: 409 },
      );
    }
    if (
      decision === "approve" &&
      (!Array.isArray(submission.documents) || submission.documents.length === 0)
    ) {
      return NextResponse.json(
        { error: "Ajoutez au moins un document avant d'approuver le dossier." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const nextStatus = decision === "approve" ? "approved" : "rejected";

    const { error: submissionError } = await supabaseAdmin
      .from("property_ownership_submissions")
      .update({
        status: nextStatus,
        reviewed_at: now,
        reviewed_by: authResult.supabaseUser.id,
        review_notes: notes || null,
        rejection_reason: decision === "reject" ? reason : null,
      })
      .eq("id", submission.id);

    if (submissionError) {
      console.error("Ownership submission review failed:", submissionError);
      return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
    }

    const propertyUpdate =
      decision === "approve"
        ? {
            ownership_verification_status: "approved",
            ownership_verified_at: now,
            ownership_verified_by: authResult.supabaseUser.id,
            ownership_verification_rejection_reason: null,
          }
        : {
            ownership_verification_status: "rejected",
            ownership_verified_at: null,
            ownership_verified_by: null,
            ownership_verification_rejection_reason: reason,
          };

    const { error: propertyError } = await supabaseAdmin
      .from("properties")
      .update(propertyUpdate)
      .eq("id", submission.property_id);

    if (propertyError) {
      console.error("Ownership property review failed:", propertyError);
      return NextResponse.json({ error: "Failed to update property" }, { status: 500 });
    }

    // Tell the seller their documents were reviewed.
    notifyUserWithTemplate(
      submission.user_id,
      "payments",
      decision === "approve"
        ? "ownershipVerification.approved"
        : "ownershipVerification.rejected",
      undefined,
      { type: "ownership_reviewed", propertyId: submission.property_id },
    ).catch((error) => {
      console.error("Ownership seller notification failed:", error);
    });

    return NextResponse.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error("POST /api/admin/ownership-verifications/[id]/review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
