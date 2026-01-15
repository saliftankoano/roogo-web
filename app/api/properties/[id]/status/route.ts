import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

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

    // Verify user is staff/admin
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_type")
      .eq("clerk_id", userId)
      .single();

    if (
      userError ||
      !user ||
      !["staff", "admin"].includes(user.user_type)
    ) {
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

    const updateData: any = { status };

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

    if (error) {
      console.error("Error updating property status:", error);
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
