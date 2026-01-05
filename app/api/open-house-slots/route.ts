import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseClient, getUserByClerkId } from "@/lib/user-sync";
import type { PostgrestError } from "@supabase/supabase-js";

type OpenHouseSlotRow = {
  id: string;
  property_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM(:SS)
  end_time: string; // HH:MM(:SS)
  capacity: number;
  created_at?: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function requireStaff() {
  const { userId } = await auth();
  if (!userId) return { ok: false as const, res: json({ error: "Unauthorized" }, 401) };

  const user = await getUserByClerkId(userId);
  if (!user || user.user_type !== "staff") {
    return { ok: false as const, res: json({ error: "Forbidden" }, 403) };
  }

  return { ok: true as const, clerkUserId: userId };
}

function isValidDate(date: string) {
  // Expect YYYY-MM-DD; Date parsing is loose so keep basic validation.
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidTime(time: string) {
  // HH:MM or HH:MM:SS
  return /^\d{2}:\d{2}(:\d{2})?$/.test(time);
}

function timeToMinutes(t: string) {
  const [hh, mm] = t.split(":");
  return Number(hh) * 60 + Number(mm);
}

export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff.ok) return staff.res;

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId") || undefined;
  const from = url.searchParams.get("from") || undefined; // YYYY-MM-DD
  const to = url.searchParams.get("to") || undefined; // YYYY-MM-DD

  if (from && !isValidDate(from)) return json({ error: "Invalid from date" }, 400);
  if (to && !isValidDate(to)) return json({ error: "Invalid to date" }, 400);

  try {
    const supabase = getSupabaseClient();

    let query = supabase
      .from("open_house_slots")
      .select("id, property_id, date, start_time, end_time, capacity, created_at")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (propertyId) query = query.eq("property_id", propertyId);
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    return json({ slots: (data as OpenHouseSlotRow[]) || [] });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "An unexpected error occurred" },
      500
    );
  }
}

export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff.ok) return staff.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const {
    propertyId,
    date,
    startTime,
    endTime,
    capacity,
  } = (body || {}) as Record<string, unknown>;

  if (typeof propertyId !== "string" || !propertyId) {
    return json({ error: "Missing propertyId" }, 400);
  }
  if (typeof date !== "string" || !isValidDate(date)) {
    return json({ error: "Invalid date" }, 400);
  }
  if (typeof startTime !== "string" || !isValidTime(startTime)) {
    return json({ error: "Invalid startTime" }, 400);
  }
  if (typeof endTime !== "string" || !isValidTime(endTime)) {
    return json({ error: "Invalid endTime" }, 400);
  }
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  if (!Number.isFinite(startMins) || !Number.isFinite(endMins) || startMins >= endMins) {
    return json({ error: "startTime must be before endTime" }, 400);
  }
  const cap = typeof capacity === "number" ? capacity : Number(capacity);
  if (!Number.isFinite(cap) || cap <= 0) {
    return json({ error: "capacity must be a positive number" }, 400);
  }

  try {
    const supabase = getSupabaseClient();

    // Enforce the pack limit from `properties.open_house_limit`.
    const { data: property, error: propErr } = await supabase
      .from("properties")
      .select("open_house_limit")
      .eq("id", propertyId)
      .single();

    if (propErr) return json({ error: propErr.message }, 500);
    const limit = typeof property?.open_house_limit === "number" ? property.open_house_limit : 0;

    const { count, error: countErr } = await supabase
      .from("open_house_slots")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId);

    if (countErr) return json({ error: countErr.message }, 500);
    if (limit > 0 && (count || 0) >= limit) {
      return json({ error: "Open house limit reached for this property" }, 409);
    }

    // Prevent time overlap on same date.
    const { data: existing, error: existingErr } = await supabase
      .from("open_house_slots")
      .select("id, start_time, end_time")
      .eq("property_id", propertyId)
      .eq("date", date);

    if (existingErr) return json({ error: existingErr.message }, 500);

    const overlaps =
      (existing || []).some((s: { start_time: string; end_time: string }) => {
        const sStart = timeToMinutes(s.start_time);
        const sEnd = timeToMinutes(s.end_time);
        return startMins < sEnd && endMins > sStart;
      });
    if (overlaps) {
      return json({ error: "Time overlaps an existing open house on this date" }, 409);
    }

    const { data: created, error } = await supabase
      .from("open_house_slots")
      .insert({
        property_id: propertyId,
        date,
        start_time: startTime,
        end_time: endTime,
        capacity: cap,
      })
      .select("id, property_id, date, start_time, end_time, capacity, created_at")
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ slot: created as OpenHouseSlotRow }, 201);
  } catch (e) {
    const err = e as { message?: string; details?: string; code?: string } | PostgrestError;
    return json({ error: err?.message || "An unexpected error occurred" }, 500);
  }
}

