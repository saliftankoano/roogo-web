import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await currentUser();
    const userType = user?.publicMetadata?.userType;
    if (!["staff", "founder", "admin"].includes(userType as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("deposit_holds")
      .select(
        `
        id,
        agreement_id,
        amount,
        currency,
        status,
        stay_end_at,
        review_deadline_at,
        resolved_owner_amount,
        resolved_renter_amount,
        resolved_at,
        created_at,
        properties:property_id (id, quartier, city, address),
        owner:owner_id (id, full_name, phone),
        renter:renter_id (id, full_name, phone),
        claim:deposit_claims!hold_id (id, claimed_amount, description, status, created_at)
        `,
      )
      .in("status", [
        "disputed",
        "resolved_split",
        "resolved_owner_full",
        "resolved_renter_full",
      ])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin disputes query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, disputes: data || [] });
  } catch (error) {
    console.error("Admin disputes GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
