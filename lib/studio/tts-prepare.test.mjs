import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  numberToFrench,
  phoneToSpokenPairs,
  prepareForSpeech,
} from "./tts-prepare.ts";

describe("numberToFrench", () => {
  it("spells years in full words", () => {
    assert.equal(numberToFrench(1985), "mille neuf cent quatre-vingt-cinq");
    assert.equal(numberToFrench(2026), "deux mille vingt-six");
    assert.equal(numberToFrench(1980), "mille neuf cent quatre-vingts");
  });

  it("handles 70s, 80s and 90s", () => {
    assert.equal(numberToFrench(71), "soixante et onze");
    assert.equal(numberToFrench(77), "soixante-dix-sept");
    assert.equal(numberToFrench(91), "quatre-vingt-onze");
    assert.equal(numberToFrench(21), "vingt et un");
  });

  it("pluralizes cents only when alone", () => {
    assert.equal(numberToFrench(200), "deux cents");
    assert.equal(numberToFrench(250), "deux cent cinquante");
  });

  it("rejects out of range input", () => {
    assert.throws(() => numberToFrench(10000), RangeError);
    assert.throws(() => numberToFrench(-1), RangeError);
  });
});

describe("phone numbers", () => {
  it("reads the WhatsApp number in French pairs", () => {
    assert.equal(
      phoneToSpokenPairs("67006116"),
      "soixante-sept, zéro zéro, soixante et un, seize",
    );
  });

  it("reads the example number from the pronunciation note", () => {
    assert.equal(
      phoneToSpokenPairs("53111119"),
      "cinquante-trois, onze, onze, dix-neuf",
    );
  });
});

describe("prepareForSpeech", () => {
  it("respells the brand and place names", () => {
    assert.equal(
      prepareForSpeech("Roogo à Ouaga, au Burkina Faso."),
      "Rohgo à Waga, au Bourkina Faso.",
    );
    assert.equal(prepareForSpeech("Ouagadougou"), "Waga");
    assert.equal(prepareForSpeech("Nagrin"), "Nagrain");
  });

  it("hyphenates parcelle", () => {
    assert.equal(
      prepareForSpeech("Une parcelle de 300 mètres"),
      "Une par-celle de 300 mètres",
    );
    assert.equal(prepareForSpeech("Deux parcelles"), "Deux par-celles");
  });

  it("speaks local and international phone numbers", () => {
    assert.equal(
      prepareForSpeech("Appelez le 67 00 61 16."),
      "Appelez le soixante-sept, zéro zéro, soixante et un, seize.",
    );
    assert.equal(
      prepareForSpeech("+226 67 00 61 16"),
      "deux cent vingt-six, soixante-sept, zéro zéro, soixante et un, seize",
    );
  });

  it("does not treat prices as phone numbers", () => {
    assert.equal(prepareForSpeech("35000000 FCFA"), "35000000 FCFA");
    assert.equal(prepareForSpeech("25 000 000 FCFA"), "25 000 000 FCFA");
  });

  it("spells standalone years but leaves other numbers", () => {
    assert.equal(
      prepareForSpeech("Construite en 1985."),
      "Construite en mille neuf cent quatre-vingt-cinq.",
    );
    assert.equal(prepareForSpeech("3 chambres"), "3 chambres");
  });
});
