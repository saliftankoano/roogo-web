import { NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  mapReviewStatusToVisibleStatus,
  talentAdminLeadReviewSchema,
} from "@/lib/talent";

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
    const rawBody = await req.json();
    const validation = talentAdminLeadReviewSchema.safeParse({
      ...rawBody,
      candidateVisibleStatus:
        rawBody.candidateVisibleStatus ||
        mapReviewStatusToVisibleStatus(rawBody.reviewStatus),
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 },
      );
    }

    const { data: existing, error: loadError } = await supabaseAdmin
      .from("talent_lead_submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existing) {
      return NextResponse.json({ success: false, error: "Contact introuvable" }, { status: 404 });
    }

    const body = validation.data;
    const updates = {
      review_status: body.reviewStatus,
      candidate_visible_status: body.candidateVisibleStatus,
      reviewer_notes: body.reviewerNotes ?? null,
      partial_credit: body.partialCredit ?? body.reviewStatus === "duplicate",
      credited:
        body.credited ??
        ["valid_new", "converted"].includes(body.reviewStatus),
      matched_owner_id: body.matchedOwnerId ?? existing.matched_owner_id,
      matched_property_id: body.matchedPropertyId ?? existing.matched_property_id,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    };

    const { data: lead, error: updateError } = await supabaseAdmin
      .from("talent_lead_submissions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabaseAdmin.from("talent_review_events").insert({
      application_id: lead.application_id,
      lead_submission_id: id,
      actor_user_id: reviewer.id,
      event_type: "lead_reviewed",
      previous_value: {
        review_status: existing.review_status,
        candidate_visible_status: existing.candidate_visible_status,
        reviewer_notes: existing.reviewer_notes,
        partial_credit: existing.partial_credit,
        credited: existing.credited,
      },
      new_value: updates,
    });

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    console.error("PATCH /api/admin/talent/leads/[id]:", error);
    return NextResponse.json(
      { success: false, error: "Impossible de mettre à jour le contact." },
      { status: 500 },
    );
  }
}
