import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { isVerifiableUserType } from "@/lib/identity-verifications";
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
    if (!isVerifiableUserType(user.user_type)) {
      return errorResponse("Only owners and agents can verify identity", 403, req);
    }
    if (user.identity_verification_status === "approved") {
      return errorResponse("Identity is already verified", 409, req);
    }

    const body = (await req.json()) as {
      frontStoragePath?: unknown;
      backStoragePath?: unknown;
    };
    const frontStoragePath =
      typeof body.frontStoragePath === "string" ? body.frontStoragePath : "";
    const backStoragePath =
      typeof body.backStoragePath === "string" ? body.backStoragePath : "";

    if (
      !frontStoragePath.startsWith(`${user.id}/`) ||
      !frontStoragePath.endsWith("/front.jpg") ||
      !backStoragePath.startsWith(`${user.id}/`) ||
      !backStoragePath.endsWith("/back.jpg")
    ) {
      return errorResponse("Invalid document upload paths", 400, req);
    }

    await supabaseAdmin
      .from("identity_verification_submissions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        rejection_reason: "Remplacé par une nouvelle soumission.",
      })
      .eq("user_id", user.id)
      .eq("status", "pending");

    const { data: submission, error: insertError } = await supabaseAdmin
      .from("identity_verification_submissions")
      .insert({
        user_id: user.id,
        front_storage_path: frontStoragePath,
        back_storage_path: backStoragePath,
        status: "pending",
      })
      .select("id, status, submitted_at")
      .single();

    if (insertError || !submission) {
      console.error("Identity verification insert failed:", insertError);
      return errorResponse("Failed to submit verification", 500, req);
    }

    const { error: userError } = await supabaseAdmin
      .from("users")
      .update({
        identity_verification_status: "pending",
        identity_verified_at: null,
        identity_verified_by: null,
        identity_verification_rejection_reason: null,
      })
      .eq("id", user.id);

    if (userError) {
      console.error("Identity verification user update failed:", userError);
      return errorResponse("Failed to update verification status", 500, req);
    }

    return cors(
      NextResponse.json({
        success: true,
        submission,
      }),
      req,
    );
  } catch (error) {
    console.error("POST /api/identity-verifications/submit:", error);
    return errorResponse("Failed to submit verification", 500, req);
  }
}
