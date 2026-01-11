import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/user-sync";
import { notifyLockParties } from "@/lib/lock-notifications";

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
    const forwardedFor = req.headers.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    if (process.env.NODE_ENV === "production") {
      if (!clientIp || !PAWAPAY_IPS.includes(clientIp)) {
        console.warn(`Blocked callback from unauthorized IP: ${clientIp}`);
        return NextResponse.json({ error: "Unauthorized IP" }, { status: 403 });
      }
    }

    // 1. Parse Body
    const body = await req.json();
    const data = Array.isArray(body) ? body[0] : body;

    const transactionId = data.depositId || data.payoutId || data.refundId;
    const { status, failureReason } = data;

    if (!transactionId || !status) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 2. Map Status
    let dbStatus = "pending";
    if (status === "COMPLETED" || status === "ACCEPTED") dbStatus = "completed";
    if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED")
      dbStatus = "failed";
    if (status === "REFUNDED") dbStatus = "refunded";
    if (status === "SUBMITTED") dbStatus = "submitted";

    // 3. Update Supabase
    const supabase = getSupabaseClient();

    // Fetch the transaction first
    const { data: transaction, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("deposit_id", transactionId)
      .single();

    if (fetchError || !transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabase
      .from("transactions")
      .update({
        status: dbStatus,
        failure_reason: failureReason || null,
        metadata: data,
        updated_at: new Date().toISOString(),
      })
      .eq("deposit_id", transactionId);

    if (updateError) {
      return NextResponse.json(
        { error: "Database update failed" },
        { status: 500 }
      );
    }

    // 4. Handle Post-Payment Logic
    if (dbStatus === "completed" && transaction.type === "property_lock") {
      const propertyId = transaction.property_id;
      const renterId = transaction.user_id;

      if (propertyId && renterId) {
        await supabase
          .from("properties")
          .update({ status: "locked" })
          .eq("id", propertyId);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await supabase.from("property_locks").insert({
          property_id: propertyId,
          renter_id: renterId,
          transaction_id: transaction.id,
          lock_fee: transaction.amount,
          status: "active",
          expires_at: expiresAt.toISOString(),
        });

        const { data: property } = await supabase
          .from("properties")
          .select("address, agent_id")
          .eq("id", propertyId)
          .single();

        if (property && property.agent_id) {
          await notifyLockParties(
            "DAY_0",
            property.agent_id,
            renterId,
            property.address || "Propriété",
            propertyId
          );
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
