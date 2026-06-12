import { NextResponse } from "next/server";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { talentLeadSchema } from "@/lib/talent";

async function getActiveApplicationForUser(userId: string) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("talent_candidate_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  const { data: application, error: appError } = await supabaseAdmin
    .from("talent_applications")
    .select("id, status, challenge_deadline_at, submitted_at")
    .eq("candidate_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (appError) throw appError;
  return application;
}

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

    const application = await getActiveApplicationForUser(user.id);
    if (!application) {
      return NextResponse.json(
        { success: false, error: "Complétez votre profil avant de soumettre un contact." },
        { status: 409 },
      );
    }

    const deadline = application.challenge_deadline_at
      ? new Date(application.challenge_deadline_at)
      : null;
    if (deadline && Date.now() > deadline.getTime()) {
      return NextResponse.json(
        { success: false, error: "Le délai du challenge est dépassé." },
        { status: 409 },
      );
    }

    const body = await req.json();
    const validation = talentLeadSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 },
      );
    }

    const data = validation.data;
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("talent_lead_submissions")
      .insert({
        application_id: application.id,
        owner_name: data.ownerName,
        owner_phone: data.ownerPhone,
        owner_address: data.ownerAddress,
        notes: data.notes,
        matched_owner_id: data.matchedOwnerId || null,
        matched_property_id: data.matchedPropertyId || null,
        candidate_visible_status: "received",
        review_status: "unreviewed",
      })
      .select()
      .single();

    if (leadError) throw leadError;

    const now = new Date().toISOString();
    if (!["submitted", "under_review", "shortlisted", "rejected", "hired"].includes(application.status)) {
      const { error: appUpdateError } = await supabaseAdmin
        .from("talent_applications")
        .update({
          status: "submitted",
          submitted_at: now,
          updated_at: now,
        })
        .eq("id", application.id);

      if (appUpdateError) throw appUpdateError;
    }

    await supabaseAdmin.from("talent_review_events").insert({
      application_id: application.id,
      lead_submission_id: lead.id,
      actor_user_id: user.id,
      event_type: "lead_submitted",
      new_value: {
        owner_name: lead.owner_name,
        candidate_visible_status: lead.candidate_visible_status,
      },
    });

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    console.error("POST /api/talent/leads:", error);
    return NextResponse.json(
      { success: false, error: "Impossible de soumettre ce contact." },
      { status: 500 },
    );
  }
}
