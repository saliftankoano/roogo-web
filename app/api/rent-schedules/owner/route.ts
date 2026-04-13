import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * GET /api/rent-schedules/owner
 * Returns all rent schedules for properties owned by the authenticated user.
 */
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

    const { data: schedules, error } = await supabaseAdmin
      .from("rent_schedules")
      .select(
        `
        *,
        properties(id, address, quartier, city),
        renter:users!rent_schedules_renter_id_fkey(id, full_name, phone)
      `,
      )
      .eq("owner_id", user.id)
      .order("due_date", { ascending: true });

    if (error) {
      console.error("Error fetching owner rent schedules:", error);
      return errorResponse("Failed to fetch schedules", 500, req);
    }

    return cors(NextResponse.json({ schedules: schedules || [] }), req);
  } catch (error) {
    console.error("Error in GET /api/rent-schedules/owner:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
