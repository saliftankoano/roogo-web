import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * GET /api/rental-agreements/me
 * Returns all rental agreements where the user is owner or renter.
 * Query param: ?role=owner|renter (defaults to both)
 */
export async function GET(req: Request) {
  try {
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

    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");

    let query = supabaseAdmin
      .from("rental_agreements")
      .select(`
        *,
        properties(id, address, price, quartier, city),
        owner:users!rental_agreements_owner_id_fkey(id, full_name, phone),
        renter:users!rental_agreements_renter_id_fkey(id, full_name, phone)
      `)
      .order("created_at", { ascending: false });

    if (role === "owner") {
      query = query.eq("owner_id", user.id);
    } else if (role === "renter") {
      query = query.eq("renter_id", user.id);
    } else {
      // Return both — owner and renter agreements
      query = query.or(`owner_id.eq.${user.id},renter_id.eq.${user.id}`);
    }

    const { data: agreements, error } = await query;

    if (error) {
      console.error("Error fetching agreements:", error);
      return errorResponse("Failed to fetch agreements", 500, req);
    }

    return cors(NextResponse.json({ agreements: agreements || [] }), req);
  } catch (error) {
    console.error("Error in GET /api/rental-agreements/me:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
