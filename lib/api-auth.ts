import { resolveClerkId } from "@/lib/request-auth";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import type { StaffCapability } from "@/lib/staff-access";
import { userRowCan } from "@/lib/staff-access-server";

export type ApiUser = {
  id: string;
  clerk_id: string | null;
  user_type: string | null;
  /** Job title of a staff member (migration 089). */
  staff_level?: string | null;
  full_name?: string | null;
  email?: string | null;
};

export function isStaffOrFounder(user: Pick<ApiUser, "user_type"> | null) {
  return user?.user_type === "staff" || user?.user_type === "founder";
}

export function isOwnerAgentStaffOrFounder(
  user: Pick<ApiUser, "user_type"> | null,
) {
  return ["owner", "agent", "staff", "founder"].includes(
    user?.user_type ?? "",
  );
}

export async function getAuthenticatedUser(req: Request) {
  const clerkId = await resolveClerkId(req);
  if (!clerkId) return null;

  return (await getOrSyncUserByClerkId(clerkId)) as ApiUser | null;
}

/** Whether the signed-in staff member may do `capability` (see lib/staff-access.ts). */
export function userCan(user: ApiUser | null, capability: StaffCapability) {
  return userRowCan(user, capability);
}

/**
 * Staff or founder, and, when a capability is given, a level that holds it.
 * Returns null otherwise, so the route answers as it always did.
 */
export async function getStaffOrFounder(
  req: Request,
  capability?: StaffCapability,
) {
  const user = await getAuthenticatedUser(req);
  if (!isStaffOrFounder(user)) return null;
  if (capability && !userCan(user, capability)) return null;
  return user;
}
