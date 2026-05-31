import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifyRentersOfNewMatchingProperty } from "@/lib/matching-property-notifications";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: propertyId } = await params;

    // Verify user is staff
    // Use maybeSingle() instead of single() to handle 0 rows gracefully
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_type")
      .eq("clerk_id", userId)
      .maybeSingle();

    if (userError) {
      console.error("Error fetching user:", userError);
      return NextResponse.json({ error: "User fetch failed" }, { status: 500 });
    }

    if (!user) {
      console.error("User not found for clerk_id:", userId);
      // If user is not found in Supabase but has a valid Clerk token,
      // it might be a sync issue. We can try to sync or just return 403.
      // For now, let's return 403 Forbidden as they are not authorized staff/founder.
      return NextResponse.json({ error: "User not found in database" }, { status: 403 });
    }

    console.log("User updating status:", userId, "Type:", user.user_type);

    if (!["staff", "founder"].includes(user.user_type)) {
      console.error("Forbidden access for user type:", user.user_type);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const updateData: Record<string, string | boolean | null> = { status };

    // Post-approval logic: set published_at and refresh boost expiration
    if (status === "en_ligne") {
      updateData.published_at = new Date().toISOString();

      // Check if property is boosted to refresh its expiration date
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("is_boosted")
        .eq("id", propertyId)
        .single();

      if (property?.is_boosted) {
        const boostExpiresAt = new Date();
        boostExpiresAt.setDate(boostExpiresAt.getDate() + 7);
        updateData.boost_expires_at = boostExpiresAt.toISOString();
      }
    }

    const { error } = await supabaseAdmin
      .from("properties")
      .update(updateData)
      .eq("id", propertyId);

    if (!error) {
      await captureServerEvent(userId, "property_listing_published", {
        property_id: propertyId,
        status_change: `to_${status}`,
        actor_type: user.user_type,
        is_boost_refresh: status === "en_ligne",
      });
    }

    if (error) {
      console.error("Error updating property status:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (status === "en_ligne") {
      await notifyRentersOfNewMatchingProperty(propertyId).catch((notifyError) => {
        console.error("New matching property notification failed:", notifyError);
      });
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
