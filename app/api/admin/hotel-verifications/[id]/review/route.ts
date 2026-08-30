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
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!decision) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  if (decision === "reject" && reason.length < 3) {
    return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  }

  const { data: submission, error } = await supabaseAdmin
    .from("hotel_business_verification_submissions")
    .select("id, hotel_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load verification" }, { status: 500 });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (submission.status !== "pending") {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const status = decision === "approve" ? "approved" : "rejected";
  const { error: updateError, count } = await supabaseAdmin
    .from("hotel_business_verification_submissions")
    .update({
      status,
      reviewed_at: now,
      reviewed_by: auth.supabaseUser.id,
      review_notes: notes || null,
      rejection_reason: decision === "reject" ? reason : null,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (updateError) return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
  if (count === 0) {
    return NextResponse.json({ error: "Submission no longer pending" }, { status: 409 });
  }
  const { error: hotelError } = await supabaseAdmin
    .from("hotels")
    .update({
      business_verification_status: status,
      business_verified_at: decision === "approve" ? now : null,
      business_verified_by: decision === "approve" ? auth.supabaseUser.id : null,
      business_verification_rejection_reason: decision === "reject" ? reason : null,
    })
    .eq("id", submission.hotel_id);
  if (hotelError) return NextResponse.json({ error: "Failed to update hotel" }, { status: 500 });
  return NextResponse.json({ success: true, status });
}
