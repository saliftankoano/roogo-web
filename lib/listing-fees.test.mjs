import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateFirstRentSuccessFeeAmounts,
  calculateMonthlyFreeSuccessFee,
  calculateOwnerRentAmounts,
} from "./listing-fees.ts";

describe("monthly free-listing fees", () => {
  it("snapshots a one-time fee equal to 50% of the advertised monthly rent", () => {
    assert.equal(calculateMonthlyFreeSuccessFee(75_000), 37_500);
  });

  it("deducts the deferred fee from the first collected rent", () => {
    assert.deepEqual(calculateFirstRentSuccessFeeAmounts(75_000, 37_500), {
      grossRentAmount: 75_000,
      feeRateBps: 5000,
      feeAmount: 37_500,
      netAmount: 37_500,
    });
  });

  it("honors a referral-adjusted deferred amount", () => {
    assert.equal(
      calculateFirstRentSuccessFeeAmounts(75_000, 35_625).feeAmount,
      35_625,
    );
  });

  it("never deducts more than the rent schedule being credited", () => {
    assert.deepEqual(calculateFirstRentSuccessFeeAmounts(20_000, 37_500), {
      grossRentAmount: 20_000,
      feeRateBps: 5000,
      feeAmount: 20_000,
      netAmount: 0,
    });
  });

  it("calculates the separate 7% fee when later rent collection is used", () => {
    assert.deepEqual(calculateOwnerRentAmounts(75_000), {
      grossRentAmount: 75_000,
      feeRateBps: 700,
      feeAmount: 5_250,
      netAmount: 69_750,
    });
  });
});
