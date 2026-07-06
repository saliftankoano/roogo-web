import { notifyUser } from "@/lib/push-notifications";
import {
  getOrCreateSellerConversation,
  postSaleMessage,
} from "@/lib/sale-chat";
import { MANDATE_TERMS_VERSION } from "@/lib/sale";
import { supabaseAdmin } from "@/lib/supabase-admin";

// The price + exclusivity mandate the owner signs. Roogo (staff) sends an offer with
// the owner's agreed net price, Roogo's public sale price, and an exclusivity period;
// the owner signs it in-app. Signing stamps properties.price = list_price and unlocks
// publishing. The offer and signature are mirrored into the seller↔Roogo thread.

export type MandateRow = {
  id: string;
  property_id: string;
  seller_id: string;
  conversation_id: string | null;
  seller_net_price: number;
  list_price: number;
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
 * Staff sends a mandate to the property's owner. Cancels any previous live offer,
 * posts a mandate_offer card into the seller thread, and notifies the owner.
 */
export async function sendMandate(params: {
  propertyId: string;
  staffId: string;
  sellerNetPrice: number;
  listPrice: number;
  exclusivityDays: number;
  notes?: string | null;
}) {
  const {
    propertyId,
    staffId,
    sellerNetPrice,
    listPrice,
    exclusivityDays,
    notes,
  } = params;

  if (
    !Number.isFinite(sellerNetPrice) ||
    !Number.isFinite(listPrice) ||
    sellerNetPrice <= 0 ||
    listPrice <= 0
  ) {
    return { ok: false as const, reason: "invalid_price" as const };
  }
  if (listPrice < sellerNetPrice) {
    return { ok: false as const, reason: "list_below_net" as const };
  }

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id, agent_id, listing_type")
    .eq("id", propertyId)
    .maybeSingle();
  if (propertyError) throw propertyError;
  if (!property) return { ok: false as const, reason: "not_found" as const };
  if (property.listing_type !== "vendre")
    return { ok: false as const, reason: "not_a_sale" as const };

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
      seller_net_price: sellerNetPrice,
      list_price: listPrice,
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

  const { message } = await postSaleMessage({
    conversationId: conversation.id,
    senderId: staffId,
    senderType: "staff",
    messageType: "mandate_offer",
    body: "Proposition de mandat de vente",
    metadata: {
      mandate_id: mandate.id,
      seller_net_price: sellerNetPrice,
      list_price: listPrice,
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
    "Proposition de mandat 📄",
    "Roogo vous propose un prix de vente et un mandat. Ouvrez l'app pour le consulter et le signer.",
    { type: "mandate_offer", conversationId: conversation.id, mandateId: mandate.id },
  );

  return { ok: true as const, mandate: mandate as MandateRow };
}

/**
 * The owner signs a mandate. Stamps properties.price = list_price, computes the
 * exclusivity window, and posts a mandate_signed card into the seller thread.
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

  // Lock in Roogo's public sale price.
  await supabaseAdmin
    .from("properties")
    .update({ price: mandate.list_price })
    .eq("id", mandate.property_id);

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
        seller_net_price: mandate.seller_net_price,
        list_price: mandate.list_price,
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
      "Mandat signé ✍️",
      "Le propriétaire a signé le mandat. L'annonce peut être publiée.",
      { type: "mandate_signed", mandateId: mandate.id, conversationId },
    );
  }

  return { ok: true as const, listPrice: mandate.list_price };
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
