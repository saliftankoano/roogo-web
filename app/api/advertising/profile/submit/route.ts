import { after, NextResponse } from "next/server";
import { cors, corsOptions, errorResponse, safeError } from "@/lib/api-helpers";
import {
  canAccessAdvertisingOnboarding,
  getMissingAdvertiserProfileFields,
  mapAdvertiserProfile,
} from "@/lib/advertising";
import { captureServerEvent } from "@/lib/posthog-server";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!canAccessAdvertisingOnboarding(user.user_type)) {
      return errorResponse("Advertising onboarding is not enabled", 403, req);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("advertiser_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return errorResponse("Advertiser profile not found", 404, req);
    if (profile.status === "approved") {
      return cors(
        NextResponse.json({
          success: true,
          profile: mapAdvertiserProfile(profile),
        }),
        req,
      );
    }
    if (profile.status === "pending") {
      return errorResponse("This profile is already under review", 409, req);
    }
    if (profile.status === "suspended") {
      return errorResponse("This advertising profile is suspended", 403, req);
    }

    const missingFields = getMissingAdvertiserProfileFields(profile);
    if (missingFields.length > 0) {
      return cors(
        NextResponse.json(
          { error: "Advertiser profile is incomplete", missingFields },
          { status: 400 },
        ),
        req,
      );
    }

    const { data: proof, error: proofError } = await supabaseAdmin
      .from("advertiser_profile_proofs")
      .select("id, status")
      .eq("advertiser_profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (proofError) throw proofError;
    if (!proof || proof.status === "rejected") {
      return errorResponse("Business proof is required", 400, req);
    }

    const submittedAt = new Date().toISOString();
    const { data: submitted, error } = await supabaseAdmin
      .from("advertiser_profiles")
      .update({
        status: "pending",
        submitted_at: submittedAt,
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
        review_notes: null,
      })
      .eq("id", profile.id)
      .in("status", ["draft", "changes_requested", "rejected"])
      .select("*")
      .single();
    if (error) throw error;

    after(async () => {
      try {
        await captureServerEvent(user.id, "advertiser_profile_submitted", {
          advertiser_profile_id: submitted.id,
          proof_id: proof.id,
        });
      } catch (analyticsError) {
        console.error(
          "Advertiser profile submission analytics failed:",
          analyticsError,
        );
      }
    });

    return cors(
      NextResponse.json({
        success: true,
        profile: mapAdvertiserProfile(submitted),
      }),
      req,
    );
  } catch (error) {
    console.error("POST /api/advertising/profile/submit:", error);
    return errorResponse(
      safeError(error, "Failed to submit advertiser profile"),
      500,
      req,
    );
  }
}
