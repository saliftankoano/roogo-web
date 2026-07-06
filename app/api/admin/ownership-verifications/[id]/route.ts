import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import {
  type OwnershipDocument,
  withSignedOwnershipDocUrls,
} from "@/lib/property-ownership";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Detail for one ownership submission, with short-lived signed URLs so staff can
// preview the documents. Cloned from the identity-verifications [id] route.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("property_ownership_submissions")
      .select(
        `
        id,
        property_id,
        user_id,
        documents,
        status,
        submitted_at,
        reviewed_at,
        review_notes,
        rejection_reason,
        users:user_id ( id, full_name, email, phone, avatar_url, user_type ),
        property:property_id ( id, property_type, price, quartier, city, status, ownership_verification_status )
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Admin ownership detail failed:", error);
      return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const documents = await withSignedOwnershipDocUrls(
      (data.documents as OwnershipDocument[]) ?? [],
    );

    return NextResponse.json({
      success: true,
      submission: { ...data, documents },
    });
  } catch (error) {
    console.error("GET /api/admin/ownership-verifications/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
