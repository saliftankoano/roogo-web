import { notifyUser } from "@/lib/push-notifications";
import {
  getOrCreateSellerConversation,
  postSaleMessage,
} from "@/lib/sale-chat";
import { MANDATE_TERMS_VERSION } from "@/lib/sale";
import {
  DEFAULT_SALE_ECONOMICS,
  commissionAt,
  payoutTable,
  publishedListingPrice,
  roogoNetAfterFees,
  type SaleFeePcts,
  type SaleLadderLevel,
  type SaleLadderPcts,
  type SalePayoutRow,
} from "@/lib/sale-economics";
import {
  evaluateSalePriceChange,
  type SalePriceDecision,
} from "@/lib/sale-price-guard";
import { supabaseAdmin } from "@/lib/supabase-admin";

// The price + exclusivity mandate the owner signs. Economics v2 (migration 050):
// staff send an offer built on the owner's desired price; Roogo's commission is a
// base percentage of that amount plus a share of any surplus above it at closing.
// The percentages come from listing_config and are snapshotted onto the mandate so
// later settings changes never rewrite an agreed mandate.
//
// Listing ladder (Salif, 2026-10-11): the public price is never the owner's own
// number. Sending a mandate snapshots the ladder (sale_economics_config, migration
// 075) onto it; signing publishes properties.price = desired_price + listing
// markup (+30%). Staff move the public price within the ladder afterwards
// (checkPublicSalePriceChange). The owner sees the listing price and the payout
// table on the offer card. The offer and signature are mirrored into the
// seller↔Roogo thread.

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
  /** Ladder snapshot at send time (migration 075; null on mandates sent before
   * 2026-10-11, which fall back to the live config). */
  listing_markup_pct: number | null;
  target_markup_pct: number | null;
  team_floor_markup_pct: number | null;
  hard_floor_markup_pct: number | null;
  notary_fee_pct: number | null;
  buyer_referral_pct: number | null;
  seller_referral_pct: number | null;
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

function num(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export type SaleLadderConfig = SaleLadderPcts & SaleFeePcts;

/**
 * The live price ladder and helper fees (sale_economics_config, service role
 * only). Falls back to the approved defaults if the table cannot be read, so a
 * sale is never published at the owner's own price.
 */
export async function getSaleLadderConfig(): Promise<SaleLadderConfig> {
  const { data, error } = await supabaseAdmin
    .from("sale_economics_config")
    .select(
      "listing_markup_pct, target_markup_pct, team_floor_markup_pct, hard_floor_markup_pct, notary_fee_pct, buyer_referral_pct, seller_referral_pct",
    )
    .eq("id", "default")
    .maybeSingle();
  const config: SaleLadderConfig = {
    listingMarkupPct: num(data?.listing_markup_pct),
    targetMarkupPct: num(data?.target_markup_pct),
    teamFloorMarkupPct: num(data?.team_floor_markup_pct),
    hardFloorMarkupPct: num(data?.hard_floor_markup_pct),
    notaryFeePct: num(data?.notary_fee_pct),
    buyerReferralPct: num(data?.buyer_referral_pct),
    sellerReferralPct: num(data?.seller_referral_pct),
  };
  const valid =
    !error &&
    Object.values(config).every((v) => Number.isFinite(v) && v >= 0 && v <= 1) &&
    config.hardFloorMarkupPct <= config.teamFloorMarkupPct &&
    config.teamFloorMarkupPct <= config.targetMarkupPct &&
    config.targetMarkupPct <= config.listingMarkupPct;
  if (!valid) {
    console.warn("Sale ladder config unavailable, using defaults:", {
      code: error?.code ?? null,
    });
    const d = DEFAULT_SALE_ECONOMICS;
    return {
      listingMarkupPct: d.listingMarkupPct,
      targetMarkupPct: d.targetMarkupPct,
      teamFloorMarkupPct: d.teamFloorMarkupPct,
      hardFloorMarkupPct: d.hardFloorMarkupPct,
      notaryFeePct: d.notaryFeePct,
      buyerReferralPct: d.buyerReferralPct,
      sellerReferralPct: d.sellerReferralPct,
    };
  }
  return config;
}

/** The ladder snapshotted on a mandate, or null for mandates sent before it. */
function mandateLadder(mandate: MandateRow): SaleLadderPcts | null {
  const pcts = {
    listingMarkupPct: num(mandate.listing_markup_pct),
    targetMarkupPct: num(mandate.target_markup_pct),
    teamFloorMarkupPct: num(mandate.team_floor_markup_pct),
    hardFloorMarkupPct: num(mandate.hard_floor_markup_pct),
  };
  return Object.values(pcts).every(Number.isFinite) ? pcts : null;
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

  const [commission, ladder] = await Promise.all([
    getSaleCommissionConfig(),
    getSaleLadderConfig(),
  ]);
  const listingPrice = publishedListingPrice(desiredPrice, ladder);
  const payout = payoutTable(desiredPrice, {
    ...ladder,
    baseCommissionPct: commission.baseCommissionPct,
    surplusSplitPct: commission.surplusSplitPct,
  });

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
      listing_markup_pct: ladder.listingMarkupPct,
      target_markup_pct: ladder.targetMarkupPct,
      team_floor_markup_pct: ladder.teamFloorMarkupPct,
      hard_floor_markup_pct: ladder.hardFloorMarkupPct,
      notary_fee_pct: ladder.notaryFeePct,
      buyer_referral_pct: ladder.buyerReferralPct,
      seller_referral_pct: ladder.sellerReferralPct,
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

  // The card the owner sees: their price, the commission on it, the surplus
  // clause, the listing price Roogo will publish and what they receive at each
  // rung of the ladder (decision of 2026-10-11: owners see the table).
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
      listing_price: listingPrice,
      payout_table: payout,
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
 * The owner signs a mandate. Publishes properties.price at the top of the ladder
 * (desired_price + listing markup; legacy spread rows fall back to list_price),
 * computes the exclusivity window, and posts a mandate_signed card into the
 * seller thread. Staff move the price within the ladder afterwards.
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

  // Publish at the top of the ladder, never at the owner's own price.
  let publishedPrice: number | null = mandate.list_price;
  if (mandate.desired_price != null) {
    const ladder = mandateLadder(mandate) ?? (await getSaleLadderConfig());
    publishedPrice = publishedListingPrice(Number(mandate.desired_price), ladder);
  }
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
        listing_price: publishedPrice,
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

/**
 * Guard for a change to the PUBLIC price (properties.price) of a sale listing.
 * The owner's price is the latest signed mandate's desired_price, or before any
 * mandate, the private asking price from the listing wizard. The new price must
 * stay on the ladder: staff down to +15%, founders down to +10%, never below.
 * Non-sale listings and sales with no known owner price are not constrained.
 */
export async function checkPublicSalePriceChange(params: {
  propertyId: string;
  newPrice: number;
  userType: string | null | undefined;
}): Promise<SalePriceDecision> {
  const { data: property, error } = await supabaseAdmin
    .from("properties")
    .select("listing_type")
    .eq("id", params.propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!property || property.listing_type !== "vendre") return { ok: true };

  const { data: mandate, error: mandateError } = await supabaseAdmin
    .from("property_mandates")
    .select("*")
    .eq("property_id", params.propertyId)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle<MandateRow>();
  if (mandateError) throw mandateError;

  let ownerPrice: number | null =
    mandate?.desired_price != null ? Number(mandate.desired_price) : null;
  if (ownerPrice == null) {
    ownerPrice = await getPrivateAskingPrice(params.propertyId);
  }
  if (ownerPrice == null || !(ownerPrice > 0)) return { ok: true };

  const pcts = (mandate && mandateLadder(mandate)) ?? (await getSaleLadderConfig());
  return evaluateSalePriceChange({
    newPrice: params.newPrice,
    ownerPrice,
    pcts,
    isFounder: params.userType === "founder",
  });
}

/** The owner's asking price from the listing wizard (service role only). */
export async function getPrivateAskingPrice(propertyId: string) {
  const { data, error } = await supabaseAdmin
    .from("sale_asking_prices")
    .select("seller_asking_price")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) {
    // Table missing until migration 084 runs. Never log the amount.
    console.warn("Private asking price unavailable:", { propertyId, code: error.code });
    return null;
  }
  const value = Number(data?.seller_asking_price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export type StaffSaleLadder = {
  ownerPrice: number;
  /** Where the owner's price comes from: the signed (or latest) mandate, or the
   * listing wizard before any mandate. */
  ownerPriceSource: "mandate" | "listing";
  mandateStatus: MandateRow["status"] | null;
  currentPrice: number;
  baseCommissionPct: number;
  surplusSplitPct: number;
  /** Highest rung at or below the current public price, or "belowFloor". */
  currentLevel: SaleLadderLevel | "belowFloor";
  rows: (SalePayoutRow & {
    roogoAfterNotary: number;
    roogoAfterAllFees: number;
  })[];
};

/**
 * Staff-only view of a sale listing's price ladder: what the owner receives and
 * what Roogo keeps at each rung, and where the current public price sits.
 * Returns null for non-sales or when the owner's price is unknown. Never expose
 * this to owners or buyers: it contains the owner's private price.
 */
export async function getStaffSaleLadder(
  propertyId: string,
): Promise<StaffSaleLadder | null> {
  const { data: property, error } = await supabaseAdmin
    .from("properties")
    .select("listing_type, price")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!property || property.listing_type !== "vendre") return null;

  const mandate = await getLatestMandateForProperty(propertyId);
  const live =
    mandate && ["sent", "signed"].includes(mandate.status) && mandate.desired_price != null
      ? mandate
      : null;
  let ownerPrice = live ? Number(live.desired_price) : null;
  const ownerPriceSource: StaffSaleLadder["ownerPriceSource"] = live
    ? "mandate"
    : "listing";
  if (ownerPrice == null) ownerPrice = await getPrivateAskingPrice(propertyId);
  if (ownerPrice == null || !(ownerPrice > 0)) return null;

  const ladder = (live && mandateLadder(live)) ?? (await getSaleLadderConfig());
  const fees = await getSaleLadderConfig();
  let base = Number(live?.base_commission_pct);
  let split = Number(live?.surplus_split_pct);
  if (!Number.isFinite(base) || !Number.isFinite(split)) {
    const commission = await getSaleCommissionConfig();
    base = commission.baseCommissionPct;
    split = commission.surplusSplitPct;
  }

  const pcts = { ...ladder, baseCommissionPct: base, surplusSplitPct: split };
  const rows = payoutTable(ownerPrice, pcts).map((row) => {
    const c = commissionAt(row.price, ownerPrice as number, pcts);
    return {
      ...row,
      roogoAfterNotary: roogoNetAfterFees(c, fees).roogoNet,
      roogoAfterAllFees: roogoNetAfterFees(c, fees, {
        buyerReferred: true,
        sellerReferred: true,
      }).roogoNet,
    };
  });

  const currentPrice = Number(property.price) || 0;
  const reached = rows.find((row) => currentPrice >= row.price);
  return {
    ownerPrice,
    ownerPriceSource,
    mandateStatus: mandate?.status ?? null,
    currentPrice,
    baseCommissionPct: base,
    surplusSplitPct: split,
    currentLevel: reached ? reached.level : "belowFloor",
    rows,
  };
}
