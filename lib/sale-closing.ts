import {
  bypassFee,
  settle,
  type SaleEconomicsSnapshot,
} from "@/lib/sale-economics";

// Roogo Sell v3 closing rules (migration 075, sale_closings). Pure functions so
// the admin route stays thin and the rules are unit-tested
// (lib/sale-closing.test.mjs). The database CHECK constraints enforce the same
// floor, margin and approval rules as a second line of defence.

export type SaleClosingStatus =
  | "draft"
  | "approved"
  | "notarized"
  | "settled"
  | "cancelled";

export type SaleClosingInput = {
  finalPrice: number;
  buyerUserId: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerReferred: boolean;
  sellerReferred: boolean;
  buyerReferrerLabel: string | null;
  sellerReferrerLabel: string | null;
  isBypass: boolean;
  soldAt: Date;
  notes: string | null;
};

export type SaleClosingMandate = {
  id: string;
  propertyId: string;
  sellerNetPrice: number;
  signedAt: Date;
  snapshot: SaleEconomicsSnapshot;
};

export type SaleClosingRejection =
  | "invalid_price"
  | "below_hard_floor"
  | "negative_margin"
  | "bypass_requires_buyer"
  | "buyer_not_introduced"
  | "bypass_window_expired"
  | "sold_before_mandate";

/** Calendar months after `date` (clamped to the month's last day). */
export function addMonths(date: Date, months: number) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** The bypass clause runs for `bypassMonths` from the mandate signature. */
export function bypassWindowEnd(signedAt: Date, bypassMonths: number) {
  return addMonths(signedAt, bypassMonths);
}

/**
 * The sale_closings row values for a closing, or why it is refused.
 * - Roogo sale: split with settle(); refused below the hard floor or with a
 *   negative margin. Between the hard and team floors it is saved as a draft
 *   that only the founder can approve.
 * - Bypass sale: the buyer must be a Roogo-introduced buyer (a visit request for
 *   this property) and the sale must fall inside the bypass window. Roogo is
 *   owed the bypass fee; no floor applies and no notary/referral split is made.
 */
export function buildClosingRow(
  input: SaleClosingInput,
  mandate: SaleClosingMandate,
  evidence: { buyerIntroduced: boolean },
):
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: SaleClosingRejection } {
  if (!Number.isFinite(input.finalPrice) || input.finalPrice <= 0) {
    return { ok: false, reason: "invalid_price" };
  }
  const finalPrice = Math.round(input.finalPrice);
  const net = mandate.sellerNetPrice;
  const s = mandate.snapshot;

  const common = {
    property_id: mandate.propertyId,
    mandate_id: mandate.id,
    buyer_user_id: input.buyerUserId,
    buyer_name: input.buyerName,
    buyer_phone: input.buyerPhone,
    final_price: finalPrice,
    seller_net_price: net,
    team_floor_markup_pct: s.teamFloorMarkupPct,
    hard_floor_markup_pct: s.hardFloorMarkupPct,
    notary_fee_pct: s.notaryFeePct,
    buyer_referral_pct: s.buyerReferralPct,
    seller_referral_pct: s.sellerReferralPct,
    bypass_fee_pct: s.bypassFeePct,
    sold_at: input.soldAt.toISOString(),
    notes: input.notes,
    status: "draft" as SaleClosingStatus,
    approved_by: null,
    approved_at: null,
  };

  if (input.isBypass) {
    if (!input.buyerUserId) return { ok: false, reason: "bypass_requires_buyer" };
    if (!evidence.buyerIntroduced) {
      return { ok: false, reason: "buyer_not_introduced" };
    }
    if (input.soldAt.getTime() < mandate.signedAt.getTime()) {
      return { ok: false, reason: "sold_before_mandate" };
    }
    if (
      input.soldAt.getTime() >
      bypassWindowEnd(mandate.signedAt, s.bypassMonths).getTime()
    ) {
      return { ok: false, reason: "bypass_window_expired" };
    }
    const fee = bypassFee(finalPrice, s);
    return {
      ok: true,
      row: {
        ...common,
        is_bypass: true,
        buyer_referred: false,
        seller_referred: false,
        buyer_referrer_label: null,
        seller_referrer_label: null,
        notary_fee: 0,
        buyer_referral_fee: 0,
        seller_referral_fee: 0,
        bypass_fee: fee,
        roogo_margin: fee,
        below_team_floor: false,
      },
    };
  }

  const split = settle(finalPrice, net, s, {
    buyerReferred: input.buyerReferred,
    sellerReferred: input.sellerReferred,
  });
  if (split.belowHardFloor) return { ok: false, reason: "below_hard_floor" };
  if (split.negativeMargin) return { ok: false, reason: "negative_margin" };
  return {
    ok: true,
    row: {
      ...common,
      is_bypass: false,
      buyer_referred: input.buyerReferred,
      seller_referred: input.sellerReferred,
      buyer_referrer_label: input.buyerReferred ? input.buyerReferrerLabel : null,
      seller_referrer_label: input.sellerReferred
        ? input.sellerReferrerLabel
        : null,
      notary_fee: split.notaryFee,
      buyer_referral_fee: split.buyerReferralFee,
      seller_referral_fee: split.sellerReferralFee,
      bypass_fee: null,
      roogo_margin: split.roogoMargin,
      below_team_floor: split.belowTeamFloor,
    },
  };
}

export type SaleClosingAction =
  | "approve"
  | "notarize"
  | "mark_paid"
  | "settle"
  | "cancel";

export type SaleClosingState = {
  status: SaleClosingStatus;
  below_team_floor: boolean;
  is_bypass: boolean;
  roogo_paid_at: string | null;
};

/**
 * The update for a status action, or why it is refused. `expectedStatus` is the
 * status the update must still match (optimistic concurrency guard).
 */
export function closingTransition(
  closing: SaleClosingState,
  action: SaleClosingAction,
  actor: { userId: string; isFounder: boolean },
  now: Date,
):
  | {
      ok: true;
      expectedStatus: SaleClosingStatus;
      patch: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: "invalid_transition" | "founder_approval_required" | "not_paid";
    } {
  const at = now.toISOString();
  switch (action) {
    case "approve":
      if (closing.status !== "draft") {
        return { ok: false, reason: "invalid_transition" };
      }
      if (closing.below_team_floor && !closing.is_bypass && !actor.isFounder) {
        return { ok: false, reason: "founder_approval_required" };
      }
      return {
        ok: true,
        expectedStatus: "draft",
        patch: { status: "approved", approved_by: actor.userId, approved_at: at },
      };
    case "notarize":
      if (closing.status !== "approved") {
        return { ok: false, reason: "invalid_transition" };
      }
      return {
        ok: true,
        expectedStatus: "approved",
        patch: { status: "notarized", notary_signed_at: at },
      };
    case "mark_paid":
      if (closing.status !== "notarized" || closing.roogo_paid_at) {
        return { ok: false, reason: "invalid_transition" };
      }
      return {
        ok: true,
        expectedStatus: "notarized",
        patch: { roogo_paid_at: at },
      };
    case "settle":
      if (closing.status !== "notarized") {
        return { ok: false, reason: "invalid_transition" };
      }
      if (!closing.roogo_paid_at) return { ok: false, reason: "not_paid" };
      return {
        ok: true,
        expectedStatus: "notarized",
        patch: { status: "settled" },
      };
    case "cancel":
      if (closing.status === "settled" || closing.status === "cancelled") {
        return { ok: false, reason: "invalid_transition" };
      }
      return {
        ok: true,
        expectedStatus: closing.status,
        patch: { status: "cancelled" },
      };
    default:
      return { ok: false, reason: "invalid_transition" };
  }
}
