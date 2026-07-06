import { NextResponse } from "next/server";
import { requireStaffSupabaseUser } from "@/lib/identity-verifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Visit-request queue for the admin calendar. Defaults to pending ("requested").
export async function GET(req: Request) {
  try {
    const authResult = await requireStaffSupabaseUser();
    if ("error" in authResult) return authResult.error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "requested";

    let query = supabaseAdmin
      .from("visit_requests")
      .select(
        `
        id, conversation_id, property_id, buyer_id,
        proposed_slots, status, scheduled_at, assigned_staff_id, created_at,
        buyer:buyer_id ( id, full_name, phone ),
        property:property_id ( id, property_type, quartier, city, price )
      `,
      )
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) {
      console.error("Admin visit-requests list failed:", error);
      return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }

    return NextResponse.json({ success: true, visitRequests: data ?? [] });
  } catch (error) {
    console.error("GET /api/admin/visit-requests:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
