import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyUserWithTemplate } from "@/lib/push-notifications";
import { captureServerEvent } from "@/lib/posthog-server";

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

    // Get property details and owner info
    const { data: property, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id, quartier, address, agent_id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      console.error("Error fetching property:", propertyError);
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    // Get applicant's name
    const { data: applicant } = await supabaseAdmin
      .from("users")
      .select("full_name")
      .eq("id", userId)
      .single();

    // Insert application
    const { data: application, error } = await supabaseAdmin
      .from("applications")
      .insert({
        property_id: propertyId,
        user_id: userId,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating application:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await captureServerEvent(userId, "viewing_request_submitted", {
      application_id: application?.id || null,
      property_id: propertyId,
      property_quartier: property.quartier || null,
      applicant_user_type: "renter",
      property_owner_id: property.agent_id || null,
      status: "pending",
    });

    // Send notification to property owner
    if (property.agent_id) {
      const applicantName = applicant?.full_name || "Un utilisateur";
      await notifyUserWithTemplate(
        property.agent_id,
        "viewingRequests",
        "applications.newViewingRequest",
        {
          applicantName,
          location: property.quartier || property.address || "votre bien",
        },
        {
          type: "viewing_request",
          propertyId,
          applicationUserId: userId,
        }
      );
    }

    return NextResponse.json({ success: true, message: "Application submitted" });
  } catch (error) {
    console.error("Error in applications API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
