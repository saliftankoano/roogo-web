import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveClerkId } from "@/lib/request-auth";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import {
  TALENT_DEFAULT_CHALLENGE_SLUG,
  TALENT_DEFAULT_JOB_SLUG,
} from "@/lib/talent";

type TalentLeadSummary = {
  id: string;
  owner_name: string;
  owner_phone: string;
  owner_address: string;
  notes: string;
  candidate_visible_status: string;
  review_status: string;
  partial_credit: boolean;
  credited: boolean;
  submitted_at: string;
  matched_owner_id: string | null;
  matched_property_id: string | null;
};

export async function GET(req: Request) {
  try {
    const clerkId = await resolveClerkId(req);
    if (!clerkId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrSyncUserByClerkId(clerkId);
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("talent_jobs")
      .select("id, slug, title, company_name, hiring_objective, employment_type, location, salary_range, description, success_metrics, is_active, talent_challenges(id, slug, title, instructions, deadline_hours, target_leads, is_paid)")
      .eq("slug", TALENT_DEFAULT_JOB_SLUG)
      .eq("talent_challenges.slug", TALENT_DEFAULT_CHALLENGE_SLUG)
      .maybeSingle();

    if (jobError) throw jobError;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("talent_candidate_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    let application = null;
    let leads: TalentLeadSummary[] = [];

    if (profile) {
      const { data: applicationData, error: appError } = await supabaseAdmin
        .from("talent_applications")
        .select("*")
        .eq("candidate_profile_id", profile.id)
        .eq("job_id", job?.id)
        .maybeSingle();

      if (appError) throw appError;
      application = applicationData;

      if (applicationData) {
        const { data: leadData, error: leadsError } = await supabaseAdmin
          .from("talent_lead_submissions")
          .select("id, owner_name, owner_phone, owner_address, notes, candidate_visible_status, review_status, partial_credit, credited, submitted_at, matched_owner_id, matched_property_id")
          .eq("application_id", applicationData.id)
          .order("submitted_at", { ascending: false });

        if (leadsError) throw leadsError;
        leads = leadData ?? [];
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        whatsapp: user.whatsapp,
      },
      job,
      profile,
      application,
      leads,
    });
  } catch (error) {
    console.error("GET /api/talent/me:", error);
    return NextResponse.json(
      { success: false, error: "Impossible de charger Talent." },
      { status: 500 },
    );
  }
}
