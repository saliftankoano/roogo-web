import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findCandidateWords } from "./candidate-words.ts";

describe("findCandidateWords", () => {
  it("flags place names that are not at the start of a sentence", () => {
    assert.deepEqual(
      findCandidateWords("Belle villa à louer à Tanghin près de Karpala.", []),
      ["Tanghin", "Karpala"],
    );
  });

  it("ignores the capitalized first word of each sentence", () => {
    assert.deepEqual(
      findCandidateWords("Bienvenue chez nous. Visitez demain. Appelez vite.", []),
      [],
    );
  });

  it("flags acronyms but not short or common words", () => {
    assert.deepEqual(
      findCandidateWords("Titre foncier de type PUH, appelez sur WhatsApp.", []),
      ["PUH"],
    );
  });

  it("skips words already in the glossary, ignoring case and accents", () => {
    assert.deepEqual(
      findCandidateWords("Une maison à Tanghin et à Gounghin.", ["tanghin"]),
      ["Gounghin"],
    );
    assert.deepEqual(
      findCandidateWords("Une maison à Ouagadougou.", ["Ouagadougou"]),
      [],
    );
  });

  it("returns each word once and respects the limit", () => {
    assert.deepEqual(
      findCandidateWords("Aller à Tanghin puis Tanghin encore.", []),
      ["Tanghin"],
    );
    const many = Array.from({ length: 12 }, (_, i) => `Lieu${String.fromCharCode(65 + i)}x`).join(" et ");
    assert.equal(findCandidateWords(`Vers ${many}.`, [], 5).length, 5);
  });
});
