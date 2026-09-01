import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { RENT_COLLECTION_TERMS_VERSION } from "@/lib/rent-collection";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agreementId } = await params;
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const body = (await req.json()) as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      return errorResponse("enabled must be a boolean", 400, req);
    }

    const { data: agreement, error: agreementError } = await supabaseAdmin
      .from("rental_agreements")
      .select("id, owner_id, property_id, status, property_frequence")
      .eq("id", agreementId)
      .maybeSingle();

    if (agreementError || !agreement) {
      return errorResponse("Agreement not found", 404, req);
    }
    if (agreement.owner_id !== user.id) {
      return errorResponse(
        "Forbidden: only the owner can change rent collection",
        403,
        req,
      );
    }
    if (agreement.property_frequence !== "mensuel") {
      return errorResponse(
        "Rent collection settings apply only to monthly agreements",
        409,
        req,
      );
    }
    if (agreement.status !== "active") {
      return errorResponse(
        "Rent collection can be changed after the agreement becomes active",
        409,
        req,
      );
    }

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("rental_agreements")
      .update({
        rent_collection_enabled: body.enabled,
        rent_collection_disabled_at: body.enabled ? null : now,
        rent_collection_disabled_by: body.enabled ? null : user.id,
        rent_collection_terms_version: RENT_COLLECTION_TERMS_VERSION,
      })
      .eq("id", agreementId)
      .eq("owner_id", user.id)
      .select(
        "id, rent_collection_enabled, rent_collection_disabled_at, rent_collection_terms_version",
      )
      .single();

    if (updateError || !updated) {
      console.error("Unable to update rent collection:", updateError);
      return errorResponse("Failed to update rent collection", 500, req);
    }

    const { data: pendingFee, error: feeError } = await supabaseAdmin
      .from("property_listing_fees")
      .select("id")
      .eq("property_id", agreement.property_id)
      .eq("owner_id", agreement.owner_id)
      .eq("fee_type", "success_fee")
      .eq("status", "pending")
      .maybeSingle();

    if (feeError) {
      console.error("Unable to check pending success fee:", feeError);
      return errorResponse("Failed to verify first-rent settlement", 500, req);
    }

    return cors(
      NextResponse.json({
        agreement: updated,
        firstRentStillRequired: !body.enabled && Boolean(pendingFee),
      }),
      req,
    );
  } catch (error) {
    console.error("Error updating rent collection:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
