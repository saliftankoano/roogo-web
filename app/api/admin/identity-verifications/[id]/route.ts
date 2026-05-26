import { NextResponse } from "next/server";
import {
  IDENTITY_DOCUMENTS_BUCKET,
  IDENTITY_SIGNED_URL_TTL_SECONDS,
  requireStaffSupabaseUser,
} from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing verification id" }, { status: 400 });
    }

    const { data: submission, error } = await supabaseAdmin
      .from("identity_verification_submissions")
      .select(
        `
        id,
        user_id,
        front_storage_path,
        back_storage_path,
        status,
        submitted_at,
        reviewed_at,
        reviewed_by,
        rejection_reason,
        review_notes,
        users:user_id (
          id,
          full_name,
          email,
          phone,
          avatar_url,
          user_type,
          identity_verification_status
        ),
        reviewer:reviewed_by (
          id,
          full_name,
          email
        )
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Admin identity verification detail failed:", error);
      return NextResponse.json({ error: "Failed to load verification" }, { status: 500 });
    }
    if (!submission) {
      return NextResponse.json({ error: "Verification not found" }, { status: 404 });
    }

    const [frontSigned, backSigned] = await Promise.all([
      supabaseAdmin.storage
        .from(IDENTITY_DOCUMENTS_BUCKET)
        .createSignedUrl(
          submission.front_storage_path,
          IDENTITY_SIGNED_URL_TTL_SECONDS,
        ),
      supabaseAdmin.storage
        .from(IDENTITY_DOCUMENTS_BUCKET)
        .createSignedUrl(
          submission.back_storage_path,
          IDENTITY_SIGNED_URL_TTL_SECONDS,
        ),
    ]);

    return NextResponse.json({
      success: true,
      submission: {
        ...submission,
        documents: {
          frontUrl: frontSigned.data?.signedUrl ?? null,
          backUrl: backSigned.data?.signedUrl ?? null,
        },
      },
    });
  } catch (error) {
    console.error("GET /api/admin/identity-verifications/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
