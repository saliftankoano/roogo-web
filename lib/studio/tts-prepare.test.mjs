import assert from "node:assert/strict";
import test, { describe, it } from "node:test";
import {
  numberToFrench,
  phoneToSpokenPairs,
  prepareForSpeech,
  prepareForSpeechDetailed,
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

  it("reads FCFA as francs CFA and R+1 as R plus un", () => {
    assert.equal(
      prepareForSpeech("Loyer 500 000 FCFA par mois."),
      "Loyer cinq cent mille francs CFA par mois.",
    );
    assert.equal(prepareForSpeech("Un R+1 et un R+2."), "Un R plus un et un R plus deux.");
    assert.equal(prepareForSpeech("F CFA"), "francs CFA");
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

  it("does not treat prices as phone numbers (they are spoken in words)", () => {
    assert.equal(prepareForSpeech("35000000 FCFA"), "trente-cinq millions de francs CFA");
    assert.equal(prepareForSpeech("25 000 000 FCFA"), "vingt-cinq millions de francs CFA");
  });

  it("spells standalone years but leaves other numbers", () => {
    assert.equal(
      prepareForSpeech("Construite en 1985."),
      "Construite en mille neuf cent quatre-vingt-cinq.",
    );
    assert.equal(prepareForSpeech("3 chambres"), "3 chambres");
  });
});

describe("prepareForSpeechDetailed", () => {
  it("lists every rule that fired, team entries first", () => {
    const result = prepareForSpeechDetailed(
      "Roogo loue une boutique à Ouagadougou. Roogo vous accompagne. Zongo répond.",
      [{ term: "Zongo", spoken: "Zon-go" }],
    );
    assert.equal(
      result.spoken,
      "Rohgo loue une boutique à Waga. Rohgo vous accompagne. Zon-go répond.",
    );
    assert.deepEqual(result.replacements, [
      { term: "Zongo", spoken: "Zon-go", count: 1 },
      { term: "Ouagadougou", spoken: "Waga", count: 1 },
      { term: "Roogo", spoken: "Rohgo", count: 2 },
    ]);
  });

  it("reports nothing when no rule applies", () => {
    const result = prepareForSpeechDetailed("Une belle villa avec jardin.");
    assert.equal(result.spoken, "Une belle villa avec jardin.");
    assert.deepEqual(result.replacements, []);
  });
});

test("team glossary words match whatever case, accents, hyphens and plurals the script uses", async () => {
  const { prepareForSpeech } = await import("./tts-prepare.ts");
  const glossary = [{ term: "Tanghin", spoken: "Than-gain" }, { term: "Bobo-Dioulasso", spoken: "Bobo Diou-lasso" }];
  assert.equal(prepareForSpeech("TANGHIN et Tanghîn", glossary), "Than-gain et Than-gain");
  assert.equal(prepareForSpeech("à Bobo Dioulasso", glossary), "à Bobo Diou-lasso");
  assert.equal(prepareForSpeech("Tanghinkouli", glossary), "Tanghinkouli", "a longer word is left alone");
});

test("prices are spoken in words, with 'de' after millions", async () => {
  const { prepareForSpeech, amountToFrench } = await import("./tts-prepare.ts");
  assert.equal(prepareForSpeech("Prix : 50 000 000 FCFA."), "Prix : cinquante millions de francs CFA.");
  assert.equal(prepareForSpeech("Loyer 250 000 F CFA par mois"), "Loyer deux cent cinquante mille francs CFA par mois");
  assert.equal(amountToFrench(1_500_000), "un million cinq cent mille");
  assert.equal(amountToFrench(80_000), "quatre-vingt mille");
  assert.equal(amountToFrench(200), "deux cents");
  assert.equal(prepareForSpeech("Appelez le +226 67 00 61 16"), "Appelez le deux cent vingt-six, soixante-sept, zéro zéro, soixante et un, seize");
});

test("the website is said as a word, not spelled out", async () => {
  const { prepareForSpeech } = await import("./tts-prepare.ts");
  assert.equal(prepareForSpeech("Toutes les infos sur roogobf.com."), "Toutes les infos sur Rohgo bé èf point com.");
  assert.equal(prepareForSpeech("Voir www.roogobf.com et Roogo"), "Voir Rohgo bé èf point com et Rohgo");
});
