import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function verifyClerkUserId(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  try {
    const { sub } = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    return sub || null;
  } catch {
    return null;
  }
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const clerkUserId = await verifyClerkUserId(req);
  if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  let query = supabaseAdmin
    .from("open_house_bookings")
    .select(
      `
      id,
      slot_id,
      created_at,
      open_house_slots!inner (
        id,
        date,
        start_time,
        end_time,
        property_id,
        directions,
        latitude,
        longitude
      )
      `,
    )
    .eq("user_id", clerkUserId)
    .order("created_at", { ascending: false });

  if (propertyId) {
    query = query.eq("open_house_slots.property_id", propertyId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching open house bookings:", error);
    return errorResponse("Failed to fetch bookings", 500, req);
  }

  return cors(
    NextResponse.json({ success: true, bookings: data || [] }),
    req,
  );
}

export async function POST(req: Request) {
  const clerkUserId = await verifyClerkUserId(req);
  if (!clerkUserId) return errorResponse("Unauthorized", 401, req);

  const body = (await req.json().catch(() => null)) as {
    slotId?: unknown;
  } | null;
  const slotId = typeof body?.slotId === "string" ? body.slotId : "";

  if (!slotId) {
    return errorResponse("slotId is required", 400, req);
  }

  const { error } = await supabaseAdmin.from("open_house_bookings").insert({
    slot_id: slotId,
    user_id: clerkUserId,
  });

  if (error) {
    if (error.code === "23505") {
      return errorResponse("Vous avez déjà réservé ce créneau.", 409, req);
    }

    console.error("Error creating open house booking:", error);
    return errorResponse("Failed to book open house slot", 500, req);
  }

  return cors(NextResponse.json({ success: true }), req);
}
