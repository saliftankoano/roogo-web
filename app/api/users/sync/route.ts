import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createUserInSupabase } from "@/lib/user-sync";

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

    // Log the Clerk user structure for debugging
    console.log("Clerk user data:", JSON.stringify({
      id: clerkUser.id,
      emailAddresses: clerkUser.emailAddresses,
      email_addresses: (clerkUser as any).email_addresses,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      publicMetadata: clerkUser.publicMetadata,
    }, null, 2));

    // Normalize Clerk user data to match expected structure
    const normalizedUser = {
      id: clerkUser.id,
      // Handle both camelCase (new) and snake_case (old) property names
      email_addresses: clerkUser.emailAddresses?.map(e => ({ email_address: e.emailAddress })) || 
                       (clerkUser as any).email_addresses,
      first_name: clerkUser.firstName || (clerkUser as any).first_name,
      last_name: clerkUser.lastName || (clerkUser as any).last_name,
      image_url: clerkUser.imageUrl || (clerkUser as any).image_url,
      phone_numbers: clerkUser.phoneNumbers?.map(p => ({ phone_number: p.phoneNumber })) ||
                     (clerkUser as any).phone_numbers,
      public_metadata: clerkUser.publicMetadata,
      private_metadata: (clerkUser as any).privateMetadata || (clerkUser as any).private_metadata,
      unsafe_metadata: clerkUser.unsafeMetadata || (clerkUser as any).unsafe_metadata,
    };

    // Use the proper user sync function that handles type mapping
    const result = await createUserInSupabase(normalizedUser as any);

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
  } catch (error: any) {
    console.error("Error in user sync:", error);
    return NextResponse.json(
      { error: "Failed to sync user", details: error.message },
      { status: 500 }
    );
  }
}
