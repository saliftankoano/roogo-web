import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import {
  type OwnershipDocument,
  canSubmitOwnership,
  loadSellerProperty,
} from "@/lib/property-ownership";
import { resolveClerkId } from "@/lib/request-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { notifyStaffOwnershipSubmitted } from "@/lib/staff-ownership-notifications";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// GET: the seller polls their property's ownership status (after submitting).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);
    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const { id: propertyId } = await params;
    const { property, reason } = await loadSellerProperty(propertyId, user.id);
    if (!property) {
      if (reason === "forbidden")
        return errorResponse("Not your property", 403, req);
      return errorResponse("Property not found", 404, req);
    }

    return cors(
      NextResponse.json({
        status: property.ownership_verification_status,
      }),
      req,
    );
  } catch (error) {
    console.error("GET /api/properties/[id]/ownership-documents:", error);
    return errorResponse("Failed to load status", 500, req);
  }
}

// POST: submit ownership documents for staff review.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const clerkUserId = await resolveClerkId(req);
    if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);
    if (!canSubmitOwnership(user.user_type)) {
      return errorResponse("Only owners and agents can submit documents", 403, req);
    }

    const { id: propertyId } = await params;
    const { property, reason } = await loadSellerProperty(propertyId, user.id);
    if (!property) {
      if (reason === "forbidden")
        return errorResponse("Not your property", 403, req);
      if (reason === "not_a_sale")
        return errorResponse("Property is not a sale listing", 400, req);
      return errorResponse("Property not found", 404, req);
    }
    if (property.ownership_verification_status === "approved") {
      return errorResponse("Ownership is already verified", 409, req);
    }

    const body = (await req.json()) as { documents?: unknown };
    const rawDocs = Array.isArray(body.documents) ? body.documents : [];
    const documents: OwnershipDocument[] = rawDocs
      .map((d) => d as Record<string, unknown>)
      .filter(
        (d) =>
          typeof d.storage_path === "string" &&
          // paths must live under this seller + property namespace
          (d.storage_path as string).startsWith(`${user.id}/${propertyId}/`),
      )
      .map((d) => ({
        label: typeof d.label === "string" ? d.label : "Document",
        storage_path: d.storage_path as string,
      }));

    if (documents.length === 0) {
      return errorResponse("At least one valid document is required", 400, req);
    }

    // Supersede any prior pending submission for this property.
    await supabaseAdmin
      .from("property_ownership_submissions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        rejection_reason: "Remplacé par une nouvelle soumission.",
      })
      .eq("property_id", propertyId)
      .eq("status", "pending");

    const { data: submission, error: insertError } = await supabaseAdmin
      .from("property_ownership_submissions")
      .insert({
        property_id: propertyId,
        user_id: user.id,
        documents,
        status: "pending",
      })
      .select("id, status, submitted_at")
      .single();

    if (insertError || !submission) {
      console.error("Ownership submission insert failed:", insertError);
      return errorResponse("Failed to submit documents", 500, req);
    }

    const { error: propUpdateError } = await supabaseAdmin
      .from("properties")
      .update({
        ownership_verification_status: "pending",
        ownership_verified_at: null,
        ownership_verified_by: null,
        ownership_verification_rejection_reason: null,
      })
      .eq("id", propertyId);

    if (propUpdateError) {
      console.error("Ownership property status update failed:", propUpdateError);
      return errorResponse("Failed to update status", 500, req);
    }

    notifyStaffOwnershipSubmitted(submission.id).catch((error) => {
      console.error("Ownership staff notification failed:", error);
    });

    return cors(NextResponse.json({ success: true, submission }), req);
  } catch (error) {
    console.error("POST /api/properties/[id]/ownership-documents:", error);
    return errorResponse("Failed to submit documents", 500, req);
  }
}
