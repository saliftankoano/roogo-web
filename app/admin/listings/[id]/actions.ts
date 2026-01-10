"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Transaction } from "@/lib/data";

export async function getSecureTransactions(propertyId: string, paymentId?: string | null, transactionId?: string | null) {
  const { userId } = await auth();
  
  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Verify staff status via Clerk metadata
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const userType = user.publicMetadata.userType;

  if (userType !== "staff") {
    throw new Error("Forbidden: Staff access only");
  }

  // Use the admin client to bypass RLS securely on the server
  const queries = [];
  queries.push(supabaseAdmin.from("transactions").select("*").eq("property_id", propertyId));
  
  if (paymentId) {
    queries.push(supabaseAdmin.from("transactions").select("*").eq("deposit_id", paymentId));
  }
  
  if (transactionId) {
    queries.push(supabaseAdmin.from("transactions").select("*").eq("id", transactionId));
  }

  const results = await Promise.all(queries);
  const allTransactions: Transaction[] = [];
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

  return allTransactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
