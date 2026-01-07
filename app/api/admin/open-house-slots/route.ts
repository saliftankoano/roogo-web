import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

// Use service role to bypass RLS for admin operations
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

    // Verify user is staff/admin/owner
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_type")
      .eq("clerk_id", userId)
      .single();

    if (
      userError ||
      !user ||
      !["staff", "admin", "owner"].includes(user.user_type)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { property_id, date, start_time, end_time, capacity } = body;

    if (!property_id || !date || !start_time || !end_time || !capacity) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("open_house_slots")
      .insert({
        property_id,
        date,
        start_time,
        end_time,
        capacity,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating slot:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is staff/admin/owner
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_type")
      .eq("clerk_id", userId)
      .single();

    if (
      userError ||
      !user ||
      !["staff", "admin", "owner"].includes(user.user_type)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const slotId = searchParams.get("id");

    if (!slotId) {
      return NextResponse.json({ error: "Missing slot ID" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("open_house_slots")
      .delete()
      .eq("id", slotId);

    if (error) {
      console.error("Error deleting slot:", error);
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
