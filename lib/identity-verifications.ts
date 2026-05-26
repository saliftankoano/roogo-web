import { currentUser, auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";

export const IDENTITY_DOCUMENTS_BUCKET = "identity-documents";
export const IDENTITY_SIGNED_URL_TTL_SECONDS = 60 * 30;

export const VERIFIABLE_USER_TYPES = new Set(["owner", "agent"]);
export const STAFF_USER_TYPES = new Set(["staff", "founder", "admin"]);

export function isVerifiableUserType(userType?: string | null) {
  return !!userType && VERIFIABLE_USER_TYPES.has(userType);
}

export function isStaffUserType(userType?: string | null) {
  return !!userType && STAFF_USER_TYPES.has(userType);
}

export async function requireStaffSupabaseUser() {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const clerkUser = await currentUser();
  const userType = (
    clerkUser?.publicMetadata?.userType ||
    clerkUser?.publicMetadata?.user_type
  ) as string | undefined;

  if (!isStaffUserType(userType)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const supabaseUser = await getOrSyncUserByClerkId(userId);
  if (!supabaseUser) {
    return {
      error: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }

  return { clerkUserId: userId, supabaseUser };
}
