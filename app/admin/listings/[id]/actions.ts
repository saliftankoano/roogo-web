"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Transaction } from "@/lib/data";

async function refreshTransactionStatus(tx: Transaction) {
  const pawaUrlBase = process.env.PAWAPAY_URL || "https://api.sandbox.pawapay.io";
  const pawaUrl = pawaUrlBase.replace(/\/+$/, "");
  const pawaToken = process.env.PAWAPAY_API_TOKEN;

  if (!pawaToken || !tx.deposit_id) return tx;

  try {
    const response = await fetch(`${pawaUrl}/v2/deposits/${tx.deposit_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pawaToken}`,
      },
    });

    const result = await response.json();
    if (!response.ok) return tx;

    // Handle PawaPay response structure (result.data.status or array)
    const statusData = result.data || (Array.isArray(result) ? result[0] : result);
    const status = statusData?.status || statusData?.depositStatus || result?.status;

    if (status && status !== "FOUND") {
      let dbStatus = "pending";
      if (status === "COMPLETED" || status === "ACCEPTED") dbStatus = "completed";
      if (status === "FAILED" || status === "CANCELLED" || status === "REJECTED") dbStatus = "failed";
      if (status === "REFUNDED") dbStatus = "refunded";

      if (dbStatus !== tx.status && dbStatus !== "pending") {
        const { data: updatedTx } = await supabaseAdmin
          .from("transactions")
          .update({
            status: dbStatus,
            metadata: statusData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.id)
          .select()
          .single();
        
        return (updatedTx as Transaction) || tx;
      }
    }
  } catch (error) {
    console.error("Failed to auto-refresh transaction status:", error);
  }
  return tx;
}

export async function getSecureTransactions(propertyId: string, paymentId?: string | null, transactionId?: string | null) {
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const userType = user.publicMetadata.userType;

  if (userType !== "staff") {
    throw new Error("Forbidden: Staff access only");
  }

  const queries = [];
  queries.push(supabaseAdmin.from("transactions").select("*").eq("property_id", propertyId));
  
  if (paymentId) {
    queries.push(supabaseAdmin.from("transactions").select("*").eq("deposit_id", paymentId));
  }
  
  if (transactionId) {
    queries.push(supabaseAdmin.from("transactions").select("*").eq("id", transactionId));
  }

  const results = await Promise.all(queries);
  let allTransactions: Transaction[] = [];
  const seenIds = new Set<string>();

  results.forEach((res) => {
    if (!res.error && res.data) {
      (res.data as Transaction[]).forEach(tx => {
        if (!seenIds.has(tx.id)) {
          seenIds.add(tx.id);
          allTransactions.push(tx);
        }
      });
    }
  });

  // Auto-refresh any pending transactions
  allTransactions = await Promise.all(
    allTransactions.map(tx => tx.status === 'pending' ? refreshTransactionStatus(tx) : Promise.resolve(tx))
  );

  return allTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
