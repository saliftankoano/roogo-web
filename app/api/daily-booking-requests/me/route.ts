import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { serializeDailyBookingRequest } from "@/lib/daily-bookings";

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

    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const propertyId = searchParams.get("propertyId");

    let query = supabaseAdmin
      .from("daily_booking_requests")
      .select(
        `
        *,
        properties:property_id(id, address, quartier, city, price, property_images(url, is_primary)),
        owner:owner_id(id, full_name, phone),
        renter:renter_id(id, full_name, phone)
        `,
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (role === "owner") {
      query = query.eq("owner_id", user.id);
    } else if (role === "renter") {
      query = query.eq("renter_id", user.id);
    } else {
      query = query.or(`owner_id.eq.${user.id},renter_id.eq.${user.id}`);
    }

    if (propertyId) query = query.eq("property_id", propertyId);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching daily booking requests:", error);
      return errorResponse("Failed to fetch daily booking requests", 500, req);
    }

    return cors(
      NextResponse.json({
        success: true,
        requests: (data || []).map((row) =>
          serializeDailyBookingRequest(row as Record<string, unknown>),
        ),
      }),
      req,
    );
  } catch (error) {
    console.error("Error in GET /api/daily-booking-requests/me:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
