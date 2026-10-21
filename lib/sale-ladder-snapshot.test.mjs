import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { readPct, mandateLadderFromRow, mandateCommissionFromRow } = await import(
  "./sale-ladder-snapshot.ts"
);

describe("readPct", () => {
  it("treats NULL, undefined and blank as missing, not as 0", () => {
    assert.ok(Number.isNaN(readPct(null)));
    assert.ok(Number.isNaN(readPct(undefined)));
    assert.ok(Number.isNaN(readPct("")));
    assert.ok(Number.isNaN(readPct("abc")));
  });
  it("reads numbers and numeric strings (Postgres NUMERIC)", () => {
    assert.equal(readPct(0.3), 0.3);
    assert.equal(readPct("0.10"), 0.1);
    assert.equal(readPct(0), 0);
  });
});

describe("mandateLadderFromRow", () => {
  it("returns null for a mandate sent before the ladder (NULL columns)", () => {
    assert.equal(
      mandateLadderFromRow({
        listing_markup_pct: null,
        target_markup_pct: null,
        team_floor_markup_pct: null,
        hard_floor_markup_pct: null,
      }),
      null,
    );
  });
  it("returns null for an all-zero snapshot instead of a +0 % ladder", () => {
    assert.equal(
      mandateLadderFromRow({
        listing_markup_pct: 0,
        target_markup_pct: 0,
        team_floor_markup_pct: 0,
        hard_floor_markup_pct: 0,
      }),
      null,
    );
  });
  it("maps a real snapshot with the 075 column names", () => {
    assert.deepEqual(
      mandateLadderFromRow({
        listing_markup_pct: "0.30",
        target_markup_pct: "0.20",
        team_floor_markup_pct: "0.15",
        hard_floor_markup_pct: "0.10",
      }),
      {
        listingMarkupPct: 0.3,
        targetMarkupPct: 0.2,
        referenceMarkupPct: 0.15,
        teamFloorMarkupPct: 0.1,
      },
    );
  });
});

describe("mandateCommissionFromRow", () => {
  it("returns null when the commission snapshot is missing", () => {
    assert.equal(mandateCommissionFromRow(null), null);
    assert.equal(
      mandateCommissionFromRow({ base_commission_pct: null, surplus_split_pct: null }),
      null,
    );
  });
  it("reads a stored snapshot", () => {
    assert.deepEqual(
      mandateCommissionFromRow({ base_commission_pct: "0.10", surplus_split_pct: 0.5 }),
      { baseCommissionPct: 0.1, surplusSplitPct: 0.5 },
    );
  });
});
