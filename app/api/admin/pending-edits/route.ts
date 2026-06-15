import { NextRequest, NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ---------------------------------------------------------------------------
// GET /api/admin/pending-edits
// Returns all pending changesets joined with property + owner info.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await getStaffOrFounder(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") ?? "pending";

  const { data, error } = await supabaseAdmin
    .from("property_pending_edits")
    .select(
      `id,
       status,
       payload,
       review_note,
       created_at,
       updated_at,
       reviewed_at,
       property:properties (
         id,
         address,
         city,
         quartier,
         property_type,
         price,
         status,
         description,
         bedrooms,
         bathrooms,
         area,
         parking_spaces,
         caution_mois,
         loyer_avance_mois,
         caution_type,
         caution_valeur,
         sejour_minimum,
         capacite_max,
         dos_and_donts,
         interdictions,
         period
       ),
       submitted_by_user:users!property_pending_edits_submitted_by_fkey (
         id,
         full_name,
         email,
         phone
       ),
       reviewed_by_user:users!property_pending_edits_reviewed_by_fkey (
         id,
         full_name
       )`,
    )
    .eq("status", statusFilter)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching pending edits:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pendingEdits: data ?? [] });
}
