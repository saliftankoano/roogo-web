import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  try {
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

    const user = await getOrSyncUserByClerkId(clerkUserId);
    if (!user) return errorResponse("User not found", 404, req);

    const { data: holds, error } = await supabaseAdmin
      .from("deposit_holds")
      .select(
        "id, agreement_id, property_id, amount, currency, status, stay_end_at, review_deadline_at, resolved_owner_amount, resolved_renter_amount, resolved_at, renter_payout_phone, renter_payout_provider, created_at",
      )
      .eq("renter_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching renter deposit holds:", error);
      return errorResponse("Failed to fetch deposit holds", 500, req);
    }

    return cors(NextResponse.json({ success: true, holds: holds || [] }), req);
  } catch (error) {
    console.error("Error in GET /api/deposit-holds/me:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
