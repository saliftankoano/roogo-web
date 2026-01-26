import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";
import { auth } from "@clerk/nextjs/server";
import { notifyLockParties } from "@/lib/lock-notifications";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lockId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = getSupabaseClient();

    // 1. Fetch lock details
    const { data: lock, error: fetchError } = await supabase
      .from("property_locks")
      .select(
        `
        *,
        property:properties (
          id,
          address,
          agent_id
        )
      `
      )
      .eq("id", lockId)
      .single();

    if (fetchError || !lock) {
      console.error("Fetch lock error:", fetchError);
      return NextResponse.json({ error: "Lock not found" }, { status: 404 });
    }

    if (lock.status !== "active") {
      return NextResponse.json(
        { error: "Lock is not active" },
        { status: 400 }
      );
    }

    const property = lock.property;

    // 2. Update Property Status to 'finalized'
    const { error: propUpdateError } = await supabase
      .from("properties")
      .update({ status: "finalized" })
      .eq("id", property.id);

    if (propUpdateError) throw propUpdateError;

    // 3. Update Lock Status to 'finalized'
    const { error: lockUpdateError } = await supabase
      .from("property_locks")
      .update({
        status: "finalized",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", lock.id);

    if (lockUpdateError) throw lockUpdateError;

    // 4. Notify both parties
    await notifyLockParties(
      "FINALIZED",
      property.agent_id,
      lock.renter_id,
      property.address || "Propriété",
      property.id
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Finalize lock error:", error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
