import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acknowledgedCoversServerPrice,
  canSpend,
  estimateVoiceoverCostUsd,
  startOfMonthIso,
} from "./budget.ts";

describe("estimateVoiceoverCostUsd", () => {
  it("is zero for empty text and grows with length", () => {
    assert.equal(estimateVoiceoverCostUsd(0), 0);
    assert.ok(estimateVoiceoverCostUsd(1) > 0);
    assert.ok(estimateVoiceoverCostUsd(1200) >= estimateVoiceoverCostUsd(600));
  });
});

describe("canSpend", () => {
  it("allows spending up to the cap and refuses beyond it", () => {
    assert.deepEqual(canSpend(9, 1, 10), { ok: true, remainingAfterUsd: 0 });
    assert.deepEqual(canSpend(9.5, 1, 10), { ok: false, remainingUsd: 0.5 });
  });

  it("never reports a negative remaining budget", () => {
    assert.deepEqual(canSpend(12, 0.1, 10), { ok: false, remainingUsd: 0 });
  });
});

describe("acknowledgedCoversServerPrice", () => {
  it("accepts an equal or higher acknowledged price only", () => {
    assert.equal(acknowledgedCoversServerPrice(0.03, 0.03), true);
    assert.equal(acknowledgedCoversServerPrice(0.04, 0.03), true);
    assert.equal(acknowledgedCoversServerPrice(0.02, 0.03), false);
  });
});

describe("startOfMonthIso", () => {
  it("returns the first instant of the UTC month", () => {
    assert.equal(
      startOfMonthIso(new Date("2026-10-17T12:00:00Z")),
      "2026-10-01T00:00:00.000Z",
    );
  });
});
