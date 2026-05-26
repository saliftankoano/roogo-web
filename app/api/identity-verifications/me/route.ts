import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { isVerifiableUserType } from "@/lib/identity-verifications";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!isVerifiableUserType(user.user_type)) {
      return errorResponse("Only owners and agents can verify identity", 403, req);
    }

    const { data: latestSubmission } = await supabaseAdmin
      .from("identity_verification_submissions")
      .select("id, status, submitted_at, reviewed_at, rejection_reason")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return cors(
      NextResponse.json({
        success: true,
        verification: {
          status: user.identity_verification_status ?? "unsubmitted",
          verifiedAt: user.identity_verified_at ?? null,
          rejectionReason: user.identity_verification_rejection_reason ?? null,
          latestSubmission: latestSubmission
            ? {
                id: latestSubmission.id,
                status: latestSubmission.status,
                submittedAt: latestSubmission.submitted_at,
                reviewedAt: latestSubmission.reviewed_at,
                rejectionReason: latestSubmission.rejection_reason,
              }
            : null,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("GET /api/identity-verifications/me:", error);
    return errorResponse("Failed to load verification status", 500, req);
  }
}
