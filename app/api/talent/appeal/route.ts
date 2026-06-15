import { NextResponse } from "next/server";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { talentAppealSchema } from "@/lib/talent";

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

    const validation = talentAppealSchema.safeParse(await req.json());
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("talent_candidate_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Profil Talent introuvable." },
        { status: 404 },
      );
    }

    const { data: application, error: appLoadError } = await supabaseAdmin
      .from("talent_applications")
      .select("id, appeal_note")
      .eq("candidate_profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appLoadError) throw appLoadError;
    if (!application) {
      return NextResponse.json(
        { success: false, error: "Candidature Talent introuvable." },
        { status: 404 },
      );
    }
    if (application.appeal_note) {
      return NextResponse.json(
        { success: false, error: "Une explication a déjà été envoyée." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("talent_applications")
      .update({
        appeal_note: validation.data.note,
        appeal_submitted_at: now,
        updated_at: now,
      })
      .eq("id", application.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await supabaseAdmin.from("talent_review_events").insert({
      application_id: application.id,
      actor_user_id: user.id,
      event_type: "appeal_submitted",
      new_value: { appeal_note: validation.data.note },
    });

    return NextResponse.json({ success: true, application: updated });
  } catch (error) {
    console.error("POST /api/talent/appeal:", error);
    return NextResponse.json(
      { success: false, error: "Impossible d'envoyer l'explication." },
      { status: 500 },
    );
  }
}
