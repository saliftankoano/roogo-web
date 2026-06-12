import { NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { talentAdminApplicationReviewSchema } from "@/lib/talent";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const reviewer = await getStaffOrFounder(req);
    if (!reviewer) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const validation = talentAdminApplicationReviewSchema.safeParse(await req.json());
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 },
      );
    }

    const { data: existing, error: loadError } = await supabaseAdmin
      .from("talent_applications")
      .select("id, status, reviewer_score, reviewer_notes")
      .eq("id", id)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existing) {
      return NextResponse.json({ success: false, error: "Candidature introuvable" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      reviewer_id: reviewer.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (validation.data.status) {
      updates.status = validation.data.status;
      if (validation.data.status === "shortlisted") updates.shortlisted_at = new Date().toISOString();
      if (validation.data.status === "rejected") updates.rejected_at = new Date().toISOString();
      if (validation.data.status === "hired") updates.hired_at = new Date().toISOString();
    }
    if ("reviewerScore" in validation.data) {
      updates.reviewer_score = validation.data.reviewerScore;
    }
    if ("reviewerNotes" in validation.data) {
      updates.reviewer_notes = validation.data.reviewerNotes;
    }

    const { data: application, error: updateError } = await supabaseAdmin
      .from("talent_applications")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabaseAdmin.from("talent_review_events").insert({
      application_id: id,
      actor_user_id: reviewer.id,
      event_type: "application_reviewed",
      previous_value: {
        status: existing.status,
        reviewer_score: existing.reviewer_score,
        reviewer_notes: existing.reviewer_notes,
      },
      new_value: updates,
    });

    return NextResponse.json({ success: true, application });
  } catch (error) {
    console.error("PATCH /api/admin/talent/applications/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Impossible de mettre à jour la candidature." },
      { status: 500 },
    );
  }
}
