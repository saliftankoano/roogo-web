import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaffSupabaseUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const decision =
    body.decision === "approve" || body.decision === "reject"
      ? body.decision
      : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!decision)
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  if (decision === "reject" && reason.length < 3) {
    return NextResponse.json(
      { error: "A rejection reason is required" },
      { status: 400 },
    );
  }

  const { data: submission, error } = await supabaseAdmin
    .from("hotel_business_verification_submissions")
    .select("id, hotel_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Failed to load verification" },
      { status: 500 },
    );
  if (!submission)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (submission.status !== "pending") {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  }

  const status = decision === "approve" ? "approved" : "rejected";
  const { data: reviewed, error: updateError } = await supabaseAdmin.rpc(
    "review_hotel_business_verification",
    {
      p_submission_id: id,
      p_reviewer_id: auth.supabaseUser.id,
      p_decision: decision,
      p_reason: reason,
      p_notes: notes,
    },
  );
  if (updateError) {
    return NextResponse.json(
      { error: "Failed to save review" },
      { status: 500 },
    );
  }
  if (!reviewed?.[0]) {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  }
  return NextResponse.json({ success: true, status });
}
