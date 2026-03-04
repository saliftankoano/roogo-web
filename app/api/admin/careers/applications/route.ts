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
    const userType =
      (user?.publicMetadata?.userType as string | undefined) ||
      (user?.publicMetadata?.user_type as string | undefined);

    if (!["staff", "founder", "admin"].includes((userType || "").toLowerCase())) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("hustle_applications")
      .select(
        "id, full_name, email, phone, secondary_phone, proud_achievement, difficult_problem, thirty_day_strategy, proof_links, neighborhood_challenge, created_at",
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
    console.error("Admin hustle applications error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
