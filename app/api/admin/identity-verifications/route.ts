import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    let query = supabaseAdmin
      .from("identity_verification_submissions")
      .select(
        `
        id,
        user_id,
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
      .order("submitted_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Admin identity verification list failed:", error);
      return NextResponse.json({ error: "Failed to load verifications" }, { status: 500 });
    }

    return NextResponse.json({ success: true, submissions: data ?? [] });
  } catch (error) {
    console.error("GET /api/admin/identity-verifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
