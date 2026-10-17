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

describe("evaluateSalePriceChange (owner price 30M, rule of 2026-10-17)", () => {
  it("lets the team decide anywhere from +10% (inclusive) to +30%", () => {
    for (const newPrice of [39 * M, 36 * M, 34.5 * M, 34 * M, 33.05 * M, 33 * M]) {
      assert.deepEqual(
        evaluateSalePriceChange({ ...base, newPrice, isFounder: false }),
        { ok: true },
      );
    }
  });

  it("does not flag a founder approval at or above +10%", () => {
    assert.deepEqual(
      evaluateSalePriceChange({ ...base, newPrice: 33 * M, isFounder: true }),
      { ok: true },
    );
  });

  it("refuses staff below +10% and asks for Salif's approval", () => {
    for (const newPrice of [32_999_999, 32 * M, 30 * M]) {
      const staff = evaluateSalePriceChange({ ...base, newPrice, isFounder: false });
      assert.equal(staff.ok, false);
      assert.equal(staff.status, 403);
      assert.match(staff.error, /accord de Salif/);
      assert.match(staff.error, /33/);
    }
  });

  it("allows the founder below +10% and marks the change as his approval", () => {
    for (const newPrice of [32.9 * M, 30 * M, 28 * M]) {
      assert.deepEqual(
        evaluateSalePriceChange({ ...base, newPrice, isFounder: true }),
        { ok: true, founderApproved: true },
      );
    }
  });

  it("rejects invalid prices", () => {
    assert.equal(evaluateSalePriceChange({ ...base, newPrice: 0, isFounder: true }).ok, false);
    assert.equal(
      evaluateSalePriceChange({ ...base, newPrice: Number.NaN, isFounder: true }).ok,
      false,
    );
  });
});
