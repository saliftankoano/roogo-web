import { resolveClerkId } from "@/lib/request-auth";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export type ApiUser = {
  id: string;
  clerk_id: string | null;
  user_type: string | null;
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

export async function getStaffOrFounder(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!isStaffOrFounder(user)) return null;
  return user;
}
