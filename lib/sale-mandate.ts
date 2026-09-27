import { notifyUser } from "@/lib/push-notifications";
import {
  getOrCreateSellerConversation,
  postSaleMessage,
} from "@/lib/sale-chat";
import {
  DEFAULT_SALE_BYPASS_FEE_PCT,
  DEFAULT_SALE_BYPASS_MONTHS,
  MANDATE_TERMS_VERSION,
} from "@/lib/sale";
import {
  publishedListingPrice,
  validateSaleEconomics,
  type SaleEconomicsSnapshot,
} from "@/lib/sale-economics";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  evaluateSalePriceChange,
  type SalePriceDecision,
} from "@/lib/sale-price-guard";

// The price + exclusivity mandate the owner signs.
//
// Economics v3 (migration 075): staff send an offer built on the owner's
// guaranteed net price (seller_net_price). The price ladder, fee and bypass
// percentages are snapshotted onto the mandate so later settings changes never
// rewrite an agreed mandate. Signing publishes properties.price at the ladder's
// listing rung (net + listing markup, rounded to 50,000 FCFA) and unlocks
// publishing. The seller's cards state the guaranteed net, exclusivity and the
// bypass clause, never the exact listing price.
//
// Mandates sent before v3 keep economics_version = 'v2' (desired price + base
// commission + surplus split, migration 050). They can still be signed and keep
// their v2 publishing behaviour (properties.price = desired_price).

export type MandateRow = {
  id: string;
  property_id: string;
  seller_id: string;
  conversation_id: string | null;
  /** 'v2' (050) or 'v3' (075). */
  economics_version: "v2" | "v3" | null;
  /** v3: the guaranteed net the owner receives. Legacy pre-050 rows also used it. */
  seller_net_price: number | null;
  /** Legacy spread model (pre-050). Null on v2 and v3 mandates. */
  list_price: number | null;
  /** v2 only: the amount the owner wants to receive. */
  desired_price: number | null;
  /** v2: snapshot of the base commission (decimal fraction) at send time. */
  base_commission_pct: number | null;
  /** v2: snapshot of Roogo's surplus share (decimal fraction) at send time. */
  surplus_split_pct: number | null;
  /** v3 snapshots (decimal fractions). Null on v2 rows. */
  listing_markup_pct: number | null;
  target_markup_pct: number | null;
  team_floor_markup_pct: number | null;
  hard_floor_markup_pct: number | null;
  notary_fee_pct: number | null;
  buyer_referral_pct: number | null;
  seller_referral_pct: number | null;
  bypass_fee_pct: number | null;
  bypass_months: number | null;
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

function num(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * The live v3 sale economics (founder-editable in /admin/parametres): the private
 * ladder and fee percentages from sale_economics_config plus the seller-facing
 * bypass terms from listing_config. Decimal fractions: 0.30 = 30%.
 * Throws when migration 075 has not run or the row is inconsistent, so no v3
 * mandate is ever sent on guessed numbers.
 */
export async function getSaleEconomicsConfig(): Promise<SaleEconomicsSnapshot> {
  const [{ data: ladder, error: ladderError }, { data: listing, error: listingError }] =
    await Promise.all([
      supabaseAdmin
        .from("sale_economics_config")
        .select(
          "listing_markup_pct, target_markup_pct, team_floor_markup_pct, hard_floor_markup_pct, notary_fee_pct, buyer_referral_pct, seller_referral_pct",
        )
        .eq("id", "default")
        .single(),
      supabaseAdmin
        .from("listing_config")
        .select("sale_bypass_fee_pct, sale_bypass_months")
        .eq("id", "default")
        .single(),
    ]);
  if (ladderError) throw ladderError;
  if (listingError) throw listingError;

  const config: SaleEconomicsSnapshot = {
    listingMarkupPct: num(ladder?.listing_markup_pct),
    targetMarkupPct: num(ladder?.target_markup_pct),
    teamFloorMarkupPct: num(ladder?.team_floor_markup_pct),
    hardFloorMarkupPct: num(ladder?.hard_floor_markup_pct),
    notaryFeePct: num(ladder?.notary_fee_pct),
    buyerReferralPct: num(ladder?.buyer_referral_pct),
    sellerReferralPct: num(ladder?.seller_referral_pct),
    bypassFeePct: num(listing?.sale_bypass_fee_pct ?? DEFAULT_SALE_BYPASS_FEE_PCT),
    bypassMonths: num(listing?.sale_bypass_months ?? DEFAULT_SALE_BYPASS_MONTHS),
  };
  const problems = validateSaleEconomics(config);
  if (problems.length > 0) {
    throw new Error(`Sale economics are not configured: ${problems.join("; ")}`);
  }
  return config;
}

/** The v3 snapshot stored on a mandate, or null for v2/legacy/incomplete rows. */
export function mandateEconomicsSnapshot(
  mandate: Pick<
    MandateRow,
    | "economics_version"
    | "listing_markup_pct"
    | "target_markup_pct"
    | "team_floor_markup_pct"
    | "hard_floor_markup_pct"
    | "notary_fee_pct"
    | "buyer_referral_pct"
    | "seller_referral_pct"
    | "bypass_fee_pct"
    | "bypass_months"
  >,
): SaleEconomicsSnapshot | null {
  if (mandate.economics_version !== "v3") return null;
  const snapshot: SaleEconomicsSnapshot = {
    listingMarkupPct: num(mandate.listing_markup_pct),
    targetMarkupPct: num(mandate.target_markup_pct),
    teamFloorMarkupPct: num(mandate.team_floor_markup_pct),
    hardFloorMarkupPct: num(mandate.hard_floor_markup_pct),
    notaryFeePct: num(mandate.notary_fee_pct),
    buyerReferralPct: num(mandate.buyer_referral_pct),
    sellerReferralPct: num(mandate.seller_referral_pct),
    bypassFeePct: num(mandate.bypass_fee_pct),
    bypassMonths: num(mandate.bypass_months),
  };
  return validateSaleEconomics(snapshot).length === 0 ? snapshot : null;
}

/**
 * Staff sends a v3 mandate to the property's owner. Cancels any previous live
 * offer, posts a mandate_offer card into the seller thread, and notifies the
 * owner. The economics are snapshotted from the live config at send time.
 */
export async function sendMandate(params: {
  propertyId: string;
  staffId: string;
  sellerNetPrice: number;
  exclusivityDays: number;
  notes?: string | null;
}) {
  const { propertyId, staffId, sellerNetPrice, exclusivityDays, notes } = params;

  if (!Number.isFinite(sellerNetPrice) || sellerNetPrice <= 0) {
    return { ok: false as const, reason: "invalid_price" as const };
  }
  const net = Math.round(sellerNetPrice);

  const economics = await getSaleEconomicsConfig();

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
      economics_version: "v3",
      seller_net_price: net,
      listing_markup_pct: economics.listingMarkupPct,
      target_markup_pct: economics.targetMarkupPct,
      team_floor_markup_pct: economics.teamFloorMarkupPct,
      hard_floor_markup_pct: economics.hardFloorMarkupPct,
      notary_fee_pct: economics.notaryFeePct,
      buyer_referral_pct: economics.buyerReferralPct,
      seller_referral_pct: economics.sellerReferralPct,
      bypass_fee_pct: economics.bypassFeePct,
      bypass_months: economics.bypassMonths,
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

  // The card the owner sees: the guaranteed net, exclusivity and the bypass
  // clause. Deliberately no listing price and no ladder; the seller never sees
  // Roogo's exact public price in the mandate.
  const { message } = await postSaleMessage({
    conversationId: conversation.id,
    senderId: staffId,
    senderType: "staff",
    messageType: "mandate_offer",
    body: "Proposition de mandat de vente",
    metadata: {
      mandate_id: mandate.id,
      economics_version: "v3",
      seller_net_price: net,
      exclusivity_days: exclusivityDays,
      bypass_months: economics.bypassMonths,
      bypass_fee_pct: economics.bypassFeePct,
      terms_version: MANDATE_TERMS_VERSION,
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
 * The owner signs a mandate, computes the exclusivity window, publishes the
 * price and posts a mandate_signed card into the seller thread.
 * - v3: properties.price = the ladder's listing rung (net + listing markup,
 *   rounded to 50,000 FCFA). properties.seller_asking_price is deliberately NOT
 *   overwritten with the net: public_property_details exposes every properties
 *   column to anon, so the guaranteed net would become public.
 * - v2: properties.price = desired_price (legacy rows fall back to list_price).
 * Staff adjust the public price later through the admin tools, without
 * notifying the seller.
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

  const v3Snapshot = mandateEconomicsSnapshot(mandate);
  const isV3 = v3Snapshot != null && Number(mandate.seller_net_price) > 0;
  // v3: publish at the listing rung. v2: publish at the owner's desired amount.
  // Staff may re-price afterwards.
  const publishedPrice = isV3
    ? publishedListingPrice(Number(mandate.seller_net_price), v3Snapshot)
    : (mandate.desired_price ?? mandate.list_price);
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
      // Never include the published price: this card is shown to the seller.
      metadata: isV3
        ? {
            mandate_id: mandate.id,
            economics_version: "v3",
            seller_net_price: Number(mandate.seller_net_price),
            exclusivity_end_at: end.toISOString(),
            bypass_months: v3Snapshot.bypassMonths,
            bypass_fee_pct: v3Snapshot.bypassFeePct,
            terms_version: mandate.terms_version,
            signed_typed_name: typedName,
          }
        : {
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

  return {
    ok: true as const,
    economicsVersion: isV3 ? ("v3" as const) : ("v2" as const),
    publishedPrice,
  };
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

/** The most recently signed v3 mandate for a property (any later status), or
 * null. Sale closings and the bypass clause are anchored on it. */
export async function getSignedV3MandateForProperty(propertyId: string) {
  const { data, error } = await supabaseAdmin
    .from("property_mandates")
    .select("*")
    .eq("property_id", propertyId)
    .eq("economics_version", "v3")
    .not("signed_at", "is", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle<MandateRow>();
  if (error) throw error;
  return data ?? null;
}

/**
 * Guard for a change to the PUBLIC price (properties.price) of a sale listing.
 * With a signed v3 mandate, the new price must stay on the mandate's ladder:
 * staff down to the team floor, founders down to the hard floor, never below.
 * Listings without a signed v3 mandate are not constrained here.
 */
export async function checkPublicSalePriceChange(params: {
  propertyId: string;
  newPrice: number;
  userType: string | null | undefined;
}): Promise<SalePriceDecision> {
  const mandate = await getSignedV3MandateForProperty(params.propertyId);
  if (!mandate || mandate.seller_net_price == null) return { ok: true };
  const snapshot = mandateEconomicsSnapshot(mandate);
  if (!snapshot) return { ok: true };
  return evaluateSalePriceChange({
    newPrice: params.newPrice,
    sellerNetPrice: Number(mandate.seller_net_price),
    snapshot,
    isFounder: params.userType === "founder",
  });
}
