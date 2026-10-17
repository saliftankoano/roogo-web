import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SALE_ECONOMICS,
  bypassFee,
  ceilToStep,
  commissionAt,
  formatSalePct,
  payoutTable,
  priceLadder,
  publicPriceForNewListing,
  publishedListingPrice,
  saleLadderApplies,
  roogoNetAfterFees,
  salePriceApproval,
  roundToStep,
  validateSaleEconomics,
} from "./sale-economics.ts";

const cfg = DEFAULT_SALE_ECONOMICS;
const M = 1_000_000;

// Payout table approved by the founder on 2026-10-11 for an owner price of 30M
// (vault: "Roogo Sell commission with listing ladder"), amounts in millions.
const TABLE_30M = [
  { level: "listing", price: 39, owner: 31.5, roogo: 7.5, notary: 6.72, buyer: 5.94, both: 5.55 },
  { level: "target", price: 36, owner: 30, roogo: 6, notary: 5.28, buyer: 4.56, both: 4.2 },
  { level: "reference", price: 34.5, owner: 29.25, roogo: 5.25, notary: 4.56, buyer: 3.87, both: 3.525 },
  { level: "teamFloor", price: 33, owner: 28.5, roogo: 4.5, notary: 3.84, buyer: 3.18, both: 2.85 },
];

describe("priceLadder", () => {
  it("lists an owner price of 30M at 39M with target 36M, reference 34.5M and team floor 33M", () => {
    const { exact, display } = priceLadder(30 * M, cfg);
    assert.deepEqual(exact, {
      listing: 39 * M,
      target: 36 * M,
      reference: 34.5 * M,
      teamFloor: 33 * M,
    });
    assert.deepEqual(display, exact);
  });

  it("rounds display prices to 50,000 and the team floor upward", () => {
    const { exact, display } = priceLadder(12_345_678, cfg);
    assert.equal(display.listing, roundToStep(exact.listing));
    assert.equal(display.reference, roundToStep(exact.reference));
    assert.equal(display.teamFloor, ceilToStep(exact.teamFloor));
    assert.ok(display.teamFloor >= exact.teamFloor);
    assert.equal(display.listing % 50_000, 0);
  });

  it("rejects a missing or zero owner price", () => {
    assert.throws(() => priceLadder(0, cfg));
    assert.throws(() => priceLadder(Number.NaN, cfg));
  });
});

describe("salePriceApproval (Founder, 2026-10-17)", () => {
  it("lets the team decide from +10% (inclusive) up to +30%", () => {
    for (const price of [39 * M, 36 * M, 34.5 * M, 34 * M, 33 * M]) {
      assert.equal(salePriceApproval(price, 30 * M, cfg), "team");
    }
  });
  it("needs the founder below +10%, down to and below the owner's price", () => {
    for (const price of [32_999_999, 32 * M, 30 * M, 28 * M]) {
      assert.equal(salePriceApproval(price, 30 * M, cfg), "founder");
    }
  });
  it("uses the exact +10%, so a float product never shifts the boundary", () => {
    // 35M x 1.1 = 38,500,000.000000007 in floating point.
    assert.equal(salePriceApproval(38_500_000, 35 * M, cfg), "team");
    assert.equal(salePriceApproval(38_499_999, 35 * M, cfg), "founder");
  });
  it("rejects an invalid price", () => {
    assert.throws(() => salePriceApproval(0, 30 * M, cfg));
  });
});

describe("rentals are untouched (Salif, 2026-10-17)", () => {
  it("applies the ladder only to sales", () => {
    assert.equal(saleLadderApplies("vendre"), true);
    for (const t of ["louer", "louer_jour", "louer_mois", "", null, undefined]) {
      assert.equal(saleLadderApplies(t), false);
    }
  });
  it("publishes a sale at +30% and keeps a rental price exactly as set", () => {
    assert.equal(publicPriceForNewListing("vendre", 30 * M, cfg), 39 * M);
    assert.equal(publicPriceForNewListing("louer", 150_000, cfg), 150_000);
    assert.equal(publicPriceForNewListing("louer", 12_345, cfg), 12_345);
  });
});

describe("publishedListingPrice", () => {
  it("never publishes the owner's own number", () => {
    assert.equal(publishedListingPrice(30 * M, cfg), 39 * M);
    assert.equal(publishedListingPrice(35 * M, cfg), 45.5 * M);
  });
});

describe("commissionAt", () => {
  it("is 10% of the owner's price plus half the surplus", () => {
    const c = commissionAt(33 * M, 30 * M, cfg);
    assert.equal(c.surplus, 3 * M);
    assert.equal(c.roogoCommission, 4.5 * M);
    assert.equal(c.ownerReceives, 28.5 * M);
  });

  it("matches the July 2026 source example (D 3M, P 10M)", () => {
    const c = commissionAt(10 * M, 3 * M, cfg);
    assert.equal(c.roogoCommission, 3.8 * M);
    assert.equal(c.ownerReceives, 6.2 * M);
  });

  it("has no surplus at or below the owner's price", () => {
    assert.equal(commissionAt(30 * M, 30 * M, cfg).roogoCommission, 3 * M);
    assert.equal(commissionAt(29 * M, 30 * M, cfg).surplus, 0);
  });
});

describe("payoutTable and fees from Roogo's share", () => {
  it("reproduces the approved 30M table", () => {
    const rows = payoutTable(30 * M, cfg);
    assert.equal(rows.length, 4);
    rows.forEach((row, i) => {
      const t = TABLE_30M[i];
      assert.equal(row.level, t.level);
      assert.equal(row.price, t.price * M);
      assert.equal(row.ownerReceives, t.owner * M);
      assert.equal(row.roogoCommission, t.roogo * M);

      const c = commissionAt(row.price, 30 * M, cfg);
      assert.equal(roogoNetAfterFees(c, cfg).roogoNet, t.notary * M);
      assert.equal(
        roogoNetAfterFees(c, cfg, { buyerReferred: true, sellerReferred: false }).roogoNet,
        t.buyer * M,
      );
      assert.equal(
        roogoNetAfterFees(c, cfg, { buyerReferred: true, sellerReferred: true }).roogoNet,
        t.both * M,
      );
    });
  });

  it("gives the owner exactly his price at the +20% target", () => {
    const target = payoutTable(30 * M, cfg).find((r) => r.level === "target");
    assert.equal(target.ownerReceives, 30 * M);
  });
});

describe("bypassFee and formatting", () => {
  it("is 10% of the sale price", () => {
    assert.equal(bypassFee(40 * M, cfg), 4 * M);
  });
  it("formats percentages", () => {
    assert.equal(formatSalePct(0.3), "30 %");
    assert.equal(formatSalePct(0.125), "12.5 %");
  });
});

describe("validateSaleEconomics", () => {
  it("accepts the defaults", () => {
    assert.deepEqual(validateSaleEconomics(cfg), []);
  });
  it("rejects an out-of-order ladder", () => {
    assert.ok(validateSaleEconomics({ ...cfg, teamFloorMarkupPct: 0.25 }).length > 0);
    assert.ok(validateSaleEconomics({ ...cfg, referenceMarkupPct: 0.05 }).length > 0);
  });
  it("rejects fees that would exceed the commission at the owner's price", () => {
    assert.ok(validateSaleEconomics({ ...cfg, baseCommissionPct: 0.04 }).length > 0);
  });
  it("rejects fees that would eat the whole commission at the team floor", () => {
    assert.ok(
      validateSaleEconomics({ ...cfg, baseCommissionPct: 0, surplusSplitPct: 0.2 })
        .length > 0,
    );
  });
});
