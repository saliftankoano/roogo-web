import { NextRequest, NextResponse } from "next/server";
import { getStaffOrFounder } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  applyPendingEdit,
  PendingEditPayload,
} from "@/lib/property-pending-edits";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { unescapeText } from "@/lib/text-sanitize";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// PATCH /api/admin/pending-edits/[id]
// Body: { action: "approve" | "reject", reviewNote?: string }
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getStaffOrFounder(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: pendingEditId } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reviewNote?: string;
  };
  const { action, reviewNote } = body;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  // Fetch the pending edit
  const { data: pendingEdit, error: fetchError } = await supabaseAdmin
    .from("property_pending_edits")
    .select(
      `id, property_id, payload, status,
       property:properties (address, quartier, city),
       submitted_by_user:users!property_pending_edits_submitted_by_fkey (id)`,
    )
    .eq("id", pendingEditId)
    .maybeSingle();

  if (fetchError || !pendingEdit) {
    return NextResponse.json(
      { error: "Pending edit not found" },
      { status: 404 },
    );
  }

  if (pendingEdit.status !== "pending") {
    return NextResponse.json(
      { error: "This edit has already been reviewed" },
      { status: 409 },
    );
  }

  const propertyId = pendingEdit.property_id as string;
  const submittedByUser = pendingEdit.submitted_by_user as
    | { id: string }[]
    | { id: string }
    | null;
  const ownerId = Array.isArray(submittedByUser)
    ? submittedByUser[0]?.id
    : submittedByUser?.id;

  const propertyLabel = (() => {
    const prop = pendingEdit.property as {
      address?: string;
      quartier?: string;
      city?: string;
    } | null;
    if (!prop) return "ce bien";
    const raw = prop.address || `${prop.quartier}, ${prop.city}` || "ce bien";
    return unescapeText(raw);
  })();

  if (action === "approve") {
    const applyResult = await applyPendingEdit(
      propertyId,
      pendingEdit.payload as PendingEditPayload,
    );

    if (!applyResult.ok) {
      console.error("Error applying pending edit:", applyResult.error);
      return NextResponse.json({ error: applyResult.error }, { status: 500 });
    }

    const { error: markError } = await supabaseAdmin
      .from("property_pending_edits")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote ?? null,
      })
      .eq("id", pendingEditId);

    if (markError) {
      console.error("Error marking pending edit as approved:", markError);
    }

    if (ownerId) {
      await notifyUserWithTemplate(
        ownerId,
        "propertyReviews",
        "properties.editApproved",
        { propertyLabel },
        { type: "edit_approved", propertyId },
      ).catch((err) => {
        console.error("Edit approved notification failed:", err);
      });
    }

    return NextResponse.json({ success: true, action: "approved" });
  }

  // action === "reject"
  const { error: rejectError } = await supabaseAdmin
    .from("property_pending_edits")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote ?? null,
    })
    .eq("id", pendingEditId);

  if (rejectError) {
    console.error("Error marking pending edit as rejected:", rejectError);
    return NextResponse.json({ error: rejectError.message }, { status: 500 });
  }

  if (ownerId) {
    await notifyUserWithTemplate(
      ownerId,
      "propertyReviews",
      "properties.editRejected",
      { propertyLabel, reviewNote: reviewNote ?? "" },
      { type: "edit_rejected", propertyId },
    ).catch((err) => {
      console.error("Edit rejected notification failed:", err);
    });
  }

  return NextResponse.json({ success: true, action: "rejected" });
}
