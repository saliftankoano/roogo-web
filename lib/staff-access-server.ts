import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import {
  type EffectiveStaffLevel,
  type StaffCapability,
  resolveStaffLevel,
  staffLevelCan,
  staffLevelsEnforced,
} from "@/lib/staff-access";

type MetadataLike = Record<string, unknown> | null | undefined;

/** The level a Clerk user acts with, from publicMetadata (fresh from Clerk). */
export function staffLevelFromMetadata(
  metadata: MetadataLike,
): EffectiveStaffLevel | null {
  return resolveStaffLevel(
    {
      userType: String(metadata?.userType ?? metadata?.user_type ?? ""),
      staffLevel: String(metadata?.staffLevel ?? ""),
    },
    { enforced: staffLevelsEnforced() },
  );
}

/** The level of a row in public.users, which mirrors the Clerk metadata. */
export function staffLevelFromUserRow(
  user: { user_type?: string | null; staff_level?: string | null } | null,
): EffectiveStaffLevel | null {
  if (!user) return null;
  return resolveStaffLevel(
    { userType: user.user_type, staffLevel: user.staff_level },
    { enforced: staffLevelsEnforced() },
  );
}

export function userRowCan(
  user: { user_type?: string | null; staff_level?: string | null } | null,
  capability: StaffCapability,
): boolean {
  return staffLevelCan(staffLevelFromUserRow(user), capability);
}

export function insufficientLevelResponse() {
  return NextResponse.json(
    { error: "Forbidden", code: "insufficient_staff_level" },
    { status: 403 },
  );
}

/**
 * For routes that read the Clerk session directly. Returns the Clerk user id
 * and level, or a ready 401/403 response.
 */
export async function requireClerkStaffCapability(
  capability: StaffCapability,
): Promise<
  | { clerkUserId: string; level: EffectiveStaffLevel; error?: undefined }
  | { error: NextResponse; clerkUserId?: undefined; level?: undefined }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const clerkUser = await currentUser();
  const level = staffLevelFromMetadata(clerkUser?.publicMetadata);
  if (!level || !staffLevelCan(level, capability)) {
    return { error: insufficientLevelResponse() };
  }
  return { clerkUserId: userId, level };
}
