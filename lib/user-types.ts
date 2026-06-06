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
