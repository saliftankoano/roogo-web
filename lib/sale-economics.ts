// Roogo Sell economics: commission on the owner's price + listing ladder.
// Pure functions, no I/O. This file is byte-identical in roogo-web
// (lib/sale-economics.ts) and the mobile app (roogo/constants/sale-economics.ts);
// change both together and run both test suites.
//
// Rules approved by the founder on 2026-10-11 (vault: "Roogo Sell commission with
// listing ladder"):
// - Commission (migration 050): Roogo earns base% of the owner's price D plus
//   split% of any surplus above D. Owner receives the final price minus that.
// - The public price defaults to the top of the ladder: D + 30%, never D itself.
// - Ladder of markups over D: listing +30% (published by default), target +20%,
//   +15% as a display reference only, and the team floor at +10%.
// - Permissions (Founder, 2026-10-17, replaces the 2026-10-12 hard stop): the
//   team may agree any price from +10% (inclusive) up to +30% on its own. A
//   price below +10% is allowed only with the founder's approval; it is no
//   longer refused outright. See `salePriceApproval`.
// - Notary 2%, buyer referrer 2% and seller referrer 1% of the final price are
//   paid out of Roogo's commission, never out of the owner's share.
// - Bypass: if sold within 12 months to a buyer Roogo introduced, Roogo is owed
//   10% of the sale price.
//
// Amounts are whole FCFA. Percentages are decimal fractions (0.30 = 30%).

export type SaleLadderPcts = {
  listingMarkupPct: number;
  targetMarkupPct: number;
  /** Display reference only (+15%), never a permission boundary. */
  referenceMarkupPct: number;
  /** Lowest markup the team may agree without the founder (+10%, inclusive). */
  teamFloorMarkupPct: number;
};

export type SaleCommissionPcts = {
  baseCommissionPct: number;
  surplusSplitPct: number;
};

export type SaleFeePcts = {
  notaryFeePct: number;
  buyerReferralPct: number;
  sellerReferralPct: number;
};

export type SaleEconomicsSnapshot = SaleLadderPcts &
  SaleCommissionPcts &
  SaleFeePcts & {
    bypassFeePct: number;
    bypassMonths: number;
  };

export const DEFAULT_SALE_ECONOMICS: SaleEconomicsSnapshot = {
  listingMarkupPct: 0.3,
  targetMarkupPct: 0.2,
  referenceMarkupPct: 0.15,
  teamFloorMarkupPct: 0.1,
  baseCommissionPct: 0.1,
  surplusSplitPct: 0.5,
  notaryFeePct: 0.02,
  buyerReferralPct: 0.02,
  sellerReferralPct: 0.01,
  bypassFeePct: 0.1,
  bypassMonths: 12,
};

/** Published and displayed ladder prices are rounded to this step (FCFA). */
export const SALE_PRICE_DISPLAY_STEP = 50_000;

// Float products like 35_000_000 * 1.1 land a hair off the integer
// (38_500_000.000000007). Snap to 4 decimals first, then take whole FCFA.
function snap(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function roundFcfa(value: number) {
  return Math.round(snap(value));
}

function ceilFcfa(value: number) {
  return Math.ceil(snap(value));
}

function assertAmount(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive amount`);
  }
}

/** Nearest multiple of `step` (default 50,000 FCFA). */
export function roundToStep(value: number, step = SALE_PRICE_DISPLAY_STEP) {
  return Math.round(snap(value) / step) * step;
}

/** Smallest multiple of `step` that is >= value. Used for floors so a displayed
 * floor is never below the real one. */
export function ceilToStep(value: number, step = SALE_PRICE_DISPLAY_STEP) {
  return Math.ceil(snap(value) / step) * step;
}

export type SaleLadderLevel = "listing" | "target" | "reference" | "teamFloor";

export type SalePriceLadder = {
  /** Exact whole-FCFA values (what the server checks against). */
  exact: Record<SaleLadderLevel, number>;
  /** Display values: listing, target and reference to the nearest 50,000
   * FCFA; the team floor rounded UP to the next 50,000 FCFA so staff never
   * quote below the real +10%. */
  display: Record<SaleLadderLevel, number>;
};

/** The price ladder above the owner's price. */
export function priceLadder(
  ownerPrice: number,
  pcts: SaleLadderPcts,
): SalePriceLadder {
  assertAmount("ownerPrice", ownerPrice);
  const listing = roundFcfa(ownerPrice * (1 + pcts.listingMarkupPct));
  const target = roundFcfa(ownerPrice * (1 + pcts.targetMarkupPct));
  const reference = roundFcfa(ownerPrice * (1 + pcts.referenceMarkupPct));
  // The team floor is a minimum: never round it down.
  const teamFloor = ceilFcfa(ownerPrice * (1 + pcts.teamFloorMarkupPct));
  return {
    exact: { listing, target, reference, teamFloor },
    display: {
      listing: roundToStep(listing),
      target: roundToStep(target),
      reference: roundToStep(reference),
      teamFloor: ceilToStep(teamFloor),
    },
  };
}

/** Who may agree a sale price (Founder, 2026-10-17): "team" from the +10% team
 * floor (inclusive, exact whole FCFA) upwards, "founder" below it. */
export type SalePriceApproval = "team" | "founder";

export function salePriceApproval(
  price: number,
  ownerPrice: number,
  pcts: SaleLadderPcts,
): SalePriceApproval {
  assertAmount("price", price);
  return price >= priceLadder(ownerPrice, pcts).exact.teamFloor ? "team" : "founder";
}

/** The public price Roogo publishes for an owner's price: the top rung of the
 * ladder, rounded to the nearest 50,000 FCFA. */
export function publishedListingPrice(ownerPrice: number, pcts: SaleLadderPcts) {
  return priceLadder(ownerPrice, pcts).display.listing;
}

/** The ladder (+30% public price, +10% team floor, founder approval below)
 * applies ONLY to properties for sale (listing_type "vendre"). Rentals, daily
 * or monthly, keep their price exactly as set (Salif, 2026-10-17). */
export function saleLadderApplies(listingType: string | null | undefined) {
  return listingType === "vendre";
}

/** The public price to store for a new listing: owner price + 30% for a sale,
 * the entered price unchanged for any rental. */
export function publicPriceForNewListing(
  listingType: string | null | undefined,
  enteredPrice: number,
  pcts: SaleLadderPcts,
) {
  return saleLadderApplies(listingType)
    ? publishedListingPrice(enteredPrice, pcts)
    : enteredPrice;
}

export type SaleCommission = {
  finalPrice: number;
  ownerPrice: number;
  /** max(0, final - owner price). */
  surplus: number;
  /** base% x owner price + split% x surplus. */
  roogoCommission: number;
  /** final - Roogo commission. */
  ownerReceives: number;
};

/** Split a final sale price between the owner and Roogo (before Roogo pays the
 * notary and any referrers out of its commission). */
export function commissionAt(
  finalPrice: number,
  ownerPrice: number,
  pcts: SaleCommissionPcts,
): SaleCommission {
  assertAmount("finalPrice", finalPrice);
  assertAmount("ownerPrice", ownerPrice);
  const surplus = Math.max(0, finalPrice - ownerPrice);
  const roogoCommission = roundFcfa(
    ownerPrice * pcts.baseCommissionPct + surplus * pcts.surplusSplitPct,
  );
  return {
    finalPrice,
    ownerPrice,
    surplus,
    roogoCommission,
    ownerReceives: finalPrice - roogoCommission,
  };
}

export type SaleRoogoNet = {
  notaryFee: number;
  buyerReferralFee: number;
  sellerReferralFee: number;
  /** Roogo commission minus the fees Roogo pays. */
  roogoNet: number;
};

/** What Roogo keeps after paying the notary and any referrers from its commission. */
export function roogoNetAfterFees(
  commission: SaleCommission,
  fees: SaleFeePcts,
  referrals: { buyerReferred: boolean; sellerReferred: boolean } = {
    buyerReferred: false,
    sellerReferred: false,
  },
): SaleRoogoNet {
  const notaryFee = roundFcfa(commission.finalPrice * fees.notaryFeePct);
  const buyerReferralFee = referrals.buyerReferred
    ? roundFcfa(commission.finalPrice * fees.buyerReferralPct)
    : 0;
  const sellerReferralFee = referrals.sellerReferred
    ? roundFcfa(commission.finalPrice * fees.sellerReferralPct)
    : 0;
  return {
    notaryFee,
    buyerReferralFee,
    sellerReferralFee,
    roogoNet:
      commission.roogoCommission - notaryFee - buyerReferralFee - sellerReferralFee,
  };
}

export type SalePayoutRow = {
  level: SaleLadderLevel;
  markupPct: number;
  /** Display price of this rung (50,000 FCFA step). */
  price: number;
  ownerReceives: number;
  roogoCommission: number;
};

/** The payout table shown to the owner and the team: what the owner receives
 * and Roogo's commission at each rung of the ladder. */
export function payoutTable(
  ownerPrice: number,
  pcts: SaleLadderPcts & SaleCommissionPcts,
): SalePayoutRow[] {
  const { display } = priceLadder(ownerPrice, pcts);
  const levels: [SaleLadderLevel, number][] = [
    ["listing", pcts.listingMarkupPct],
    ["target", pcts.targetMarkupPct],
    ["reference", pcts.referenceMarkupPct],
    ["teamFloor", pcts.teamFloorMarkupPct],
  ];
  return levels.map(([level, markupPct]) => {
    const c = commissionAt(display[level], ownerPrice, pcts);
    return {
      level,
      markupPct,
      price: display[level],
      ownerReceives: c.ownerReceives,
      roogoCommission: c.roogoCommission,
    };
  });
}

/** What Roogo is owed when the seller sells to a Roogo-introduced buyer
 * outside Roogo within the bypass window. */
export function bypassFee(
  finalPrice: number,
  pcts: Pick<SaleEconomicsSnapshot, "bypassFeePct">,
) {
  assertAmount("finalPrice", finalPrice);
  return roundFcfa(finalPrice * pcts.bypassFeePct);
}

/** "30 %" style label for a decimal fraction. */
export function formatSalePct(pct: number) {
  return `${Math.round(snap(pct * 100) * 100) / 100} %`;
}

/** Validate a config/snapshot: every percentage in [0, 1], ladder ordered
 * team floor <= reference <= target <= listing, bypass months >= 1, and Roogo's
 * commission covering the notary and both referrers at the team floor and at
 * the owner's own price (the founder may approve a price below +10%). Returns a
 * list of problems (empty = ok). */
export function validateSaleEconomics(config: SaleEconomicsSnapshot) {
  const problems: string[] = [];
  const pcts: (keyof SaleEconomicsSnapshot)[] = [
    "listingMarkupPct",
    "targetMarkupPct",
    "referenceMarkupPct",
    "teamFloorMarkupPct",
    "baseCommissionPct",
    "surplusSplitPct",
    "notaryFeePct",
    "buyerReferralPct",
    "sellerReferralPct",
    "bypassFeePct",
  ];
  for (const key of pcts) {
    const value = config[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      problems.push(`${key} must be between 0 and 1`);
    }
  }
  if (
    !(
      config.teamFloorMarkupPct <= config.referenceMarkupPct &&
      config.referenceMarkupPct <= config.targetMarkupPct &&
      config.targetMarkupPct <= config.listingMarkupPct
    )
  ) {
    problems.push("markups must satisfy team floor <= reference <= target <= listing");
  }
  if (!Number.isInteger(config.bypassMonths) || config.bypassMonths < 1) {
    problems.push("bypassMonths must be a whole number >= 1");
  }
  // Per unit of owner price, at the team floor tf:
  // commission = base + split * tf; fees = (1 + tf) * (notary + both referrers).
  const feePct =
    config.notaryFeePct + config.buyerReferralPct + config.sellerReferralPct;
  const commissionAtFloor =
    config.baseCommissionPct + config.surplusSplitPct * config.teamFloorMarkupPct;
  if (snap((1 + config.teamFloorMarkupPct) * feePct) > snap(commissionAtFloor)) {
    problems.push("fees at the team floor would exceed Roogo's commission");
  }
  // At the owner's own price (no surplus): commission = base, fees = feePct.
  // Below it the fees shrink with the price while the base commission does not.
  if (snap(feePct) > snap(config.baseCommissionPct)) {
    problems.push("fees at the owner's price would exceed Roogo's commission");
  }
  return problems;
}
