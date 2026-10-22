"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { currentUser } from "@clerk/nextjs/server";
import { Transaction } from "@/lib/data";
import { staffLevelCan } from "@/lib/staff-access";
import { staffLevelFromMetadata } from "@/lib/staff-access-server";

export interface AdminTransactionRow extends Transaction {
  users: { full_name: string } | null;
  properties: { quartier?: string; address?: string } | null;
}

export interface ExtendedTransaction extends AdminTransactionRow {
  user_name: string;
  property_address: string;
  environment?: "sandbox" | "live";
  otp_code?: string | null;
}

export async function getAdminTransactions(): Promise<ExtendedTransaction[]> {
  // Founder and director read financial data (read only, decision of 2026-10-11).
  const user = await currentUser();
  if (
    !user ||
    !staffLevelCan(staffLevelFromMetadata(user.publicMetadata), "finances.view")
  ) {
    throw new Error(
      "Unauthorized: Only the founder and directors can access financial data",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select(
      `
      *,
      users:user_id (full_name),
      properties:property_id (quartier, address)
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
    property_address: tx.properties?.quartier || tx.properties?.address || "Non lié",
  }));
}
