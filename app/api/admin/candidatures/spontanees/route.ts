import { staffLevelCan } from "@/lib/staff-access";
import { staffLevelFromMetadata } from "@/lib/staff-access-server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const level = staffLevelFromMetadata(user?.publicMetadata);
    if (!staffLevelCan(level, "talent.manage")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("spontaneous_applications")
      .select(
        "id, full_name, email, question1_answer, question2_answer, value_proposition, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      applications: data || [],
    });
  } catch (error) {
    console.error("Admin spontaneous applications error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
