import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * GET /api/properties/:id/locked-renter
 * Returns the renter profile and property_lock transaction details
 * for a property with status 'locked' or 'finalized'.
 * Only accessible by the property owner.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;

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

    // Verify ownership
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("id, agent_id, status")
      .eq("id", propertyId)
      .single();

    if (!property) return errorResponse("Property not found", 404, req);
    if (property.agent_id !== user.id) return errorResponse("Forbidden", 403, req);

    if (!["locked", "finalized"].includes(property.status)) {
      return errorResponse("Property is not locked", 400, req);
    }

    // Find the property_lock transaction
    const { data: lockTransaction } = await supabaseAdmin
      .from("transactions")
      .select("id, deposit_id, amount, currency, status, created_at, provider, user_id")
      .eq("property_id", propertyId)
      .eq("type", "property_lock")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lockTransaction) {
      const { data: agreement } = await supabaseAdmin
        .from("rental_agreements")
        .select("id, renter_id, start_date, end_date, monthly_rent, signature_source")
        .eq("property_id", propertyId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!agreement) {
        return cors(NextResponse.json({ renter: null, lockTransaction: null, agreement: null }), req);
      }
      const { data: renter } = await supabaseAdmin
        .from("users")
        .select("id, full_name, phone, email, profile_image_url")
        .eq("id", agreement.renter_id)
        .single();
      return cors(NextResponse.json({ renter, lockTransaction: null, agreement }), req);
    }

    // Fetch renter profile
    const { data: renter } = await supabaseAdmin
      .from("users")
      .select("id, full_name, phone, email, profile_image_url")
      .eq("id", lockTransaction.user_id)
      .single();

    return cors(
      NextResponse.json({
        renter,
        lockTransaction,
      }),
      req
    );
  } catch (error) {
    console.error("Error in GET /api/properties/[id]/locked-renter:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
