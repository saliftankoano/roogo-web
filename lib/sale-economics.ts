// Roogo Sell economics v3: guaranteed seller price (migration 075).
// Pure functions, no I/O. This file is byte-identical in roogo-web
// (lib/sale-economics.ts) and the mobile app (roogo/constants/sale-economics.ts);
// change both together and run both test suites.
//
// Rules approved by the founder on 2026-09-27:
// - The seller receives exactly the net price named in the mandate (guaranteed).
// - Roogo lists above it. Ladder of markups over net: listing +30%, target +20%,
//   the team may accept down to +15%, between +15% and +10% only with the
//   founder's approval, below +10% refused (hard floor). Bypass sales are not
//   subject to the floor.
// - From the margin (final price minus net), paid as a percentage of the FINAL
//   sale price: notary 2% (always), buyer referrer 2% (only if a referrer brought
//   the buyer), seller referrer 1% (only if a referrer referred the seller).
//   Roogo keeps the rest.
// - Bypass: if sold within 12 months to a buyer Roogo introduced, Roogo is owed
//   10% of the sale price.
//
// Amounts are whole FCFA. Percentages are decimal fractions (0.30 = 30%).

export type SaleEconomicsSnapshot = {
  listingMarkupPct: number;
  targetMarkupPct: number;
  teamFloorMarkupPct: number;
  hardFloorMarkupPct: number;
  notaryFeePct: number;
  buyerReferralPct: number;
  sellerReferralPct: number;
  bypassFeePct: number;
  bypassMonths: number;
};

export const DEFAULT_SALE_ECONOMICS: SaleEconomicsSnapshot = {
  listingMarkupPct: 0.3,
  targetMarkupPct: 0.2,
  teamFloorMarkupPct: 0.15,
  hardFloorMarkupPct: 0.1,
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

export type SalePriceLadder = {
  /** Exact whole-FCFA values (what the server stores and checks against). */
  exact: {
    listing: number;
    target: number;
    teamFloor: number;
    hardFloor: number;
  };
  /** Display values: listing and target to the nearest 50,000 FCFA; floors
   * rounded UP to the next 50,000 FCFA so staff never quote below a floor. */
  display: {
    listing: number;
    target: number;
    teamFloor: number;
    hardFloor: number;
  };
};

/** The price ladder for a guaranteed net price. */
export function priceLadder(
  net: number,
  snapshot: Pick<
    SaleEconomicsSnapshot,
    | "listingMarkupPct"
    | "targetMarkupPct"
    | "teamFloorMarkupPct"
    | "hardFloorMarkupPct"
  >,
): SalePriceLadder {
  assertAmount("net", net);
  const listing = roundFcfa(net * (1 + snapshot.listingMarkupPct));
  const target = roundFcfa(net * (1 + snapshot.targetMarkupPct));
  // Floors are minimums: never round them down.
  const teamFloor = ceilFcfa(net * (1 + snapshot.teamFloorMarkupPct));
  const hardFloor = ceilFcfa(net * (1 + snapshot.hardFloorMarkupPct));
  return {
    exact: { listing, target, teamFloor, hardFloor },
    display: {
      listing: roundToStep(listing),
      target: roundToStep(target),
      teamFloor: ceilToStep(teamFloor),
      hardFloor: ceilToStep(hardFloor),
    },
  };
}

/** The price Roogo publishes on signing (properties.price): the listing rung,
 * rounded to the nearest 50,000 FCFA. */
export function publishedListingPrice(
  net: number,
  snapshot: Pick<
    SaleEconomicsSnapshot,
    | "listingMarkupPct"
    | "targetMarkupPct"
    | "teamFloorMarkupPct"
    | "hardFloorMarkupPct"
  >,
) {
  return priceLadder(net, snapshot).display.listing;
}

export type SaleSettlement = {
  finalPrice: number;
  sellerNetPrice: number;
  /** final - net, before fees. */
  grossMargin: number;
  notaryFee: number;
  buyerReferralFee: number;
  sellerReferralFee: number;
  /** What Roogo keeps: final - net - notary - referral fees. */
  roogoMargin: number;
  belowTeamFloor: boolean;
  belowHardFloor: boolean;
  /** True when fees exceed the margin (only possible below the hard floor or
   * with misconfigured percentages). Never save a closing in this state. */
  negativeMargin: boolean;
};

/** Split a final sale price between the seller's net, the notary, referrers
 * and Roogo. */
export function settle(
  finalPrice: number,
  net: number,
  snapshot: Pick<
    SaleEconomicsSnapshot,
    | "teamFloorMarkupPct"
    | "hardFloorMarkupPct"
    | "notaryFeePct"
    | "buyerReferralPct"
    | "sellerReferralPct"
  >,
  referrals: { buyerReferred: boolean; sellerReferred: boolean } = {
    buyerReferred: false,
    sellerReferred: false,
  },
): SaleSettlement {
  assertAmount("finalPrice", finalPrice);
  assertAmount("net", net);
  const notaryFee = roundFcfa(finalPrice * snapshot.notaryFeePct);
  const buyerReferralFee = referrals.buyerReferred
    ? roundFcfa(finalPrice * snapshot.buyerReferralPct)
    : 0;
  const sellerReferralFee = referrals.sellerReferred
    ? roundFcfa(finalPrice * snapshot.sellerReferralPct)
    : 0;
  const grossMargin = finalPrice - net;
  const roogoMargin =
    grossMargin - notaryFee - buyerReferralFee - sellerReferralFee;
  const teamFloor = ceilFcfa(net * (1 + snapshot.teamFloorMarkupPct));
  const hardFloor = ceilFcfa(net * (1 + snapshot.hardFloorMarkupPct));
  return {
    finalPrice,
    sellerNetPrice: net,
    grossMargin,
    notaryFee,
    buyerReferralFee,
    sellerReferralFee,
    roogoMargin,
    belowTeamFloor: finalPrice < teamFloor,
    belowHardFloor: finalPrice < hardFloor,
    negativeMargin: roogoMargin < 0,
  };
}

/** What Roogo is owed when the seller sells to a Roogo-introduced buyer
 * outside Roogo within the bypass window. */
export function bypassFee(
  finalPrice: number,
  snapshot: Pick<SaleEconomicsSnapshot, "bypassFeePct">,
) {
  assertAmount("finalPrice", finalPrice);
  return roundFcfa(finalPrice * snapshot.bypassFeePct);
}

/** Validate a config/snapshot: every percentage in [0, 1], floors ordered
 * hard <= team <= target <= listing, bypass months >= 1, and fees at the hard
 * floor never exceeding the margin. Returns a list of problems (empty = ok). */
export function validateSaleEconomics(config: SaleEconomicsSnapshot) {
  const problems: string[] = [];
  const pcts: (keyof SaleEconomicsSnapshot)[] = [
    "listingMarkupPct",
    "targetMarkupPct",
    "teamFloorMarkupPct",
    "hardFloorMarkupPct",
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
      config.hardFloorMarkupPct <= config.teamFloorMarkupPct &&
      config.teamFloorMarkupPct <= config.targetMarkupPct &&
      config.targetMarkupPct <= config.listingMarkupPct
    )
  ) {
    problems.push("markups must satisfy hard floor <= team floor <= target <= listing");
  }
  if (!Number.isInteger(config.bypassMonths) || config.bypassMonths < 1) {
    problems.push("bypassMonths must be a whole number >= 1");
  }
  const maxFees =
    config.notaryFeePct + config.buyerReferralPct + config.sellerReferralPct;
  if (
    snap((1 + config.hardFloorMarkupPct) * maxFees) >
    snap(config.hardFloorMarkupPct)
  ) {
    problems.push("fees at the hard floor would exceed the margin");
  }
  return problems;
}
