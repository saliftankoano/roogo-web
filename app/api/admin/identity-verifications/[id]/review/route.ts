import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing verification id" }, { status: 400 });
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
      .from("identity_verification_submissions")
      .select("id, user_id, status")
      .eq("id", id)
      .maybeSingle();

    if (loadError) {
      console.error("Identity verification review load failed:", loadError);
      return NextResponse.json({ error: "Failed to load verification" }, { status: 500 });
    }
    if (!submission) {
      return NextResponse.json({ error: "Verification not found" }, { status: 404 });
    }
    if (submission.status !== "pending") {
      return NextResponse.json(
        { error: "This verification has already been reviewed" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const nextStatus = decision === "approve" ? "approved" : "rejected";

    const { error: submissionError } = await supabaseAdmin
      .from("identity_verification_submissions")
      .update({
        status: nextStatus,
        reviewed_at: now,
        reviewed_by: authResult.supabaseUser.id,
        review_notes: notes || null,
        rejection_reason: decision === "reject" ? reason : null,
      })
      .eq("id", submission.id);

    if (submissionError) {
      console.error("Identity verification submission review failed:", submissionError);
      return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
    }

    const userUpdate =
      decision === "approve"
        ? {
            identity_verification_status: "approved",
            identity_verified_at: now,
            identity_verified_by: authResult.supabaseUser.id,
            identity_verification_rejection_reason: null,
          }
        : {
            identity_verification_status: "rejected",
            identity_verified_at: null,
            identity_verified_by: null,
            identity_verification_rejection_reason: reason,
          };

    const { error: userError } = await supabaseAdmin
      .from("users")
      .update(userUpdate)
      .eq("id", submission.user_id);

    if (userError) {
      console.error("Identity verification user review failed:", userError);
      return NextResponse.json({ error: "Failed to update user status" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
    });
  } catch (error) {
    console.error("POST /api/admin/identity-verifications/[id]/review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
