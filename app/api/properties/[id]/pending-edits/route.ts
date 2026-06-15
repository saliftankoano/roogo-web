import { NextRequest, NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { validateAndDiffPendingEdit } from "@/lib/property-pending-edits";

export async function OPTIONS(req: NextRequest) {
  return corsOptions(req);
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET — return the current pending changeset for this property (owner or staff)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);

  const { id: propertyId } = await params;

  const isAdmin = isStaffOrFounder(user);

  if (!isAdmin) {
    // Verify ownership
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("agent_id", user.id)
      .maybeSingle();

    if (!prop) return errorResponse("Not found or not authorized", 404, req);
  }

  const { data, error } = await supabaseAdmin
    .from("property_pending_edits")
    .select("id, payload, status, review_note, created_at, updated_at")
    .eq("property_id", propertyId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    console.error("Error fetching pending edit:", error);
    return errorResponse("Internal server error", 500, req);
  }

  return cors(NextResponse.json({ pendingEdit: data ?? null }), req);
}

// ---------------------------------------------------------------------------
// POST — owner submits a new (or replacement) pending changeset
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);

  const { id: propertyId } = await params;

  // Verify ownership (staff bypass allowed)
  const isAdmin = isStaffOrFounder(user);
  if (!isAdmin) {
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("agent_id", user.id)
      .maybeSingle();

    if (!prop) return errorResponse("Not found or not authorized", 404, req);
  }

  // Fetch the current property row for diffing
  // Note: `address` is intentionally excluded — it is always derived from
  // quartier + city and is recomputed server-side in applyPendingEdit.
  const { data: currentRow, error: fetchError } = await supabaseAdmin
    .from("properties")
    .select(
      "price, caution_mois, loyer_avance_mois, caution_type, caution_valeur, city, quartier, latitude, longitude, property_type, bedrooms, bathrooms, area, parking_spaces, sejour_minimum, capacite_max, description, dos_and_donts, interdictions",
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (fetchError || !currentRow) {
    return errorResponse("Property not found", 404, req);
  }

  // Fetch current amenity names for diffing
  const { data: amenityRows } = await supabaseAdmin
    .from("property_amenities")
    .select("amenities(name)")
    .eq("property_id", propertyId);

  const currentAmenityNames: string[] = (amenityRows ?? [])
    .map((row: { amenities: { name: string } | { name: string }[] | null }) => {
      const amenity = row.amenities;
      if (!amenity) return null;
      if (Array.isArray(amenity)) return amenity[0]?.name ?? null;
      return (amenity as { name: string }).name;
    })
    .filter((n): n is string => typeof n === "string");

  const body = await req.json().catch(() => ({}));

  const validation = validateAndDiffPendingEdit(body, {
    ...currentRow,
    amenities: currentAmenityNames,
  });

  if (!validation.ok) {
    // Empty diff is not an error — return 200 so the client can navigate back gracefully.
    if (validation.noChanges) {
      return cors(NextResponse.json({ success: true, noChanges: true }), req);
    }
    return cors(
      NextResponse.json({ error: validation.error }, { status: 400 }),
      req,
    );
  }

  // Upsert: if there is already a pending row for this property, replace it.
  // We DELETE the existing pending row first (bypasses the partial unique index).
  await supabaseAdmin
    .from("property_pending_edits")
    .delete()
    .eq("property_id", propertyId)
    .eq("status", "pending");

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("property_pending_edits")
    .insert({
      property_id: propertyId,
      submitted_by: user.id,
      payload: validation.payload,
      status: "pending",
    })
    .select("id, payload, status, created_at")
    .single();

  if (insertError) {
    console.error("Error inserting pending edit:", insertError);
    return errorResponse("Internal server error", 500, req);
  }

  return cors(NextResponse.json({ success: true, pendingEdit: inserted }), req);
}

// ---------------------------------------------------------------------------
// DELETE — owner withdraws their pending changeset
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);

  const { id: propertyId } = await params;

  const isAdmin = isStaffOrFounder(user);
  const deleteQuery = supabaseAdmin
    .from("property_pending_edits")
    .delete()
    .eq("property_id", propertyId)
    .eq("status", "pending");

  // Owners can only delete their own pending edit
  if (!isAdmin) {
    deleteQuery.eq("submitted_by", user.id);
  }

  const { error } = await deleteQuery;

  if (error) {
    console.error("Error deleting pending edit:", error);
    return errorResponse("Internal server error", 500, req);
  }

  return cors(NextResponse.json({ success: true }), req);
}
