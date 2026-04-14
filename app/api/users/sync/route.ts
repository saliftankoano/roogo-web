import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { verifyToken } from "@clerk/backend";
import { NextResponse } from "next/server";
import { createUserInSupabase, ClerkUserData } from "@/lib/user-sync";

/**
 * POST /api/users/sync
 *
 * Syncs the authenticated Clerk user to Supabase.
 * Accepts both:
 *  - Cookie-based session (web app via @clerk/nextjs auth())
 *  - Bearer token (mobile app via Authorization header)
 */
export async function POST(req: Request) {
  try {
    let normalizedUser: ClerkUserData | null = null;

    // Try Bearer token first (mobile app)
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.replace("Bearer ", "");

    if (bearerToken) {
      try {
        const { sub: userId } = await verifyToken(bearerToken, {
          secretKey: process.env.CLERK_SECRET_KEY!,
        });
        if (!userId) throw new Error("No user ID in token");
        const client = await clerkClient();
        const clerkUser = await client.users.getUser(userId);
        normalizedUser = {
          id: clerkUser.id,
          email_addresses: clerkUser.emailAddresses?.map((e) => ({
            email_address: e.emailAddress,
          })),
          first_name: clerkUser.firstName ?? undefined,
          last_name: clerkUser.lastName ?? undefined,
          image_url: clerkUser.imageUrl ?? undefined,
          phone_numbers: clerkUser.phoneNumbers?.map((p) => ({
            phone_number: p.phoneNumber,
          })),
          public_metadata:
            clerkUser.publicMetadata as ClerkUserData["public_metadata"],
          private_metadata:
            clerkUser.privateMetadata as ClerkUserData["private_metadata"],
          unsafe_metadata:
            clerkUser.unsafeMetadata as ClerkUserData["unsafe_metadata"],
        };
      } catch {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
    } else {
      // Fallback: cookie-based session (web app)
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      normalizedUser = {
        id: clerkUser.id,
        email_addresses: clerkUser.emailAddresses?.map((e) => ({
          email_address: e.emailAddress,
        })),
        first_name: clerkUser.firstName ?? undefined,
        last_name: clerkUser.lastName ?? undefined,
        image_url: clerkUser.imageUrl ?? undefined,
        phone_numbers: clerkUser.phoneNumbers?.map((p) => ({
          phone_number: p.phoneNumber,
        })),
        public_metadata:
          clerkUser.publicMetadata as ClerkUserData["public_metadata"],
        private_metadata:
          clerkUser.privateMetadata as ClerkUserData["private_metadata"],
        unsafe_metadata:
          clerkUser.unsafeMetadata as ClerkUserData["unsafe_metadata"],
      };
    }

    if (!normalizedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Use the proper user sync function that handles type mapping
    const result = await createUserInSupabase(normalizedUser);

    if (!result) {
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 },
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
      {
        error: "Failed to sync user",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
