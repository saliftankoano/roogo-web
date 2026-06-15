import { NextRequest, NextResponse } from "next/server";
import { cors, corsOptions } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

// ---------------------------------------------------------------------------
// GET /api/users/me/pending-edits
// Returns the list of property IDs for which the authenticated user has an
// open (pending) edit changeset. Replaces the per-property N+1 loop in the
// mobile my-properties screen.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return cors(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      req,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("property_pending_edits")
    .select("property_id")
    .eq("submitted_by", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("Error fetching user pending edits:", error);
    return cors(
      NextResponse.json({ error: error.message }, { status: 500 }),
      req,
    );
  }

  const propertyIds = (data ?? []).map(
    (row: { property_id: string }) => row.property_id,
  );

  return cors(NextResponse.json({ propertyIds }), req);
}
