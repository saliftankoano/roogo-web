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

const run = (newPrice, staffLevel, confirmations) =>
  evaluateSalePriceChange({ ...base, newPrice, staffLevel, confirmations });
const both = { discussed_with_salif: true, owner_agreed: true };

describe("evaluateSalePriceChange (owner price 30M, rule of 2026-10-17)", () => {
  it("lets any staff level decide from +10% (inclusive) to +30%", () => {
    for (const level of ["advisor", "assistant", "intern", "legacy", "director", "founder"]) {
      for (const newPrice of [39 * M, 36 * M, 34.5 * M, 34 * M, 33.05 * M, 33 * M]) {
        assert.deepEqual(run(newPrice, level), { ok: true });
      }
    }
  });

  it("refuses other staff below +10%, even with every box ticked", () => {
    for (const level of ["advisor", "assistant", "intern", "legacy", null]) {
      for (const newPrice of [32_999_999, 32 * M, 29 * M]) {
        const d = run(newPrice, level, both);
        assert.equal(d.ok, false);
        assert.equal(d.status, 403);
        assert.match(d.error, /accord de Salif/);
      }
    }
  });

  it("asks the Directeur to confirm he discussed it with Salif", () => {
    const d = run(32 * M, "director");
    assert.equal(d.ok, false);
    assert.equal(d.status, 422);
    assert.equal(d.code, "sale_price_confirmation_required");
    assert.deepEqual(d.required, ["discussed_with_salif"]);
    assert.match(d.error, /J'en ai discuté avec Salif/);
    const ok = run(32 * M, "director", { discussed_with_salif: true });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.approval, {
      approverLevel: "director",
      markupPct: 0.0667,
      belowOwnerPrice: false,
      discussedWithSalif: true,
      ownerAgreed: false,
    });
  });

  it("lets the founder go below +10% without the Salif confirmation", () => {
    const d = run(32 * M, "founder");
    assert.equal(d.ok, true);
    assert.equal(d.approval.approverLevel, "founder");
    assert.equal(d.approval.discussedWithSalif, false);
  });

  it("needs the owner's verbal agreement below the owner's price", () => {
    const founder = run(29 * M, "founder");
    assert.equal(founder.ok, false);
    assert.deepEqual(founder.required, ["owner_agreed"]);
    assert.match(founder.error, /accord verbal/);
    const director = run(29 * M, "director");
    assert.deepEqual(director.required, ["discussed_with_salif", "owner_agreed"]);
    assert.equal(run(29 * M, "director", { discussed_with_salif: true }).ok, false);
    const ok = run(29 * M, "director", both);
    assert.equal(ok.ok, true);
    assert.equal(ok.approval.belowOwnerPrice, true);
    assert.equal(ok.approval.ownerAgreed, true);
    assert.equal(ok.approval.markupPct, -0.0333);
    // Exactly the owner's price is not below it.
    assert.deepEqual(run(30 * M, "founder").approval.belowOwnerPrice, false);
  });

  it("rejects invalid prices", () => {
    assert.equal(run(0, "founder", both).ok, false);
    assert.equal(run(Number.NaN, "founder", both).ok, false);
  });
});
