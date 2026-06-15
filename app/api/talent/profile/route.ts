import { NextResponse } from "next/server";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import {
  splitLanguages,
  TALENT_DEFAULT_CHALLENGE_SLUG,
  TALENT_DEFAULT_JOB_SLUG,
  talentProfileSchema,
} from "@/lib/talent";

export async function POST(req: Request) {
  try {
    const clerkId = await resolveClerkId(req);
    if (!clerkId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = await getOrSyncUserByClerkId(clerkId);
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const validation = talentProfileSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 },
      );
    }

    const data = validation.data;

    const { data: job, error: jobError } = await supabaseAdmin
      .from("talent_jobs")
      .select("id, talent_challenges(id, deadline_hours)")
      .eq("slug", TALENT_DEFAULT_JOB_SLUG)
      .eq("talent_challenges.slug", TALENT_DEFAULT_CHALLENGE_SLUG)
      .single();

    if (jobError) throw jobError;

    const challenge = Array.isArray(job.talent_challenges)
      ? job.talent_challenges[0]
      : job.talent_challenges;

    if (!challenge?.id) {
      return NextResponse.json(
        { success: false, error: "Challenge Talent introuvable." },
        { status: 500 },
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("talent_candidate_profiles")
      .upsert(
        {
          user_id: user.id,
          full_name: data.fullName,
          email: data.email,
          phone: data.phone,
          whatsapp: data.whatsapp || null,
          location: data.location,
          languages: splitLanguages(data.languages),
          resume_path: data.resumePath,
          resume_filename: data.resumeFilename,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (profileError) throw profileError;

    const now = new Date();
    const deadline = new Date(
      now.getTime() + Number(challenge.deadline_hours || 48) * 60 * 60 * 1000,
    );

    const { data: application, error: appError } = await supabaseAdmin
      .from("talent_applications")
      .upsert(
        {
          candidate_profile_id: profile.id,
          job_id: job.id,
          challenge_id: challenge.id,
          status: "challenge_assigned",
          challenge_assigned_at: now.toISOString(),
          challenge_deadline_at: deadline.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "candidate_profile_id,job_id" },
      )
      .select()
      .single();

    if (appError) throw appError;

    await supabaseAdmin.from("talent_review_events").insert({
      application_id: application.id,
      actor_user_id: user.id,
      event_type: "profile_completed",
      new_value: {
        status: application.status,
        challenge_deadline_at: application.challenge_deadline_at,
      },
    });

    return NextResponse.json({ success: true, profile, application });
  } catch (error) {
    console.error("POST /api/talent/profile:", error);
    return NextResponse.json(
      { success: false, error: "Impossible d'enregistrer le profil." },
      { status: 500 },
    );
  }
}
