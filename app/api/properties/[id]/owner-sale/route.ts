import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import { getOwnerSalePayout } from "@/lib/sale-mandate";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// The owner of a sale listing (web session or mobile Bearer JWT), or staff:
// the owner's own price, the public price and the percentages behind the
// owner simulator « Ce que vous recevez selon le prix de vente final »
// (2026-10-18). Never approvals or the approval rule. Anyone else gets 404.
// `payout` is null for non-sales or when the owner's price is unknown.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);
    const { id } = await params;

    if (!isStaffOrFounder(user)) {
      const { data: owned, error } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("id", id)
        .eq("agent_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!owned) return errorResponse("Not found or not authorized", 404, req);
    }

    const payout = await getOwnerSalePayout(id);
    return cors(
      NextResponse.json(
        { success: true, payout },
        { headers: { "Cache-Control": "private, no-store" } },
      ),
      req,
    );
  } catch (error) {
    console.error("GET /api/properties/[id]/owner-sale:", error);
    return errorResponse("Failed to load the sale payout", 500, req);
  }
}
