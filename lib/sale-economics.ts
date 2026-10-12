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
// - Ladder of markups over D: listing +30%, target +20%, the team may accept down
//   to +15%, between +15% and +10% only with the founder's approval, below +10%
//   refused (hard stop).
// - Notary 2%, buyer referrer 2% and seller referrer 1% of the final price are
//   paid out of Roogo's commission, never out of the owner's share.
// - Bypass: if sold within 12 months to a buyer Roogo introduced, Roogo is owed
//   10% of the sale price.
//
// Amounts are whole FCFA. Percentages are decimal fractions (0.30 = 30%).

export type SaleLadderPcts = {
  listingMarkupPct: number;
  targetMarkupPct: number;
  teamFloorMarkupPct: number;
  hardFloorMarkupPct: number;
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
  teamFloorMarkupPct: 0.15,
  hardFloorMarkupPct: 0.1,
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

export type SaleLadderLevel = "listing" | "target" | "teamFloor" | "hardFloor";

export type SalePriceLadder = {
  /** Exact whole-FCFA values (what the server checks against). */
  exact: Record<SaleLadderLevel, number>;
  /** Display values: listing and target to the nearest 50,000 FCFA; floors
   * rounded UP to the next 50,000 FCFA so staff never quote below a floor. */
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
  // Floors are minimums: never round them down.
  const teamFloor = ceilFcfa(ownerPrice * (1 + pcts.teamFloorMarkupPct));
  const hardFloor = ceilFcfa(ownerPrice * (1 + pcts.hardFloorMarkupPct));
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

/** The public price Roogo publishes for an owner's price: the top rung of the
 * ladder, rounded to the nearest 50,000 FCFA. */
export function publishedListingPrice(ownerPrice: number, pcts: SaleLadderPcts) {
  return priceLadder(ownerPrice, pcts).display.listing;
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
    ["teamFloor", pcts.teamFloorMarkupPct],
    ["hardFloor", pcts.hardFloorMarkupPct],
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
 * hard <= team <= target <= listing, bypass months >= 1, and Roogo's commission
 * at the hard floor always covering the notary and both referrers. Returns a
 * list of problems (empty = ok). */
export function validateSaleEconomics(config: SaleEconomicsSnapshot) {
  const problems: string[] = [];
  const pcts: (keyof SaleEconomicsSnapshot)[] = [
    "listingMarkupPct",
    "targetMarkupPct",
    "teamFloorMarkupPct",
    "hardFloorMarkupPct",
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
  // Per unit of owner price, at the hard floor:
  // commission = base + split * hf; fees = (1 + hf) * (notary + both referrers).
  const commissionAtFloor =
    config.baseCommissionPct + config.surplusSplitPct * config.hardFloorMarkupPct;
  const maxFees =
    (1 + config.hardFloorMarkupPct) *
    (config.notaryFeePct + config.buyerReferralPct + config.sellerReferralPct);
  if (snap(maxFees) > snap(commissionAtFloor)) {
    problems.push("fees at the hard floor would exceed Roogo's commission");
  }
  return problems;
}
