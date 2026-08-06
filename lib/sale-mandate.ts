import { notifyUser } from "@/lib/push-notifications";
import {
  getOrCreateSellerConversation,
  postSaleMessage,
} from "@/lib/sale-chat";
import { MANDATE_TERMS_VERSION } from "@/lib/sale";
import { supabaseAdmin } from "@/lib/supabase-admin";

// The price + exclusivity mandate the owner signs. Economics v2 (migration 050):
// staff send an offer built on the owner's desired price; Roogo's commission is a
// base percentage of that amount plus a share of any surplus above it at closing.
// The percentages come from listing_config and are snapshotted onto the mandate so
// later settings changes never rewrite an agreed mandate. Signing stamps
// properties.price = desired_price and unlocks publishing; staff adjust the public
// price afterwards without notifying the seller. The offer and signature are
// mirrored into the seller↔Roogo thread.

export type MandateRow = {
  id: string;
  property_id: string;
  seller_id: string;
  conversation_id: string | null;
  /** Legacy spread model (pre-050). Null on v2 mandates. */
  seller_net_price: number | null;
  /** Legacy spread model (pre-050). Null on v2 mandates. */
  list_price: number | null;
  /** v2: the amount the owner wants to receive. */
  desired_price: number | null;
  /** v2: snapshot of the base commission (decimal fraction) at send time. */
  base_commission_pct: number | null;
  /** v2: snapshot of Roogo's surplus share (decimal fraction) at send time. */
  surplus_split_pct: number | null;
  exclusivity_days: number;
  exclusivity_start_at: string | null;
  exclusivity_end_at: string | null;
  status:
    | "draft"
    | "sent"
    | "signed"
    | "declined"
    | "cancelled"
    | "expired";
  terms_version: string;
  signed_typed_name: string | null;
  sent_by: string | null;
  sent_at: string;
  signed_at: string | null;
  declined_at: string | null;
};

/**
 * The live sale-commission settings (founder-editable in /admin/parametres).
 * Decimal fractions: 0.10 = 10%.
 */
export async function getSaleCommissionConfig() {
  const { data, error } = await supabaseAdmin
    .from("listing_config")
    .select(
      "sale_base_commission_percentage, sale_surplus_split_percentage, sale_notary_price_basis",
    )
    .eq("id", "default")
    .single();
  if (error) throw error;
  const base = Number(data?.sale_base_commission_percentage);
  const split = Number(data?.sale_surplus_split_percentage);
  if (!Number.isFinite(base) || !Number.isFinite(split)) {
    throw new Error("Sale commission percentages are not configured");
  }
  return {
    baseCommissionPct: base,
    surplusSplitPct: split,
    notaryPriceBasis:
      data?.sale_notary_price_basis === "list" ? ("list" as const) : ("desired" as const),
  };
}

/**
 * Staff sends a mandate to the property's owner. Cancels any previous live offer,
 * posts a mandate_offer card into the seller thread, and notifies the owner.
 * The commission percentages are snapshotted from listing_config at send time.
 */
export async function sendMandate(params: {
  propertyId: string;
  staffId: string;
  desiredPrice: number;
  exclusivityDays: number;
  notes?: string | null;
}) {
  const { propertyId, staffId, desiredPrice, exclusivityDays, notes } = params;

  if (!Number.isFinite(desiredPrice) || desiredPrice <= 0) {
    return { ok: false as const, reason: "invalid_price" as const };
  }

  const commission = await getSaleCommissionConfig();

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id, agent_id, listing_type")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError) throw propertyError;
  if (!property) return { ok: false as const, reason: "not_found" as const };
  if (property.listing_type !== "vendre")
    return { ok: false as const, reason: "not_a_sale" as const };

  if (!property.agent_id) {
    return { ok: false as const, reason: "owner_not_linked" as const };
  }
  const sellerId = property.agent_id as string;
  const { conversation } = await getOrCreateSellerConversation({
    propertyId,
    sellerId,
  });
  if (!conversation)
    return { ok: false as const, reason: "no_conversation" as const };

  // Only one live (sent/signed) mandate per property — cancel any prior pending offer.
  await supabaseAdmin
    .from("property_mandates")
    .update({ status: "cancelled" })
    .eq("property_id", propertyId)
    .eq("status", "sent");

  const { data: mandate, error: insertError } = await supabaseAdmin
    .from("property_mandates")
    .insert({
      property_id: propertyId,
      seller_id: sellerId,
      conversation_id: conversation.id,
      desired_price: desiredPrice,
      base_commission_pct: commission.baseCommissionPct,
      surplus_split_pct: commission.surplusSplitPct,
      exclusivity_days: exclusivityDays,
      status: "sent",
      terms_version: MANDATE_TERMS_VERSION,
      sent_by: staffId,
      notes: notes ?? null,
    })
    .select("*")
    .single();
  if (insertError || !mandate) {
    throw insertError ?? new Error("Failed to insert mandate");
  }

  // The card the owner sees: their price, the commission on it, and the surplus
  // clause. Deliberately no list price; the seller never sees Roogo's price.
  const { message } = await postSaleMessage({
    conversationId: conversation.id,
    senderId: staffId,
    senderType: "staff",
    messageType: "mandate_offer",
    body: "Proposition de mandat de vente",
    metadata: {
      mandate_id: mandate.id,
      desired_price: desiredPrice,
      base_commission_pct: commission.baseCommissionPct,
      surplus_split_pct: commission.surplusSplitPct,
      exclusivity_days: exclusivityDays,
    },
  });

  await supabaseAdmin
    .from("property_mandates")
    .update({ offer_message_id: message.id })
    .eq("id", mandate.id);

  await notifyUser(
    sellerId,
    "messages",
    "Proposition de mandat",
    "Roogo vous propose un mandat de vente. Ouvrez l'app pour le consulter et le signer.",
    { type: "mandate_offer", conversationId: conversation.id, mandateId: mandate.id },
  );

  return { ok: true as const, mandate: mandate as MandateRow };
}

/**
 * The owner signs a mandate. Stamps properties.price = desired_price (v2; legacy
 * rows fall back to list_price), computes the exclusivity window, and posts a
 * mandate_signed card into the seller thread. Staff adjust the public price later
 * through the admin tools, without notifying the seller.
 */
export async function signMandate(params: {
  mandateId: string;
  sellerId: string;
  typedName: string;
  signatureMeta?: Record<string, unknown> | null;
}) {
  const { mandateId, sellerId, typedName, signatureMeta } = params;

  const { data: mandate, error } = await supabaseAdmin
    .from("property_mandates")
    .select("*")
    .eq("id", mandateId)
    .maybeSingle<MandateRow>();
  if (error) throw error;
  if (!mandate) return { ok: false as const, reason: "not_found" as const };
  if (mandate.seller_id !== sellerId)
    return { ok: false as const, reason: "forbidden" as const };
  if (mandate.status !== "sent")
    return { ok: false as const, reason: "already_handled" as const };

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + (mandate.exclusivity_days || 0));

  const { error: updateError } = await supabaseAdmin
    .from("property_mandates")
    .update({
      status: "signed",
      signed_at: now.toISOString(),
      signed_typed_name: typedName,
      signature_meta: signatureMeta ?? null,
      exclusivity_start_at: now.toISOString(),
      exclusivity_end_at: end.toISOString(),
    })
    .eq("id", mandateId)
    .eq("status", "sent");
  if (updateError) throw updateError;

  // Publish at the owner's desired amount; staff may re-price afterwards.
  const publishedPrice = mandate.desired_price ?? mandate.list_price;
  if (publishedPrice != null) {
    await supabaseAdmin
      .from("properties")
      .update({ price: publishedPrice })
      .eq("id", mandate.property_id);
  }

  let conversationId = mandate.conversation_id;
  if (!conversationId) {
    const { conversation } = await getOrCreateSellerConversation({
      propertyId: mandate.property_id,
      sellerId,
    });
    conversationId = conversation?.id ?? null;
  }

  if (conversationId) {
    const { message } = await postSaleMessage({
      conversationId,
      senderId: sellerId,
      senderType: "system",
      messageType: "mandate_signed",
      body: "Mandat signé",
      metadata: {
        mandate_id: mandate.id,
        desired_price: mandate.desired_price,
        base_commission_pct: mandate.base_commission_pct,
        surplus_split_pct: mandate.surplus_split_pct,
        exclusivity_end_at: end.toISOString(),
        signed_typed_name: typedName,
      },
    });
    await supabaseAdmin
      .from("property_mandates")
      .update({ signed_message_id: message.id })
      .eq("id", mandateId);
  }

  // Let the team know the mandate is signed so they can publish.
  if (mandate.sent_by) {
    await notifyUser(
      mandate.sent_by,
      "messages",
      "Mandat signé",
      "Le propriétaire a signé le mandat. L'annonce peut être publiée.",
      { type: "mandate_signed", mandateId: mandate.id, conversationId },
    );
  }

  return { ok: true as const, publishedPrice };
}

/** The latest mandate for a property, or null. */
export async function getLatestMandateForProperty(propertyId: string) {
  const { data, error } = await supabaseAdmin
    .from("property_mandates")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<MandateRow>();
  if (error) throw error;
  return data ?? null;
}
