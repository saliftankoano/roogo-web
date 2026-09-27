import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

// lib/sale-closing.ts imports the calculation through the "@/lib" alias.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/sale-economics") {
      return {
        url: new URL("./sale-economics.ts", import.meta.url).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

const { addMonths, buildClosingRow, bypassWindowEnd, closingTransition } =
  await import("./sale-closing.ts");
const { DEFAULT_SALE_ECONOMICS } = await import("./sale-economics.ts");

const mandate = {
  id: "mandate-1",
  propertyId: "property-1",
  sellerNetPrice: 35_000_000,
  signedAt: new Date("2026-10-01T10:00:00Z"),
  snapshot: DEFAULT_SALE_ECONOMICS,
};

const input = (overrides = {}) => ({
  finalPrice: 42_000_000,
  buyerUserId: "buyer-1",
  buyerName: null,
  buyerPhone: null,
  buyerReferred: false,
  sellerReferred: false,
  buyerReferrerLabel: null,
  sellerReferrerLabel: null,
  isBypass: false,
  soldAt: new Date("2026-12-01T10:00:00Z"),
  notes: null,
  ...overrides,
});

describe("buildClosingRow", () => {
  it("stores the computed split for a Roogo sale", () => {
    const result = buildClosingRow(
      input({ buyerReferred: true, buyerReferrerLabel: "Moussa" }),
      mandate,
      { buyerIntroduced: true },
    );
    assert.equal(result.ok, true);
    assert.equal(result.row.notary_fee, 840_000);
    assert.equal(result.row.buyer_referral_fee, 840_000);
    assert.equal(result.row.seller_referral_fee, 0);
    assert.equal(result.row.roogo_margin, 5_320_000);
    assert.equal(result.row.below_team_floor, false);
    assert.equal(result.row.bypass_fee, null);
    assert.equal(result.row.buyer_referrer_label, "Moussa");
    assert.equal(result.row.status, "draft");
  });

  it("drafts a sale between the floors and refuses one below +10%", () => {
    const between = buildClosingRow(input({ finalPrice: 38_500_000 }), mandate, {
      buyerIntroduced: true,
    });
    assert.equal(between.ok, true);
    assert.equal(between.row.below_team_floor, true);
    const below = buildClosingRow(input({ finalPrice: 38_499_999 }), mandate, {
      buyerIntroduced: true,
    });
    assert.deepEqual(below, { ok: false, reason: "below_hard_floor" });
  });

  it("records a bypass sale at 10% without a floor", () => {
    const result = buildClosingRow(
      input({ finalPrice: 36_000_000, isBypass: true }),
      mandate,
      { buyerIntroduced: true },
    );
    assert.equal(result.ok, true);
    assert.equal(result.row.is_bypass, true);
    assert.equal(result.row.bypass_fee, 3_600_000);
    assert.equal(result.row.roogo_margin, 3_600_000);
    assert.equal(result.row.notary_fee, 0);
  });

  it("requires evidence and the 12-month window for a bypass", () => {
    assert.deepEqual(
      buildClosingRow(input({ isBypass: true, buyerUserId: null }), mandate, {
        buyerIntroduced: true,
      }),
      { ok: false, reason: "bypass_requires_buyer" },
    );
    assert.deepEqual(
      buildClosingRow(input({ isBypass: true }), mandate, {
        buyerIntroduced: false,
      }),
      { ok: false, reason: "buyer_not_introduced" },
    );
    const lastDay = buildClosingRow(
      input({ isBypass: true, soldAt: new Date("2027-10-01T10:00:00Z") }),
      mandate,
      { buyerIntroduced: true },
    );
    assert.equal(lastDay.ok, true);
    assert.deepEqual(
      buildClosingRow(
        input({ isBypass: true, soldAt: new Date("2027-10-01T10:00:01Z") }),
        mandate,
        { buyerIntroduced: true },
      ),
      { ok: false, reason: "bypass_window_expired" },
    );
  });
});

describe("bypass window", () => {
  it("counts calendar months and clamps to the month end", () => {
    assert.equal(
      bypassWindowEnd(new Date("2026-10-01T00:00:00Z"), 12).toISOString(),
      "2027-10-01T00:00:00.000Z",
    );
    assert.equal(
      addMonths(new Date("2027-01-31T00:00:00Z"), 1).toISOString(),
      "2027-02-28T00:00:00.000Z",
    );
  });
});

describe("closingTransition", () => {
  const now = new Date("2026-12-02T00:00:00Z");
  const staff = { userId: "staff-1", isFounder: false };
  const founder = { userId: "founder-1", isFounder: true };
  const draft = {
    status: "draft",
    below_team_floor: false,
    is_bypass: false,
    roogo_paid_at: null,
  };

  it("lets staff approve at or above the team floor", () => {
    const result = closingTransition(draft, "approve", staff, now);
    assert.equal(result.ok, true);
    assert.equal(result.patch.approved_by, "staff-1");
  });

  it("requires the founder between the hard and team floors", () => {
    const belowTeam = { ...draft, below_team_floor: true };
    assert.deepEqual(closingTransition(belowTeam, "approve", staff, now), {
      ok: false,
      reason: "founder_approval_required",
    });
    assert.equal(closingTransition(belowTeam, "approve", founder, now).ok, true);
  });

  it("walks approved -> notarized -> paid -> settled", () => {
    const approved = { ...draft, status: "approved" };
    assert.equal(closingTransition(approved, "notarize", staff, now).patch.status, "notarized");
    const notarized = { ...draft, status: "notarized" };
    assert.deepEqual(closingTransition(notarized, "settle", staff, now), {
      ok: false,
      reason: "not_paid",
    });
    assert.equal(
      closingTransition(notarized, "mark_paid", staff, now).patch.roogo_paid_at,
      now.toISOString(),
    );
    const paid = { ...notarized, roogo_paid_at: now.toISOString() };
    assert.equal(closingTransition(paid, "settle", staff, now).patch.status, "settled");
    assert.deepEqual(
      closingTransition({ ...paid, status: "settled" }, "cancel", staff, now),
      { ok: false, reason: "invalid_transition" },
    );
  });
});
