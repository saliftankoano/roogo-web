import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await currentUser();
    const userType = user?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("daily_booking_issues")
      .select(
        `
        *,
        request:booking_request_id(*),
        property:property_id(id, quartier, city, address),
        reporter:reporter_id(id, full_name, phone)
        `,
      )
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Daily booking issues query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, issues: data || [] });
  } catch (error) {
    console.error("Daily booking issues GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
