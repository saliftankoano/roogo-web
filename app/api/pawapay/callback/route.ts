import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";

// PawaPay IPs to whitelist
const PAWAPAY_IPS = [
  "3.64.89.224", // Sandbox
  "18.192.208.15", // Production
  "18.195.113.136", // Production
  "3.72.212.107", // Production
  "54.73.125.42", // Production
  "54.155.38.214", // Production
  "54.73.130.113", // Production
];

export async function POST(req: Request) {
  try {
    // 0. IP Whitelisting
    // This relies on the hosting provider setting the correct X-Forwarded-For header
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    // In dev environment (localhost), we might skip or log this
    if (process.env.NODE_ENV === "production") {
      if (!clientIp || !PAWAPAY_IPS.includes(clientIp)) {
        console.warn(`Blocked callback from unauthorized IP: ${clientIp}`);
        return NextResponse.json({ error: "Unauthorized IP" }, { status: 403 });
      }
    }

    console.log("Received PawaPay callback from:", clientIp);

    // 1. Parse Body
    const body = await req.json();
    console.log("Callback payload:", JSON.stringify(body, null, 2));

    // Handle array or object
    const data = Array.isArray(body) ? body[0] : body;

    // Check for any supported ID type
    const transactionId = data.depositId || data.payoutId || data.refundId;
    const { status, failureReason } = data;

    if (!transactionId || !status) {
      console.error(
        "Missing transaction ID (depositId/payoutId/refundId) or status in callback"
      );
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 2. Map Status
    let dbStatus = "pending";
    if (status === "COMPLETED" || status === "ACCEPTED") dbStatus = "completed"; // Payouts use ACCEPTED initially, but callbacks might confirm completion
    if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED")
      dbStatus = "failed";
    if (status === "REFUNDED") dbStatus = "refunded";
    if (status === "SUBMITTED") dbStatus = "submitted"; // Some intermediate states

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
      .eq("deposit_id", transactionId); // We use deposit_id column for all external IDs currently

    if (error) {
      console.error("Error updating transaction:", error);
      return NextResponse.json(
        { error: "Database update failed" },
        { status: 500 }
      );
    }

    console.log(`Transaction ${transactionId} updated to ${dbStatus}`);

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
