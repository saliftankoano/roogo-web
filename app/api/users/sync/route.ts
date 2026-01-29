import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * POST /api/users/sync
 * 
 * Syncs the authenticated Clerk user to Supabase.
 * This is a fallback in case the webhook hasn't fired yet.
 */
export async function POST(request: Request) {
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

    // Check if user already exists in Supabase
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({
        success: true,
        userId: existingUser.id,
        message: "User already synced",
      });
    }

    // Create user in Supabase
    const { data: newUser, error } = await supabaseAdmin
      .from("users")
      .insert({
        clerk_id: userId,
        email: clerkUser.emailAddresses[0]?.emailAddress,
        full_name:
          clerkUser.fullName ||
          `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() ||
          "User",
        avatar_url: clerkUser.imageUrl,
        user_type: "renter", // Default type, can be updated later
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating user in Supabase:", error);
      return NextResponse.json(
        { error: "Failed to sync user", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: newUser.id,
      message: "User synced successfully",
    });
  } catch (error) {
    console.error("Error in user sync:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
