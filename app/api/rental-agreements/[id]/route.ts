import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * GET /api/rental-agreements/:id
 * Fetch a rental agreement with joined property + user data.
 * Accessible by owner or renter of that agreement.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agreementId } = await params;

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const { data: agreement, error } = await supabaseAdmin
      .from("rental_agreements")
      .select(`
        *,
        properties(id, address, price, quartier, city, property_images(url, is_primary)),
        owner:users!rental_agreements_owner_id_fkey(id, full_name, phone, email),
        renter:users!rental_agreements_renter_id_fkey(id, full_name, phone, email)
      `)
      .eq("id", agreementId)
      .single();

    if (error) {
      console.error("Supabase error fetching agreement:", error);
      return errorResponse("Agreement not found", 404, req);
    }
    if (!agreement) {
      return errorResponse("Agreement not found", 404, req);
    }

    // Only owner or renter may access
    if (agreement.owner_id !== user.id && agreement.renter_id !== user.id) {
      return errorResponse("Forbidden", 403, req);
    }

    let firstRentSuccessFeePending = false;
    if (agreement.property_frequence === "mensuel") {
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
        return errorResponse("Failed to load agreement fee state", 500, req);
      }
      firstRentSuccessFeePending = Boolean(pendingFee);
    }

    return cors(
      NextResponse.json({
        agreement: {
          ...agreement,
          first_rent_success_fee_pending: firstRentSuccessFeePending,
        },
      }),
      req,
    );
  } catch (error) {
    console.error("Error in GET /api/rental-agreements/[id]:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

/**
 * PATCH /api/rental-agreements/:id
 * Update a draft agreement's terms (owner only, draft status only).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agreementId } = await params;

    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return errorResponse("Unauthorized", 401, req);

    let clerkUserId: string;
    try {
      const { sub } = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
      clerkUserId = sub;
    } catch {
      return errorResponse("Invalid token", 401, req);
    }

    const user = await getUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    // Fetch agreement to verify ownership and status
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("rental_agreements")
      .select("id, owner_id, status, transaction_id")
      .eq("id", agreementId)
      .single();

    if (fetchError || !existing) {
      return errorResponse("Agreement not found", 404, req);
    }

    if (existing.owner_id !== user.id) {
      return errorResponse("Forbidden: only the owner can edit this agreement", 403, req);
    }

    if (existing.status !== "draft") {
      return errorResponse("Only draft agreements can be edited", 409, req);
    }

    const body = await req.json();
    const financialFields = ["monthly_rent", "caution_mois", "loyer_avance_mois"];
    const allowed = [
      "monthly_rent",
      "caution_mois",
      "loyer_avance_mois",
      "start_date",
      "end_date",
      "dos_and_donts",
      "interdictions",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (existing.transaction_id) {
      for (const key of financialFields) {
        delete updates[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return errorResponse("No valid fields to update", 400, req);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("rental_agreements")
      .update(updates)
      .eq("id", agreementId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error("Supabase error updating agreement:", updateError);
      return errorResponse("Failed to update agreement", 500, req);
    }

    return cors(NextResponse.json({ agreement: updated }), req);
  } catch (error) {
    console.error("Error in PATCH /api/rental-agreements/[id]:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
