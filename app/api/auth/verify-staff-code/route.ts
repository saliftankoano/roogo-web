import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { checkRateLimit, authLimiter } from "@/lib/rate-limit";
import { safeError } from "@/lib/api-helpers";

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

    // Rate limiting for auth attempts
    const { success: rateLimitOk, headers: rateLimitHeaders } = await checkRateLimit(
      authLimiter,
      userId
    );

    if (!rateLimitOk) {
      const response = NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
      rateLimitHeaders.forEach((value, key) => {
        response.headers.set(key, value);
      });
      return response;
    }

    const { code } = await request.json();

    // Verify the staff code
    const staffSecret = process.env.STAFF_REGISTRATION_SECRET;
    if (!staffSecret) {
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

    // Update Clerk metadata
    const client = await clerkClient();
    
    await client.users.updateUser(userId, {
      publicMetadata: {
        userType: "staff",
      },
      privateMetadata: {
        userType: "staff",
      },
      unsafeMetadata: {}
    });

    // Check if user already exists in Supabase
    let { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, clerk_id, email, user_type")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (!existingUser && email) {
      const { data: userByEmail } = await supabaseAdmin
        .from("users")
        .select("id, clerk_id, email, user_type")
        .eq("email", email)
        .maybeSingle();
      
      if (userByEmail) {
        existingUser = userByEmail;
      }
    }

    if (existingUser) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ 
          user_type: "staff",
          clerk_id: userId
        })
        .eq("id", existingUser.id);

      if (updateError) {
        console.error("Failed to update user role:", updateError);
        return NextResponse.json(
          { error: "Failed to update user role" },
          { status: 500 }
        );
      }
    } else {
      const { error: insertError } = await supabaseAdmin.from("users").insert({
        clerk_id: userId,
        email: email,
        full_name: fullName,
        avatar_url: user.imageUrl,
        user_type: "staff",
      });

      if (insertError) {
        if (insertError.code === '23505') {
            const { error: finalUpdateError } = await supabaseAdmin
                .from("users")
                .update({ 
                    user_type: "staff",
                    clerk_id: userId 
                })
                .match({ email: email });
            
            if (!finalUpdateError) {
                return NextResponse.json({
                    success: true,
                    message: "Successfully registered as staff (via fallback)",
                });
            }
        }
        console.error("Failed to create staff user:", insertError);
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
      { error: safeError(error, "Internal server error") },
      { status: 500 }
    );
  }
}
