import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
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
 * GET /api/properties/[id]/applications
 * Returns applicants and lock transactions for a property.
 * Accessible by the property owner/agent and staff/founder.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: propertyId } = await params;
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = await getSupabaseUserId(clerkId);
    if (!userId) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user type for admin bypass
    const { data: userRecord } = await supabaseAdmin
      .from("users")
      .select("user_type")
      .eq("id", userId)
      .maybeSingle();

    const isAdmin = ["staff", "founder", "admin"].includes(userRecord?.user_type || "");

    if (!isAdmin) {
      // Verify the requesting user owns this property
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("user_id")
        .eq("id", propertyId)
        .maybeSingle();

      if (!property || property.user_id !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch applications with applicant info
    const { data: applications, error: appError } = await supabaseAdmin
      .from("applications")
      .select(`
        id,
        status,
        created_at,
        user_id,
        users!applications_user_id_fkey (
          full_name,
          phone,
          avatar_url
        )
      `)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (appError) {
      console.error("Error fetching applications:", appError);
      return NextResponse.json({ error: appError.message }, { status: 500 });
    }

    // Fetch property_lock transactions
    const { data: lockTransactions, error: txError } = await supabaseAdmin
      .from("transactions")
      .select(`
        id,
        amount,
        currency,
        status,
        provider,
        payer_phone,
        created_at,
        user_id,
        users!transactions_user_id_fkey (
          full_name,
          phone,
          avatar_url
        )
      `)
      .eq("property_id", propertyId)
      .eq("type", "property_lock")
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("Error fetching lock transactions:", txError);
    }

    return NextResponse.json({
      success: true,
      applications: applications || [],
      lockTransactions: lockTransactions || [],
    });
  } catch (error) {
    console.error("Error in property applications GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
