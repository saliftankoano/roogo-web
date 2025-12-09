import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";

export async function POST(req: Request) {
  try {
    console.log("Received PawaPay callback");

    // 1. Parse Body
    const body = await req.json();
    console.log("Callback payload:", JSON.stringify(body, null, 2));

    // Handle array or object
    const data = Array.isArray(body) ? body[0] : body;
    const { depositId, status, failureReason } = data;

    if (!depositId || !status) {
      console.error("Missing depositId or status in callback");
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 2. Map Status
    let dbStatus = "pending";
    if (status === "COMPLETED") dbStatus = "completed";
    if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED")
      dbStatus = "failed";
    if (status === "REFUNDED") dbStatus = "refunded";

    // 3. Update Supabase
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("transactions")
      .update({
        status: dbStatus,
        failure_reason: failureReason || null,
        metadata: data, // Store full payload for debugging/records
        updated_at: new Date().toISOString(),
      })
      .eq("deposit_id", depositId);

    if (error) {
      console.error("Error updating transaction:", error);
      return NextResponse.json(
        { error: "Database update failed" },
        { status: 500 }
      );
    }

    console.log(`Transaction ${depositId} updated to ${dbStatus}`);

    // 4. Return 200 OK
    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error("Callback error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
