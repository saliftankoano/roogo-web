import { NextResponse } from "next/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getHotelMembership } from "@/lib/hotel-auth";
import { generateHotelInviteCode } from "@/lib/booking-codes";

const INVITE_TTL_DAYS = 7;

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const membership = await getHotelMembership(user.id, id);
    if (membership?.role !== "admin") {
      return errorResponse("Forbidden", 403, req);
    }

    const { data: invites, error } = await supabaseAdmin
      .from("hotel_invites")
      .select("id, code, role, expires_at, max_uses, used_count, revoked_at, created_at")
      .eq("hotel_id", id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;

    // The list is titled "active codes": exhausted invites would be rejected
    // by consume_hotel_invite, so don't present them as shareable.
    const usable = (invites ?? []).filter(
      (invite) => invite.used_count < invite.max_uses,
    );

    return cors(NextResponse.json({ invites: usable }), req);
  } catch (error) {
    console.error("Error listing hotel invites:", error);
    return errorResponse("Internal server error", 500, req);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const membership = await getHotelMembership(user.id, id);
    if (membership?.role !== "admin") {
      return errorResponse("Forbidden", 403, req);
    }

    const body = await req.json().catch(() => ({}));
    const role = body?.role === "admin" ? "admin" : "staff";

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    // Retry on the (unlikely) unique-code collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateHotelInviteCode();
      const { data: invite, error } = await supabaseAdmin
        .from("hotel_invites")
        .insert({
          hotel_id: id,
          code,
          role,
          created_by: user.id,
          expires_at: expiresAt.toISOString(),
        })
        .select("id, code, role, expires_at, max_uses, used_count, created_at")
        .single();

      if (!error) {
        return cors(
          NextResponse.json({ success: true, invite }, { status: 201 }),
          req,
        );
      }
      if (error.code !== "23505") throw error;
    }
    return errorResponse("Could not generate invite code", 500, req);
  } catch (error) {
    console.error("Error creating hotel invite:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
