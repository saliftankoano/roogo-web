import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SALE_ECONOMICS,
  bypassFee,
  ceilToStep,
  priceLadder,
  publishedListingPrice,
  roundToStep,
  settle,
  validateSaleEconomics,
} from "./sale-economics.ts";

const NET = 35_000_000;
const cfg = DEFAULT_SALE_ECONOMICS;
const M = 1_000_000;

// Worked example approved by the founder on 2026-09-27 (net 35M, amounts in
// millions, Roogo's margin for: Roogo alone / buyer referred / both referrers).
// The table prints two decimals; exact FCFA values are asserted here
// (8.225M prints as 8.22, 4.445M as 4.45, 3.2375M as 3.24, 1.575M as 1.57).
const TABLE = [
  { final: 45.5, alone: 9.59, buyer: 8.68, both: 8.225 },
  { final: 42.0, alone: 6.16, buyer: 5.32, both: 4.9 },
  { final: 40.25, alone: 4.445, buyer: 3.64, both: 3.2375 },
  { final: 38.5, alone: 2.73, buyer: 1.96, both: 1.575 },
];

describe("priceLadder", () => {
  it("lists net 35M at 45.5M with target 42M and floors 40.25M / 38.5M", () => {
    const ladder = priceLadder(NET, cfg);
    assert.deepEqual(ladder.exact, {
      listing: 45_500_000,
      target: 42_000_000,
      teamFloor: 40_250_000,
      hardFloor: 38_500_000,
    });
    assert.deepEqual(ladder.display, ladder.exact);
    assert.equal(publishedListingPrice(NET, cfg), 45_500_000);
  });

  it("rounds display prices to 50,000 FCFA and never rounds floors down", () => {
    const ladder = priceLadder(33_333_333, cfg);
    assert.equal(ladder.exact.listing, 43_333_333);
    assert.equal(ladder.display.listing, 43_350_000);
    assert.equal(ladder.exact.target, 40_000_000);
    assert.equal(ladder.display.target, 40_000_000);
    assert.equal(ladder.exact.teamFloor, 38_333_333);
    assert.equal(ladder.display.teamFloor, 38_350_000);
    assert.equal(ladder.exact.hardFloor, 36_666_667);
    assert.equal(ladder.display.hardFloor, 36_700_000);
    assert.ok(ladder.display.teamFloor >= ladder.exact.teamFloor);
    assert.ok(ladder.display.hardFloor >= ladder.exact.hardFloor);
  });

  it("rejects a non-positive net", () => {
    assert.throws(() => priceLadder(0, cfg));
    assert.throws(() => priceLadder(-1, cfg));
    assert.throws(() => priceLadder(Number.NaN, cfg));
  });
});

describe("rounding helpers", () => {
  it("rounds to the nearest step and ceils to the next step", () => {
    assert.equal(roundToStep(45_524_999), 45_500_000);
    assert.equal(roundToStep(45_525_000), 45_550_000);
    assert.equal(ceilToStep(45_500_001), 45_550_000);
    assert.equal(ceilToStep(45_500_000), 45_500_000);
    assert.equal(roundToStep(1_234_567, 100_000), 1_200_000);
  });
});

describe("settle", () => {
  for (const row of TABLE) {
    it(`splits a ${row.final}M sale on a 35M net`, () => {
      const final = Math.round(row.final * M);
      const alone = settle(final, NET, cfg);
      const buyer = settle(final, NET, cfg, {
        buyerReferred: true,
        sellerReferred: false,
      });
      const both = settle(final, NET, cfg, {
        buyerReferred: true,
        sellerReferred: true,
      });
      assert.equal(alone.roogoMargin, Math.round(row.alone * M));
      assert.equal(buyer.roogoMargin, Math.round(row.buyer * M));
      assert.equal(both.roogoMargin, Math.round(row.both * M));
      // The seller always gets exactly the net; everything adds back up.
      for (const s of [alone, buyer, both]) {
        assert.equal(s.sellerNetPrice, NET);
        assert.equal(
          s.sellerNetPrice +
            s.notaryFee +
            s.buyerReferralFee +
            s.sellerReferralFee +
            s.roogoMargin,
          final,
        );
        assert.equal(s.notaryFee, Math.round(final * 0.02));
        assert.equal(s.negativeMargin, false);
        assert.equal(s.belowHardFloor, false);
      }
      assert.equal(alone.buyerReferralFee, 0);
      assert.equal(alone.sellerReferralFee, 0);
      assert.equal(buyer.buyerReferralFee, Math.round(final * 0.02));
      assert.equal(both.sellerReferralFee, Math.round(final * 0.01));
    });
  }

  it("matches the plan example: 42M with a middleman bringing the buyer", () => {
    const s = settle(42_000_000, NET, cfg, {
      buyerReferred: true,
      sellerReferred: false,
    });
    assert.equal(s.notaryFee, 840_000);
    assert.equal(s.buyerReferralFee, 840_000);
    assert.equal(s.roogoMargin, 5_320_000);
  });

  it("treats exactly +15% as at the team floor (no founder approval)", () => {
    const atTeamFloor = settle(40_250_000, NET, cfg);
    assert.equal(atTeamFloor.belowTeamFloor, false);
    assert.equal(atTeamFloor.belowHardFloor, false);
    const justBelow = settle(40_249_999, NET, cfg);
    assert.equal(justBelow.belowTeamFloor, true);
    assert.equal(justBelow.belowHardFloor, false);
  });

  it("treats exactly +10% as allowed (founder approval) and below as refused", () => {
    const atHardFloor = settle(38_500_000, NET, cfg);
    assert.equal(atHardFloor.belowTeamFloor, true);
    assert.equal(atHardFloor.belowHardFloor, false);
    const justBelow = settle(38_499_999, NET, cfg);
    assert.equal(justBelow.belowHardFloor, true);
  });

  it("flags a negative margin instead of hiding it", () => {
    const s = settle(35_500_000, NET, cfg, {
      buyerReferred: true,
      sellerReferred: true,
    });
    assert.equal(s.grossMargin, 500_000);
    assert.equal(s.notaryFee + s.buyerReferralFee + s.sellerReferralFee, 1_775_000);
    assert.equal(s.roogoMargin, -1_275_000);
    assert.equal(s.negativeMargin, true);
    assert.equal(s.belowHardFloor, true);
  });

  it("rejects invalid amounts", () => {
    assert.throws(() => settle(0, NET, cfg));
    assert.throws(() => settle(40_000_000, 0, cfg));
  });
});

describe("bypassFee", () => {
  it("is 10% of the sale price", () => {
    assert.equal(bypassFee(42_000_000, cfg), 4_200_000);
    assert.equal(bypassFee(38_000_000, cfg), 3_800_000);
  });
});

describe("validateSaleEconomics", () => {
  it("accepts the approved defaults", () => {
    assert.deepEqual(validateSaleEconomics(cfg), []);
  });

  it("rejects out-of-order markups and fees above the hard-floor margin", () => {
    assert.ok(
      validateSaleEconomics({ ...cfg, hardFloorMarkupPct: 0.2 }).length > 0,
    );
    assert.ok(validateSaleEconomics({ ...cfg, notaryFeePct: 0.08 }).length > 0);
    assert.ok(validateSaleEconomics({ ...cfg, bypassMonths: 0 }).length > 0);
    assert.ok(validateSaleEconomics({ ...cfg, bypassFeePct: 1.5 }).length > 0);
  });
});
