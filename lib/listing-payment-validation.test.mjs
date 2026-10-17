import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listingPaymentAddOns,
  listingPaymentMatches,
} from "./listing-payment-validation.ts";

const expected = {
  tierId: "premium",
  addOns: ["boost", "video"],
  frequency: "mensuel",
  monthlyRent: 150000,
};

describe("listing payment validation", () => {
  it("matches server-owned listing fields regardless of add-on order", () => {
    assert.equal(
      listingPaymentMatches(
        {
          tier_id: "premium",
          add_ons: ["video", "boost"],
          frequence: "mensuel",
          monthlyRent: 150000,
        },
        expected,
      ),
      true,
    );
  });

  it("supports legacy metadata whose add_ons contained detail objects", () => {
    const metadata = {
      tier_id: "premium",
      add_ons: [{ id: "boost", price: 5000 }],
      addOns: ["boost", "video"],
      frequence: "mensuel",
      monthlyRent: 150000,
    };
    assert.deepEqual(listingPaymentAddOns(metadata), ["boost", "video"]);
    assert.equal(
      listingPaymentMatches(metadata, expected),
      true,
    );
  });

  it("rejects replay against a materially different listing", () => {
    const candidates = [
      {
        tier_id: "standard",
        add_ons: expected.addOns,
        frequence: expected.frequency,
        monthlyRent: expected.monthlyRent,
      },
      {
        tier_id: expected.tierId,
        add_ons: ["video"],
        frequence: expected.frequency,
        monthlyRent: expected.monthlyRent,
      },
      {
        tier_id: expected.tierId,
        add_ons: expected.addOns,
        frequence: "journalier",
        monthlyRent: expected.monthlyRent,
      },
      {
        tier_id: expected.tierId,
        add_ons: expected.addOns,
        frequence: expected.frequency,
        monthlyRent: 100000,
      },
    ];
    for (const metadata of candidates) {
      assert.equal(listingPaymentMatches(metadata, expected), false);
    }
  });

  it("rejects incomplete or malformed metadata", () => {
    assert.equal(listingPaymentMatches({}, expected), false);
    assert.equal(
      listingPaymentMatches(
        {
          tier_id: expected.tierId,
          add_ons: expected.addOns,
          frequence: expected.frequency,
          monthlyRent: "not-a-number",
        },
        expected,
      ),
      false,
    );
  });
});
