import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getStaffOrFounder } from "@/lib/api-auth";
import { getStaffSaleLadder } from "@/lib/sale-mandate";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

// Staff and founders only (web session or mobile Bearer JWT): the price ladder of
// one sale listing, with the owner's private price and what Roogo keeps at each
// rung. Owners and buyers get 403. `ladder` is null for non-sales or when the
// owner's price is unknown.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getStaffOrFounder(req);
    if (!user) return errorResponse("Forbidden", 403, req);
    const { id } = await params;
    const ladder = await getStaffSaleLadder(id);
    return cors(
      NextResponse.json(
        { success: true, ladder },
        { headers: { "Cache-Control": "private, no-store" } },
      ),
      req,
    );
  } catch (error) {
    console.error("GET /api/properties/[id]/sale-ladder:", error);
    return errorResponse("Failed to load the sale ladder", 500, req);
  }
}
