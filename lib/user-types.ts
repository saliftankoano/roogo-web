const STAFF_USER_TYPES = new Set(["staff", "founder", "admin"]);

type UserMetadata = Record<string, unknown> | null | undefined;

export function getUserTypeFromMetadata(
  metadata: UserMetadata,
): string | null {
  const value = metadata?.userType ?? metadata?.user_type;
  return typeof value === "string" ? value.toLowerCase() : null;
}

export function isStaffLikeUserType(userType: string | null | undefined) {
  return !!userType && STAFF_USER_TYPES.has(userType.toLowerCase());
}

export function isStaffLikeMetadata(metadata: UserMetadata) {
  return isStaffLikeUserType(getUserTypeFromMetadata(metadata));
}

/**
 * The self-service profile route (`POST /api/clerk/users/me/metadata`) may set
 * or change a member's own account type, but never to or from a staff-like
 * type: staff comes only from the staff code or an invitation, founder only
 * from the Clerk console. Returns an error message, or null when allowed.
 */
export function selfServiceUserTypeError(
  previous: string | null | undefined,
  requested: string | null | undefined,
): string | null {
  if (!requested) return null;
  const from = (previous ?? "").toLowerCase();
  const to = requested.toLowerCase();
  if (to === from) return null;
  if (STAFF_USER_TYPES.has(to)) return "This account type cannot be self-assigned";
  if (STAFF_USER_TYPES.has(from)) return "A staff account type cannot be changed here";
  return null;
}
