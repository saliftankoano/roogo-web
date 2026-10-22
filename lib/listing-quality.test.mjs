import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LISTING_QUALITY_MIN,
  checkListingQuality,
  countWords,
  listingQualityError,
} from "./listing-quality.ts";

const words = (n) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ");

describe("countWords", () => {
  it("counts words and ignores punctuation-only tokens", () => {
    assert.equal(countWords("Très belle opportunité de ça immobilier"), 6);
    assert.equal(countWords("Villa - 3 ch. , jardin"), 4);
    assert.equal(countWords("  "), 0);
    assert.equal(countWords(null), 0);
  });
});

describe("checkListingQuality", () => {
  it("passes at exactly the minimum", () => {
    const checks = checkListingQuality({
      description: words(LISTING_QUALITY_MIN.descriptionWords),
      photoCount: LISTING_QUALITY_MIN.photos,
    });
    assert.ok(checks.every((c) => c.ok));
    assert.equal(listingQualityError(checks), null);
  });

  it("names every gap in French", () => {
    const checks = checkListingQuality({
      description: "Très belle opportunité de ça immobilier",
      photoCount: 3,
    });
    assert.deepEqual(
      checks.map((c) => [c.id, c.ok, c.current]),
      [
        ["description", false, 6],
        ["photos", false, 3],
      ],
    );
    assert.equal(
      listingQualityError(checks),
      "Annonce trop incomplète pour la mise en ligne : la description fait 6 mots sur 60 minimum, 3 photos sur 5 minimum.",
    );
  });

  it("singular photo wording", () => {
    const error = listingQualityError(
      checkListingQuality({ description: words(80), photoCount: 1 }),
    );
    assert.match(error, /1 photo sur 5 minimum/);
  });
});
