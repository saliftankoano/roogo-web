import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth, currentUser } from "@clerk/nextjs/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await request.json();

    // Verify the staff code
    const staffSecret = process.env.STAFF_REGISTRATION_SECRET;
    if (!staffSecret) {
      console.error("STAFF_REGISTRATION_SECRET not configured");
      return NextResponse.json(
        { error: "Staff registration not configured" },
        { status: 500 }
      );
    }

    if (code !== staffSecret) {
      return NextResponse.json(
        { error: "Invalid staff code" },
        { status: 403 }
      );
    }

    // Get current user details from Clerk
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const email = user.emailAddresses[0]?.emailAddress;
    const fullName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      "Staff Member";

    // Check if user already exists in Supabase
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, user_type")
      .eq("clerk_id", userId)
      .single();

    if (existingUser) {
      // User exists, update their role to staff
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ user_type: "staff" })
        .eq("clerk_id", userId);

      if (updateError) {
        console.error("Error updating user to staff:", updateError);
        return NextResponse.json(
          { error: "Failed to update user role" },
          { status: 500 }
        );
      }
    } else {
      // User doesn't exist, create them as staff
      const { error: insertError } = await supabaseAdmin.from("users").insert({
        clerk_id: userId,
        email: email,
        full_name: fullName,
        avatar_url: user.imageUrl,
        user_type: "staff",
      });

      if (insertError) {
        console.error("Error creating staff user:", insertError);
        return NextResponse.json(
          { error: "Failed to create staff user" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Successfully registered as staff",
    });
  } catch (error) {
    console.error("Staff verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
