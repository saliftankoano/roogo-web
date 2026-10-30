import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestBrief, requestProjectTitle } from "./request-brief.ts";

const request = {
  title: "Villa à Ouaga 2000",
  description: "Une villa avec cour, proche d'une école.",
  listing_type: "vendre",
  property_type: "Villa",
  city: "Ouagadougou",
  neighborhood: "Ouaga 2000",
  budget_min: null,
  budget_max: 60000000,
  min_area: 300,
  min_bedrooms: 4,
  customer_name: "Client Secret",
  customer_contact: "+226 70 00 00 00",
  internal_notes: "Note interne",
};

describe("request brief", () => {
  it("describes the request from its public fields", () => {
    const brief = requestBrief(request);
    assert.match(brief, /appel à propriétaires/);
    assert.match(brief, /Villa à acheter, à Ouaga 2000, Ouagadougou/);
    assert.match(brief, /jusqu'à 60 000 000 FCFA/);
    assert.match(brief, /au moins 4 chambres et au moins 300 m²/);
  });

  it("never carries the client's name, contact or internal notes", () => {
    const brief = requestBrief(request);
    assert.doesNotMatch(brief, /Client Secret|70 00 00 00|Note interne/);
  });

  it("shows a budget range and skips missing needs", () => {
    const brief = requestBrief({
      ...request,
      listing_type: "louer",
      neighborhood: "",
      budget_min: 100000,
      budget_max: 150000,
      min_area: null,
      min_bedrooms: null,
    });
    assert.match(brief, /Villa à louer, à Ouagadougou\./);
    assert.match(brief, /entre 100 000 FCFA et 150 000 FCFA/);
    assert.doesNotMatch(brief, /Il lui faut/);
    assert.doesNotMatch(brief, /—/);
  });

  it("titles the project after the request", () => {
    assert.equal(requestProjectTitle(request), "Demande : Villa à Ouaga 2000");
  });

  it("stays under the chat's 2000-character limit with the longest description", () => {
    const brief = requestBrief({
      ...request,
      title: "x".repeat(160),
      neighborhood: "y".repeat(160),
      city: "z".repeat(100),
      description: "d".repeat(4000),
    });
    assert.ok(brief.length <= 2000, `brief is ${brief.length} characters`);
    assert.match(brief, /d\.\.\.\n/);
  });

  it("normalises the title like every Studio title", () => {
    const long = requestProjectTitle({ title: `Villa ${"x".repeat(200)} \u2014 urgent` });
    assert.equal(long.length, 80);
    assert.equal(requestProjectTitle({ title: "Villa \u2014 Ouaga 2000" }), "Demande : Villa , Ouaga 2000");
  });
});
