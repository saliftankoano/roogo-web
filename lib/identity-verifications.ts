import { currentUser, auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getOrSyncUserByClerkId } from "@/lib/user-sync";
import type { StaffCapability } from "@/lib/staff-access";
import { staffLevelCan } from "@/lib/staff-access";
import {
  insufficientLevelResponse,
  staffLevelFromMetadata,
} from "@/lib/staff-access-server";

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

type IdentityVerificationStatus =
  | "unsubmitted"
  | "pending"
  | "approved"
  | "rejected";

export async function syncClerkIdentityVerificationMetadata({
  clerkUserId,
  status,
  verifiedAt = null,
}: {
  clerkUserId: string | null | undefined;
  status: IdentityVerificationStatus;
  verifiedAt?: string | null;
}) {
  if (!clerkUserId) return false;

  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: {
        identityVerificationStatus: status,
        identityVerified: status === "approved",
        identityVerifiedAt: status === "approved" ? verifiedAt : null,
      },
    });
    return true;
  } catch (error) {
    console.error("Failed to sync Clerk identity verification metadata:", error);
    return false;
  }
}

export async function requireStaffSupabaseUser(capability?: StaffCapability) {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const clerkUser = await currentUser();
  const level = staffLevelFromMetadata(clerkUser?.publicMetadata);

  if (!level) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  if (capability && !staffLevelCan(level, capability)) {
    return { error: insufficientLevelResponse() };
  }

  const supabaseUser = await getOrSyncUserByClerkId(userId);
  if (!supabaseUser) {
    return {
      error: NextResponse.json({ error: "User not found" }, { status: 404 }),
    };
  }

  return { clerkUserId: userId, supabaseUser };
}
