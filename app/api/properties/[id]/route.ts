import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createUserInSupabase, ClerkUserData } from "../../../../lib/user-sync";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Try to find user in Supabase
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("user_type, clerk_id")
      .eq("clerk_id", userId)
      .limit(1);

    let user = users?.[0];

    // Auto-sync user from Clerk if not found in Supabase
    if (!user) {
      try {
        const clerkUser = await currentUser();
        if (clerkUser) {
          // Transform Clerk data format to match user-sync expectations
          const transformedData = {
            id: clerkUser.id,
            email_addresses: clerkUser.emailAddresses?.map(e => ({ email_address: e.emailAddress })),
            first_name: clerkUser.firstName,
            last_name: clerkUser.lastName,
            image_url: clerkUser.imageUrl,
            phone_numbers: clerkUser.phoneNumbers?.map(p => ({ phone_number: p.phoneNumber })),
            public_metadata: clerkUser.publicMetadata,
            private_metadata: clerkUser.privateMetadata,
            unsafe_metadata: clerkUser.unsafeMetadata,
          };

          await createUserInSupabase(transformedData as ClerkUserData);

          // Re-fetch user after sync
          const { data: syncedUsers } = await supabaseAdmin
            .from("users")
            .select("user_type, clerk_id")
            .eq("clerk_id", userId)
            .limit(1);

          user = syncedUsers?.[0];
        }
      } catch (syncError) {
        console.error("Failed to auto-sync user:", syncError);
      }
    }

    // Verify user has required privileges
    if (
      !user ||
      !["staff", "admin", "founder"].includes(user.user_type)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("properties")
      .delete()
      .eq("id", propertyId);

    if (error) {
      console.error("Error deleting property:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
