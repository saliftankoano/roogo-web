import { NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  try {
    const reviewer = await getStaffOrFounder(req);
    if (!reviewer) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { data: applications, error: appError } = await supabaseAdmin
      .from("talent_applications")
      .select(`
        *,
        talent_candidate_profiles(*),
        talent_jobs(title, slug, company_name),
        talent_challenges(title, target_leads, deadline_hours)
      `)
      .order("created_at", { ascending: false });

    if (appError) throw appError;

    const applicationIds = (applications ?? []).map((application) => application.id);
    const { data: leads, error: leadsError } = applicationIds.length
      ? await supabaseAdmin
          .from("talent_lead_submissions")
          .select(`
            *,
            matched_owner:users!talent_lead_submissions_matched_owner_id_fkey(id, full_name, phone, whatsapp),
            matched_property:properties!talent_lead_submissions_matched_property_id_fkey(id, status, quartier, city)
          `)
          .in("application_id", applicationIds)
          .order("submitted_at", { ascending: false })
      : { data: [], error: null };

    if (leadsError) throw leadsError;

    const leadsByApplication = new Map<string, typeof leads>();
    for (const lead of leads ?? []) {
      const current = leadsByApplication.get(lead.application_id) ?? [];
      current.push(lead);
      leadsByApplication.set(lead.application_id, current);
    }

    const enriched = (applications ?? []).map((application) => {
      const applicationLeads = leadsByApplication.get(application.id) ?? [];
      const validLeadCount = applicationLeads.filter((lead) =>
        ["valid_new", "converted"].includes(lead.review_status),
      ).length;
      const duplicateLeadCount = applicationLeads.filter(
        (lead) => lead.review_status === "duplicate",
      ).length;
      const invalidLeadCount = applicationLeads.filter(
        (lead) => lead.review_status === "invalid",
      ).length;
      const deadlineAt = application.challenge_deadline_at
        ? new Date(application.challenge_deadline_at).getTime()
        : null;
      const submittedAt = application.submitted_at
        ? new Date(application.submitted_at).getTime()
        : null;

      return {
        ...application,
        leads: applicationLeads,
        metrics: {
          challengeSubmitted: Boolean(application.submitted_at),
          completionRate:
            application.talent_challenges?.target_leads > 0
              ? Math.min(
                  1,
                  applicationLeads.length / application.talent_challenges.target_leads,
                )
              : applicationLeads.length > 0 ? 1 : 0,
          deadlineMet:
            deadlineAt && submittedAt ? submittedAt <= deadlineAt : false,
          validLeadCount,
          duplicateLeadCount,
          invalidLeadCount,
          totalLeadCount: applicationLeads.length,
          reviewerScore: application.reviewer_score,
        },
      };
    });

    return NextResponse.json({ success: true, applications: enriched });
  } catch (error) {
    console.error("GET /api/admin/talent:", error);
    return NextResponse.json(
      { success: false, error: "Impossible de charger Talent." },
      { status: 500 },
    );
  }
}
