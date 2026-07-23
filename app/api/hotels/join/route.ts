import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { cors, corsOptions, errorResponse } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedUser,
  isStaffOrFounder,
  type ApiUser,
} from "@/lib/api-auth";

// Best-effort: membership is the source of truth and the mobile onboarding
// completion sets userType authoritatively via the metadata route, so a Clerk
// hiccup here must not fail a join whose membership already committed.
// Roogo staff/founders keep their user_type: overwriting it to 'hotel' would
// silently strip their review-queue and publish permissions.
async function mirrorHotelUserType(user: ApiUser) {
  if (isStaffOrFounder(user)) return;
  try {
    if (user.clerk_id) {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(user.clerk_id);
      await client.users.updateUser(user.clerk_id, {
        publicMetadata: {
          ...clerkUser.publicMetadata,
          userType: "hotel",
        },
      });
    }
    // supabase-js returns errors instead of throwing: check explicitly or a
    // failed mirror leaves users.user_type stale with zero log output.
    const { error: userTypeError } = await supabaseAdmin
      .from("users")
      .update({ user_type: "hotel" })
      .eq("id", user.id);
    if (userTypeError) throw userTypeError;
  } catch (error) {
    console.error(
      `Hotel userType mirror failed (non-fatal) for user ${user.id}:`,
      error,
    );
  }
}

// Single success tail for the three exit paths (idempotent retry, twin
// recovery, fresh join) so the response shape cannot drift between them.
async function respondJoinSuccess(
  user: ApiUser,
  hotelId: string,
  role: string,
  req: Request,
) {
  await mirrorHotelUserType(user);
  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("*")
    .eq("id", hotelId)
    .single();
  if (hotelError) throw hotelError;
  return cors(NextResponse.json({ success: true, hotel, role }), req);
}

export async function OPTIONS(req: Request) {
  return corsOptions(req);
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return errorResponse("Unauthorized", 401, req);

    const body = await req.json().catch(() => null);
    const code =
      typeof body?.code === "string"
        ? body.code.trim().toUpperCase().replace(/\s+/g, "")
        : "";
    if (!code) return errorResponse("Invite code is required", 400, req);

    // Read the invite first (no consumption) so retries can be idempotent.
    const { data: inviteRow, error: inviteError } = await supabaseAdmin
      .from("hotel_invites")
      .select("id, hotel_id, role")
      .eq("code", code)
      .maybeSingle();
    if (inviteError) throw inviteError;
    if (!inviteRow) {
      return errorResponse("Invalid or expired invite code", 403, req);
    }

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from("hotel_members")
      .select("hotel_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1);
    if (existingError) throw existingError;
    const existing = existingRows?.[0];

    // Retry after a partial failure: already a member of THIS hotel counts as
    // success (finish the mirror), without consuming another invite use.
    if (existing?.hotel_id === inviteRow.hotel_id) {
      return await respondJoinSuccess(user, inviteRow.hotel_id, existing.role, req);
    }
    if (existing) {
      return errorResponse("You already belong to a hotel", 409, req);
    }

    // Atomic validate-and-increment: expired/revoked/exhausted codes return
    // no row, and concurrent joins can never exceed max_uses.
    const { data: consumedRows, error: consumeError } = await supabaseAdmin.rpc(
      "consume_hotel_invite",
      { p_code: code },
    );
    if (consumeError) throw consumeError;
    const invite = Array.isArray(consumedRows) ? consumedRows[0] : consumedRows;
    if (!invite) {
      return errorResponse("Invalid or expired invite code", 403, req);
    }

    // Reactivate a previously REMOVED membership, else insert a new one.
    // The status filter matters: without it, a concurrent twin would match
    // the sibling's freshly-inserted ACTIVE row, skip the insert/23505 path,
    // and never release its consumed invite use.
    const membershipRow = {
      role: invite.role,
      status: "active",
      invited_by: invite.created_by ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: reactivated, error: reactivateError } = await supabaseAdmin
      .from("hotel_members")
      .update(membershipRow)
      .eq("hotel_id", invite.hotel_id)
      .eq("user_id", user.id)
      .eq("status", "removed")
      .select("id")
      .maybeSingle();
    if (reactivateError) {
      await supabaseAdmin
        .rpc("release_hotel_invite_use", { p_invite_id: invite.id })
        .then(undefined, () => {});
      throw reactivateError;
    }
    if (!reactivated) {
      const { error: insertError } = await supabaseAdmin
        .from("hotel_members")
        .insert({
          ...membershipRow,
          hotel_id: invite.hotel_id,
          user_id: user.id,
        });
      if (insertError) {
        // Give the consumed use back before reporting the failure.
        await supabaseAdmin
          .rpc("release_hotel_invite_use", { p_invite_id: invite.id })
          .then(undefined, () => {});
        if (insertError.code === "23505") {
          // Concurrent twin of this same join, or a join to another hotel.
          // A twin already created this exact membership: treat as success.
          const { data: twinRows } = await supabaseAdmin
            .from("hotel_members")
            .select("role")
            .eq("hotel_id", invite.hotel_id)
            .eq("user_id", user.id)
            .eq("status", "active")
            .limit(1);
          if (twinRows && twinRows.length > 0) {
            return await respondJoinSuccess(
              user,
              invite.hotel_id,
              twinRows[0].role,
              req,
            );
          }
          return errorResponse("You already belong to a hotel", 409, req);
        }
        throw insertError;
      }
    }

    return await respondJoinSuccess(user, invite.hotel_id, invite.role, req);
  } catch (error) {
    console.error("Error joining hotel:", error);
    return errorResponse("Internal server error", 500, req);
  }
}
