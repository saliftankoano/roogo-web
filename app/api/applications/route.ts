import { auth } from "@clerk/nextjs/server";
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

async function getSupabaseUserId(clerkId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .maybeSingle();
  return data?.id || null;
}

/**
 * POST /api/applications - Submit an application
 */
export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getSupabaseUserId(clerkId);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { propertyId } = await req.json();

    if (!propertyId) {
      return NextResponse.json({ error: "Property ID required" }, { status: 400 });
    }

    // Check if application already exists
    const { data: existing } = await supabaseAdmin
      .from("applications")
      .select("id")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Vous avez déjà postulé à cette annonce." },
        { status: 409 }
      );
    }

    // Insert application
    const { error } = await supabaseAdmin
      .from("applications")
      .insert({
        property_id: propertyId,
        user_id: userId,
        status: "pending",
      });

    if (error) {
      console.error("Error creating application:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Application submitted" });
  } catch (error) {
    console.error("Error in applications API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
