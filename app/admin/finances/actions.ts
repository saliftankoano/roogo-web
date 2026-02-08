"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { currentUser } from "@clerk/nextjs/server";
import { Transaction } from "@/lib/data";

export interface AdminTransactionRow extends Transaction {
  users: { full_name: string } | null;
  properties: { title: string } | null;
}

export interface ExtendedTransaction extends AdminTransactionRow {
  user_name: string;
  property_title: string;
  environment?: "sandbox" | "live";
  otp_code?: string | null;
}

export async function getAdminTransactions(): Promise<ExtendedTransaction[]> {
  // Verify user is founder (only founders can access financial data)
  const user = await currentUser();
  if (!user || user.publicMetadata?.userType !== "founder") {
    throw new Error("Unauthorized: Only founders can access financial data");
  }

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select(
      `
      *,
      users:user_id (full_name),
      properties:property_id (title)
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching transactions with admin client:", error);
    throw new Error("Failed to fetch transactions");
  }

  return (data as unknown as AdminTransactionRow[] || []).map((tx) => ({
    ...tx,
    user_name: tx.users?.full_name || "Utilisateur inconnu",
    property_title: tx.properties?.title || "Non lié",
  }));
}
