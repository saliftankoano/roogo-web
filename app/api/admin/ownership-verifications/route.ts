import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Queue of property ownership submissions for the admin review panel.
// Cloned from the identity-verifications list route. requireStaffSupabaseUser
// covers staff + founder.
export async function GET(req: Request) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    let query = supabaseAdmin
      .from("property_ownership_submissions")
      .select(
        `
        id,
        property_id,
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
          user_type
        ),
        property:property_id (
          id,
          property_type,
          price,
          quartier,
          city,
          ownership_verification_status,
          status
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
      console.error("Admin ownership verification list failed:", error);
      return NextResponse.json(
        { error: "Failed to load submissions" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, submissions: data ?? [] });
  } catch (error) {
    console.error("GET /api/admin/ownership-verifications:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
