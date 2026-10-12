import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

// lib/sale-price-guard.ts imports the calculation through the "@/lib" alias.
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

const { DEFAULT_SALE_ECONOMICS } = await import("./sale-economics.ts");
const { evaluateSalePriceChange } = await import("./sale-price-guard.ts");

const M = 1_000_000;
const base = { ownerPrice: 30 * M, pcts: DEFAULT_SALE_ECONOMICS };

describe("evaluateSalePriceChange (owner price 30M)", () => {
  it("lets staff price anywhere above the +10% floor", () => {
    for (const newPrice of [39 * M, 36 * M, 34.5 * M, 34 * M, 33.05 * M]) {
      assert.deepEqual(
        evaluateSalePriceChange({ ...base, newPrice, isFounder: false }),
        { ok: true },
      );
    }
  });

  it("needs the founder only at the +10% floor", () => {
    const staff = evaluateSalePriceChange({ ...base, newPrice: 33 * M, isFounder: false });
    assert.equal(staff.ok, false);
    assert.equal(staff.status, 403);
    assert.deepEqual(
      evaluateSalePriceChange({ ...base, newPrice: 33 * M, isFounder: true }),
      { ok: true },
    );
  });

  it("refuses everyone below the +10% hard stop", () => {
    const founder = evaluateSalePriceChange({ ...base, newPrice: 32.9 * M, isFounder: true });
    assert.equal(founder.ok, false);
    assert.equal(founder.status, 422);
    assert.match(founder.error, /33/);
    // The owner's own price is never a valid public price.
    assert.equal(
      evaluateSalePriceChange({ ...base, newPrice: 30 * M, isFounder: true }).ok,
      false,
    );
  });

  it("rejects invalid prices", () => {
    assert.equal(evaluateSalePriceChange({ ...base, newPrice: 0, isFounder: true }).ok, false);
    assert.equal(
      evaluateSalePriceChange({ ...base, newPrice: Number.NaN, isFounder: true }).ok,
      false,
    );
  });
});
