import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MANDATE_TERMS_VERSION,
  formatSalePct,
  mandateTermsV3,
} from "./sale.ts";

describe("v3 mandate terms", () => {
  it("uses the v3 terms version shared with roogo-web", () => {
    assert.equal(MANDATE_TERMS_VERSION, "2026-10-v3");
  });

  it("states the guaranteed net, exclusivity and bypass clause in plain French", () => {
    const terms = mandateTermsV3({
      netPrice: "35 000 000 FCFA",
      exclusivityDays: 90,
      bypassMonths: 12,
      bypassFeePct: formatSalePct(0.1),
    });
    const text = terms.join("\n");
    assert.match(text, /Vous recevez 35 000 000 FCFA net à la vente\. Ce montant est garanti\./);
    assert.match(text, /exclusivité pendant 90 jours/);
    assert.match(text, /dans les 12 mois .* des frais de 10 % du prix de vente sont dus à Roogo/);
    assert.match(text, /2026-10-v3/);
    // Copy rules: no em dash, no emoji.
    assert.equal(/—/.test(text), false);
    assert.equal(/\p{Extended_Pictographic}/u.test(text), false);
  });
});
