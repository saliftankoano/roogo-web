import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getUserByClerkId } from "@/lib/user-sync";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

/**
 * GET /api/properties/:id/availability
 * Public — returns all blocked date ranges for a property.
 * Optional query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: propertyId } = await params;
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = supabaseAdmin
      .from("property_blocked_dates")
      .select("id, start_date, end_date, block_type, agreement_id, note, expires_at")
      .eq("property_id", propertyId)
      .order("start_date", { ascending: true });

    if (from) query = query.gte("end_date", from);
    if (to) query = query.lte("start_date", to);

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching blocked dates:", error);
      return errorResponse("Failed to fetch availability", 500, req);
    }

    const nowIso = new Date().toISOString();
    const blockedRanges = (data ?? []).filter((range) => {
      if (range.block_type !== "booking_hold") return true;
      return !range.expires_at || range.expires_at > nowIso;
    });

    return cors(NextResponse.json({ blockedRanges }), req);
  } catch (error) {
    console.error("Error in GET /api/properties/[id]/availability:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

/**
 * POST /api/properties/:id/availability
 * Owner only — block a date range.
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", note?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: propertyId } = await params;

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

    // Verify ownership
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("id, agent_id")
      .eq("id", propertyId)
      .single();

    if (!property) return errorResponse("Property not found", 404, req);
    if (property.agent_id !== user.id)
      return errorResponse("Forbidden", 403, req);

    const body = await req.json();
    const { startDate, endDate, note } = body as {
      startDate: string;
      endDate: string;
      note?: string;
    };

    if (!startDate || !endDate) {
      return errorResponse("startDate and endDate are required", 400, req);
    }
    if (endDate < startDate) {
      return errorResponse("endDate must be >= startDate", 400, req);
    }

    // Reject if any existing booked range or active payment hold overlaps.
    const { data: conflicts } = await supabaseAdmin
      .from("property_blocked_dates")
      .select("id, block_type, expires_at")
      .eq("property_id", propertyId)
      .in("block_type", ["booked", "booking_hold"])
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    const nowIso = new Date().toISOString();
    const hasActiveConflict = (conflicts || []).some((conflict) => {
      if (conflict.block_type !== "booking_hold") return true;
      return !conflict.expires_at || conflict.expires_at > nowIso;
    });

    if (hasActiveConflict) {
      return errorResponse(
        "Ces dates chevauchent une réservation existante et ne peuvent pas être bloquées",
        409,
        req,
      );
    }

    const { data: block, error: insertError } = await supabaseAdmin
      .from("property_blocked_dates")
      .insert({
        property_id: propertyId,
        start_date: startDate,
        end_date: endDate,
        block_type: "owner_block",
        note: note ?? null,
        created_by: user.id,
      })
      .select("id, start_date, end_date, block_type, note")
      .single();

    if (insertError) {
      console.error("Error inserting blocked dates:", insertError);
      return errorResponse("Failed to block dates", 500, req);
    }

    return cors(
      NextResponse.json({ success: true, block }, { status: 201 }),
      req,
    );
  } catch (error) {
    console.error("Error in POST /api/properties/[id]/availability:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
