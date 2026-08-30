import { NextResponse } from "next/server";
import { z } from "zod";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser, isStaffOrFounder } from "@/lib/api-auth";
import {
  generateEventCode,
  normalizeEventCode,
  normalizeHotelEventCity,
} from "@/lib/hotel-events";
import { getMembershipsForUser } from "@/lib/hotel-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const eventSchema = z.object({
  name: z.string().trim().min(2).max(160),
  city: z.string().trim().min(2).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedHeadcount: z.number().int().positive().max(100_000).optional(),
  organizerName: z.string().trim().max(160).optional(),
  organizerContact: z.string().trim().max(160).optional(),
  perDiemLimit: z.number().int().nonnegative().max(10_000_000).optional(),
  code: z.string().optional(),
});

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);
  let query = supabaseAdmin.from("events").select("*").order("start_date");
  let hotelCity: string | null = null;
  if (!isStaffOrFounder(user)) {
    const adminMembership = (await getMembershipsForUser(user.id)).find(
      (membership) => membership.role === "admin",
    );
    if (!adminMembership) return errorResponse("Forbidden", 403, req);
    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("city")
      .eq("id", adminMembership.hotelId)
      .single();
    query = query.eq("status", "open");
    hotelCity = hotel?.city || null;
  }
  const { data, error } = await query;
  if (error) throw error;
  const events = hotelCity
    ? (data || []).filter(
        (event) =>
          normalizeHotelEventCity(event.city) ===
          normalizeHotelEventCity(hotelCity),
      )
    : data || [];
  return cors(NextResponse.json({ success: true, events }), req);
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user || !isStaffOrFounder(user))
    return errorResponse("Forbidden", 403, req);
  const parsed = eventSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("Invalid event", 400, req);
  if (parsed.data.endDate < parsed.data.startDate) {
    return errorResponse("Invalid event dates", 400, req);
  }
  const code = parsed.data.code
    ? normalizeEventCode(parsed.data.code)
    : generateEventCode();
  if (!code) return errorResponse("Invalid event code", 400, req);
  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({
      name: parsed.data.name,
      city: parsed.data.city,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      expected_headcount: parsed.data.expectedHeadcount || null,
      organizer_name: parsed.data.organizerName || null,
      organizer_contact: parsed.data.organizerContact || null,
      per_diem_limit: parsed.data.perDiemLimit ?? null,
      code,
      status: "open",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error)
    return errorResponse(
      error.code === "23505"
        ? "Event code already exists"
        : "Failed to create event",
      error.code === "23505" ? 409 : 500,
      req,
    );
  return cors(
    NextResponse.json({ success: true, event: data }, { status: 201 }),
    req,
  );
}
