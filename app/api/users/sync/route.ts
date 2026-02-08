import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createUserInSupabase, ClerkUserData } from "@/lib/user-sync";

/**
 * POST /api/users/sync
 * 
 * Syncs the authenticated Clerk user to Supabase.
 * This is a fallback in case the webhook hasn't fired yet.
 */
export async function POST() {
  try {
    // Authenticate with Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get full user data from Clerk
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Normalize Clerk user data to match expected structure
    const normalizedUser: ClerkUserData = {
      id: clerkUser.id,
      email_addresses: clerkUser.emailAddresses?.map(e => ({ email_address: e.emailAddress })),
      first_name: clerkUser.firstName ?? undefined,
      last_name: clerkUser.lastName ?? undefined,
      image_url: clerkUser.imageUrl ?? undefined,
      phone_numbers: clerkUser.phoneNumbers?.map(p => ({ phone_number: p.phoneNumber })),
      public_metadata: clerkUser.publicMetadata as ClerkUserData["public_metadata"],
      private_metadata: clerkUser.privateMetadata as ClerkUserData["private_metadata"],
      unsafe_metadata: clerkUser.unsafeMetadata as ClerkUserData["unsafe_metadata"],
    };

    // Use the proper user sync function that handles type mapping
    const result = await createUserInSupabase(normalizedUser);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: result.id,
      message: "User synced successfully",
    });
  } catch (error: unknown) {
    console.error("Error in user sync:", error);
    return NextResponse.json(
      { error: "Failed to sync user", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
