import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { generateHotelGroupCode } from "@/lib/hotel-events";
import { getHotelMembership } from "@/lib/hotel-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);
  const payload = await req.json().catch(() => ({}));
  const hotelId = typeof payload.hotelId === "string" ? payload.hotelId : "";
  const membership = await getHotelMembership(user.id, hotelId);
  if (membership?.role !== "admin") return errorResponse("Forbidden", 403, req);
  const { data: existing } = await supabaseAdmin
    .from("hotel_group_hotels")
    .select("group_id")
    .eq("hotel_id", hotelId)
    .maybeSingle();
  if (existing)
    return errorResponse("Hotel already belongs to a group", 409, req);

  if (payload.action === "join") {
    const code =
      typeof payload.code === "string" ? payload.code.trim().toUpperCase() : "";
    const { data: group } = await supabaseAdmin
      .from("hotel_groups")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!group) return errorResponse("Group code not found", 404, req);
    const { error } = await supabaseAdmin
      .from("hotel_group_hotels")
      .insert({ group_id: group.id, hotel_id: hotelId, role: "member" });
    if (error) throw error;
    return cors(NextResponse.json({ success: true, groupId: group.id }), req);
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (name.length < 2 || name.length > 160) {
    return errorResponse("Invalid group name", 400, req);
  }
  const code = generateHotelGroupCode();
  const { data: group, error } = await supabaseAdmin
    .from("hotel_groups")
    .insert({ name, code, created_by: user.id })
    .select("*")
    .single();
  if (error) throw error;
  const { error: memberError } = await supabaseAdmin
    .from("hotel_group_hotels")
    .insert({ group_id: group.id, hotel_id: hotelId, role: "leader" });
  if (memberError) {
    await supabaseAdmin.from("hotel_groups").delete().eq("id", group.id);
    throw memberError;
  }
  return cors(
    NextResponse.json({ success: true, group }, { status: 201 }),
    req,
  );
}
