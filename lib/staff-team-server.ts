import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  ASSIGNABLE_STAFF_LEVELS,
  type AssignableStaffLevel,
  type EffectiveStaffLevel,
  canChangeStaffMember,
  canGrantStaffLevel,
  isAssignableStaffLevel,
  staffLevelCan,
} from "@/lib/staff-access";
import {
  requireClerkStaffCapability,
  staffLevelFromUserRow,
} from "@/lib/staff-access-server";
import {
  STUDIO_CAPS_BY_LEVEL,
  type StaffAccessLogAction,
  emailMatchesInvitation,
  hashInvitationToken,
  invitationExpiresAt,
  invitationState,
  newInvitationToken,
  normalizeInvitationEmail,
  normalizeReason,
} from "@/lib/staff-team";

/** An error the route can show as is, with its HTTP status. */
export class TeamError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type TeamActor = {
  userId: string;
  fullName: string | null;
  level: EffectiveStaffLevel;
};

type UserRow = {
  id: string;
  clerk_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
  staff_level: string | null;
  created_at?: string | null;
};

const MEMBER_COLUMNS =
  "id, clerk_id, email, full_name, avatar_url, user_type, staff_level, created_at";

async function writeLog(entry: {
  action: StaffAccessLogAction;
  actor: { id: string; name: string | null } | null;
  target?: { id: string | null; name: string | null; email: string | null };
  fromLevel?: string | null;
  toLevel?: string | null;
  reason?: string | null;
}) {
  const { error } = await supabaseAdmin.from("staff_access_log").insert({
    action: entry.action,
    actor_user_id: entry.actor?.id ?? null,
    actor_name: entry.actor?.name ?? null,
    target_user_id: entry.target?.id ?? null,
    target_name: entry.target?.name ?? null,
    target_email: entry.target?.email ?? null,
    from_level: entry.fromLevel ?? null,
    to_level: entry.toLevel ?? null,
    reason: entry.reason ?? null,
  });
  // The journal is how the founder sees every grant. A grant that cannot be
  // recorded must not stand, so callers write the log first or undo.
  if (error) {
    console.error("staff_access_log insert failed:", error);
    throw new TeamError("Impossible d'écrire le journal des accès.", 500);
  }
}

async function applyStudioCaps(userId: string, level: AssignableStaffLevel) {
  const caps = STUDIO_CAPS_BY_LEVEL[level];
  const { error } = await supabaseAdmin.from("studio_user_limits").upsert(
    {
      user_id: userId,
      monthly_cap_usd: caps.other,
      monthly_video_cap_usd: caps.video,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    // Not fatal: the Studio falls back to its defaults. Say so in the logs.
    console.error("Could not apply Studio caps for new level:", error);
  }
}

async function setClerkAccess(
  clerkId: string,
  access: { userType: "staff" | "renter"; staffLevel: AssignableStaffLevel | null },
) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkId, {
    publicMetadata: {
      userType: access.userType,
      // null removes the key in Clerk's metadata merge.
      staffLevel: access.staffLevel,
    },
    privateMetadata: { userType: access.userType },
  });
}

async function setRowAccess(
  userId: string,
  access: { userType: "staff" | "renter"; staffLevel: AssignableStaffLevel | null },
) {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ user_type: access.userType, staff_level: access.staffLevel })
    .eq("id", userId);
  if (error) {
    console.error("users update failed while changing staff access:", error);
    throw new TeamError("Impossible d'enregistrer le changement.", 500);
  }
}

async function getMember(userId: string): Promise<UserRow> {
  const { data } = await supabaseAdmin
    .from("users")
    .select(MEMBER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new TeamError("Personne introuvable.", 404);
  return data as UserRow;
}

export async function listTeam(actor: TeamActor) {
  const [membersRes, invitationsRes, logRes] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select(MEMBER_COLUMNS)
      .in("user_type", ["staff", "founder"])
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("staff_invitations")
      .select("id, email, level, reason, created_at, expires_at, accepted_at, revoked_at, invited_by")
      .order("created_at", { ascending: false })
      .limit(30),
    actor.level === "founder"
      ? supabaseAdmin
          .from("staff_access_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      : supabaseAdmin
          .from("staff_access_log")
          .select("*")
          .eq("actor_user_id", actor.userId)
          .order("created_at", { ascending: false })
          .limit(50),
  ]);

  const members = ((membersRes.data ?? []) as UserRow[]).map((row) => {
    const level = staffLevelFromUserRow(row);
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      avatarUrl: row.avatar_url,
      userType: row.user_type,
      // "legacy" is staff who have no level yet.
      level: level ?? null,
      isYou: row.id === actor.userId,
      canChange: canChangeStaffMember({
        actorLevel: actor.level,
        actorUserId: actor.userId,
        targetUserId: row.id,
        currentLevel: level,
      }),
    };
  });

  const invitations = (invitationsRes.data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    level: row.level as AssignableStaffLevel,
    reason: (row.reason as string | null) ?? null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    state: invitationState(row),
    // A director sees and revokes only the invitations they sent.
    canRevoke:
      invitationState(row) === "open" &&
      (actor.level === "founder" || row.invited_by === actor.userId),
  }));

  const assignableLevels = ASSIGNABLE_STAFF_LEVELS.filter((level) =>
    canGrantStaffLevel({
      actorLevel: actor.level,
      actorUserId: actor.userId,
      targetLevel: level,
    }),
  );

  return {
    you: { userId: actor.userId, level: actor.level },
    assignableLevels,
    members,
    invitations:
      actor.level === "founder"
        ? invitations
        : invitations.filter((invitation) => invitation.canRevoke || invitation.state !== "open"),
    log: logRes.data ?? [],
  };
}

export async function createInvitation(
  actor: TeamActor,
  input: { email: unknown; level: unknown; reason: unknown },
) {
  const email = normalizeInvitationEmail(input.email);
  if (!email) throw new TeamError("Adresse e-mail invalide.");
  if (!isAssignableStaffLevel(input.level)) throw new TeamError("Niveau inconnu.");
  const level = input.level;
  const reason = normalizeReason(input.reason);

  if (
    !canGrantStaffLevel({
      actorLevel: actor.level,
      actorUserId: actor.userId,
      targetLevel: level,
    })
  ) {
    throw new TeamError("Vous ne pouvez pas donner ce niveau.", 403);
  }

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, user_type")
    .ilike("email", email)
    .maybeSingle();
  if (existing && (existing.user_type === "staff" || existing.user_type === "founder")) {
    throw new TeamError(
      "Cette personne est déjà dans l'équipe. Changez son niveau dans la liste.",
      409,
    );
  }

  const { token, tokenHash } = newInvitationToken();
  const { data: invitation, error } = await supabaseAdmin
    .from("staff_invitations")
    .insert({
      email,
      level,
      token_hash: tokenHash,
      invited_by: actor.userId,
      reason,
      expires_at: invitationExpiresAt().toISOString(),
    })
    .select("id, email, level, expires_at")
    .single();

  if (error || !invitation) {
    if (error?.code === "23505") {
      throw new TeamError(
        "Une invitation est déjà ouverte pour cette adresse. Annulez-la d'abord.",
        409,
      );
    }
    console.error("staff_invitations insert failed:", error);
    throw new TeamError("Impossible de créer l'invitation.", 500);
  }

  try {
    await writeLog({
      action: "invite",
      actor: { id: actor.userId, name: actor.fullName },
      target: { id: null, name: null, email },
      toLevel: level,
      reason,
    });
  } catch (logError) {
    await supabaseAdmin.from("staff_invitations").delete().eq("id", invitation.id);
    throw logError;
  }

  return {
    invitation,
    // The token exists only here. Only its hash is stored.
    path: `/personnel/rejoindre?invitation=${token}`,
  };
}

export async function revokeInvitation(actor: TeamActor, invitationId: string) {
  const { data: invitation } = await supabaseAdmin
    .from("staff_invitations")
    .select("id, email, level, invited_by, accepted_at, revoked_at, expires_at")
    .eq("id", invitationId)
    .maybeSingle();
  if (!invitation) throw new TeamError("Invitation introuvable.", 404);
  if (invitationState(invitation) !== "open") {
    throw new TeamError("Cette invitation n'est plus ouverte.", 409);
  }
  if (actor.level !== "founder" && invitation.invited_by !== actor.userId) {
    throw new TeamError("Vous ne pouvez annuler que vos propres invitations.", 403);
  }

  await writeLog({
    action: "invite_revoked",
    actor: { id: actor.userId, name: actor.fullName },
    target: { id: null, name: null, email: invitation.email },
    toLevel: invitation.level,
  });
  const { error } = await supabaseAdmin
    .from("staff_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (error) throw new TeamError("Impossible d'annuler l'invitation.", 500);
}

export async function setMemberLevel(
  actor: TeamActor,
  targetUserId: string,
  newLevel: unknown,
  rawReason: unknown,
) {
  if (!isAssignableStaffLevel(newLevel)) throw new TeamError("Niveau inconnu.");
  const reason = normalizeReason(rawReason);
  const target = await getMember(targetUserId);
  if (target.user_type !== "staff") {
    throw new TeamError("Cette personne n'est pas dans le personnel.", 409);
  }
  const currentLevel = staffLevelFromUserRow(target);

  if (
    !canChangeStaffMember({
      actorLevel: actor.level,
      actorUserId: actor.userId,
      targetUserId,
      currentLevel,
    }) ||
    !canGrantStaffLevel({
      actorLevel: actor.level,
      actorUserId: actor.userId,
      targetUserId,
      targetLevel: newLevel,
    })
  ) {
    throw new TeamError("Vous ne pouvez pas faire ce changement.", 403);
  }
  if (target.staff_level === newLevel) return;
  if (!target.clerk_id) throw new TeamError("Compte non relié à Clerk.", 409);

  await writeLog({
    action: "level_set",
    actor: { id: actor.userId, name: actor.fullName },
    target: { id: target.id, name: target.full_name, email: target.email },
    fromLevel: target.staff_level ?? (currentLevel === "legacy" ? "none" : currentLevel),
    toLevel: newLevel,
    reason,
  });

  await setClerkAccess(target.clerk_id, { userType: "staff", staffLevel: newLevel });
  try {
    await setRowAccess(target.id, { userType: "staff", staffLevel: newLevel });
  } catch (error) {
    // Put Clerk back so the two never disagree.
    await setClerkAccess(target.clerk_id, {
      userType: "staff",
      staffLevel: isAssignableStaffLevel(target.staff_level) ? target.staff_level : null,
    }).catch((revertError) => console.error("Clerk revert failed:", revertError));
    throw error;
  }
  await applyStudioCaps(target.id, newLevel);
}

export async function removeMemberAccess(
  actor: TeamActor,
  targetUserId: string,
  rawReason: unknown,
) {
  const reason = normalizeReason(rawReason);
  const target = await getMember(targetUserId);
  if (target.user_type !== "staff") {
    throw new TeamError("Cette personne n'est pas dans le personnel.", 409);
  }
  const currentLevel = staffLevelFromUserRow(target);
  if (
    !canChangeStaffMember({
      actorLevel: actor.level,
      actorUserId: actor.userId,
      targetUserId,
      currentLevel,
    })
  ) {
    throw new TeamError("Vous ne pouvez pas retirer cet accès.", 403);
  }
  if (!target.clerk_id) throw new TeamError("Compte non relié à Clerk.", 409);

  await writeLog({
    action: "access_removed",
    actor: { id: actor.userId, name: actor.fullName },
    target: { id: target.id, name: target.full_name, email: target.email },
    fromLevel: target.staff_level ?? "none",
    toLevel: null,
    reason,
  });
  await setClerkAccess(target.clerk_id, { userType: "renter", staffLevel: null });
  try {
    await setRowAccess(target.id, { userType: "renter", staffLevel: null });
  } catch (error) {
    await setClerkAccess(target.clerk_id, {
      userType: "staff",
      staffLevel: isAssignableStaffLevel(target.staff_level) ? target.staff_level : null,
    }).catch((revertError) => console.error("Clerk revert failed:", revertError));
    throw error;
  }
}

/**
 * Turns a signed-in person into staff with the invited level. Checks again, at
 * acceptance time, that the person who invited still holds the right to give
 * that level.
 */
export async function acceptInvitation(clerkUserId: string, token: unknown) {
  const generic = new TeamError("Invitation invalide ou expirée.", 400);
  if (typeof token !== "string" || token.length < 20) throw generic;

  const { data: invitation } = await supabaseAdmin
    .from("staff_invitations")
    .select("id, email, level, invited_by, reason, accepted_at, revoked_at, expires_at")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();
  if (!invitation || invitationState(invitation) !== "open") throw generic;
  if (!isAssignableStaffLevel(invitation.level)) throw generic;
  const level = invitation.level;

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkUserId);
  const verifiedEmails = clerkUser.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress);
  if (!emailMatchesInvitation(invitation.email, verifiedEmails)) {
    throw new TeamError(
      "Cette invitation est pour une autre adresse e-mail. Connectez-vous avec l'adresse invitée.",
      403,
    );
  }

  const { data: inviter } = invitation.invited_by
    ? await supabaseAdmin
        .from("users")
        .select(MEMBER_COLUMNS)
        .eq("id", invitation.invited_by)
        .maybeSingle()
    : { data: null };
  const inviterLevel = inviter ? staffLevelFromUserRow(inviter as UserRow) : null;
  if (
    !inviter ||
    !staffLevelCan(inviterLevel, "team.manage") ||
    !canGrantStaffLevel({
      actorLevel: inviterLevel,
      actorUserId: (inviter as UserRow).id,
      targetLevel: level,
    })
  ) {
    throw new TeamError("Cette invitation n'est plus valable.", 400);
  }

  const { data: existingRow } = await supabaseAdmin
    .from("users")
    .select(MEMBER_COLUMNS)
    .eq("clerk_id", clerkUserId)
    .maybeSingle();
  if (!existingRow) {
    throw new TeamError("Compte introuvable. Réessayez dans un instant.", 404);
  }
  const me = existingRow as UserRow;
  if (me.user_type === "founder") {
    throw new TeamError("Ce compte est déjà le compte fondateur.", 409);
  }
  if (me.user_type === "staff") {
    const myLevel = staffLevelFromUserRow(me);
    if (
      !canChangeStaffMember({
        actorLevel: inviterLevel,
        actorUserId: (inviter as UserRow).id,
        targetUserId: me.id,
        currentLevel: myLevel,
      })
    ) {
      throw new TeamError("Vous ne pouvez pas changer ce niveau avec cette invitation.", 403);
    }
  }

  const inviterRow = inviter as UserRow;
  await writeLog({
    action: "accepted",
    actor: { id: me.id, name: me.full_name },
    target: { id: me.id, name: me.full_name, email: me.email },
    fromLevel: me.user_type === "staff" ? (me.staff_level ?? "none") : null,
    toLevel: level,
    reason: `Invité par ${inviterRow.full_name ?? "un responsable"}${invitation.reason ? `. ${invitation.reason}` : ""}`.slice(0, 300),
  });

  await setClerkAccess(clerkUserId, { userType: "staff", staffLevel: level });
  try {
    await setRowAccess(me.id, { userType: "staff", staffLevel: level });
  } catch (error) {
    await setClerkAccess(clerkUserId, {
      userType: me.user_type === "staff" ? "staff" : "renter",
      staffLevel: isAssignableStaffLevel(me.staff_level) ? me.staff_level : null,
    }).catch((revertError) => console.error("Clerk revert failed:", revertError));
    throw error;
  }
  await applyStudioCaps(me.id, level);

  const { error: markError } = await supabaseAdmin
    .from("staff_invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_by: me.id })
    .eq("id", invitation.id);
  if (markError) console.error("Could not mark invitation accepted:", markError);

  return { level };
}

/** For the team routes: the signed-in person, who must hold team.manage. */
export async function requireTeamActor(): Promise<
  | { actor: TeamActor; error?: undefined }
  | { error: NextResponse; actor?: undefined }
> {
  const result = await requireClerkStaffCapability("team.manage");
  if (result.error) return { error: result.error };
  const row = await getOrSyncUserByClerkId(result.clerkUserId);
  if (!row) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }
  return {
    actor: {
      userId: row.id as string,
      fullName: (row.full_name as string | null) ?? null,
      level: result.level,
    },
  };
}

export function teamErrorResponse(error: unknown) {
  if (error instanceof TeamError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Team route error:", error);
  return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
}
