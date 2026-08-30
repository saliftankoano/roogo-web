import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getMembershipsForUser } from "@/lib/hotel-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return errorResponse("Unauthorized", 401, req);
  const adminMembership = (await getMembershipsForUser(user.id)).find(
    (membership) => membership.role === "admin",
  );
  if (!adminMembership) return errorResponse("Forbidden", 403, req);
  const { data: groupMembership } = await supabaseAdmin
    .from("hotel_group_hotels")
    .select("group_id, role")
    .eq("hotel_id", adminMembership.hotelId)
    .maybeSingle();
  if (!groupMembership) {
    return cors(
      NextResponse.json({
        success: true,
        group: null,
        hotelId: adminMembership.hotelId,
      }),
      req,
    );
  }
  const { data: group, error } = await supabaseAdmin
    .from("hotel_groups")
    .select(
      "id, name, code, created_at, hotels:hotel_group_hotels(role, joined_at, hotel:hotel_id(id, name, city, phone, business_verification_status))",
    )
    .eq("id", groupMembership.group_id)
    .single();
  if (error) throw error;
  return cors(
    NextResponse.json({
      success: true,
      group: { ...group, role: groupMembership.role },
      hotelId: adminMembership.hotelId,
    }),
    req,
  );
}
