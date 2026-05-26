import { verifyToken } from "@clerk/backend";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export type SupabaseUser = NonNullable<
  Awaited<ReturnType<typeof getOrSyncUserByClerkId>>
>;

export async function resolveSupabaseUserFromRequest(
  req: Request,
): Promise<SupabaseUser | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearerToken = authHeader.replace("Bearer ", "");

  let clerkUserId: string | null = null;
  if (bearerToken) {
    const { sub } = await verifyToken(bearerToken, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    clerkUserId = sub ?? null;
  } else {
    const session = await auth();
    clerkUserId = session.userId;
  }

  if (!clerkUserId) return null;
  return getOrSyncUserByClerkId(clerkUserId);
}

export async function requireAdminSupabaseUser(
  allowedTypes: string[] = ["staff", "founder", "admin"],
): Promise<SupabaseUser> {
  const user = await currentUser();
  const userType = user?.publicMetadata?.userType;
  if (!user || !allowedTypes.includes(String(userType))) {
    throw new Error("Forbidden");
  }

  const supabaseUser = await getOrSyncUserByClerkId(user.id);
  if (!supabaseUser) {
    throw new Error("User not found");
  }

  return supabaseUser;
}
