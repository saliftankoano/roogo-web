"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { Transaction } from "@/lib/data";

export interface AdminTransactionRow extends Transaction {
  users: { full_name: string } | null;
  properties: { title: string } | null;
}

export interface ExtendedTransaction extends AdminTransactionRow {
  user_name: string;
  property_title: string;
}

export async function getAdminTransactions(): Promise<ExtendedTransaction[]> {
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
