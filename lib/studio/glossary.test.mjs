import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDeleteGlossaryEntry,
  validateGlossaryEntry,
} from "./glossary.ts";
import { applyGlossary, prepareForSpeech } from "./tts-prepare.ts";
import { formatMoney, usdToFcfa } from "./currency.ts";

describe("validateGlossaryEntry", () => {
  it("trims and accepts a valid entry", () => {
    assert.deepEqual(
      validateGlossaryEntry({ term: "  Tanghin ", spoken: " Than-gain " }),
      { ok: true, value: { term: "Tanghin", spoken: "Than-gain" } },
    );
  });

  it("rejects empty, identical, oversized and decorated entries", () => {
    assert.equal(validateGlossaryEntry({ term: "", spoken: "x" }).ok, false);
    assert.equal(validateGlossaryEntry({ term: "x", spoken: "" }).ok, false);
    assert.equal(validateGlossaryEntry({ term: "Waga", spoken: "waga" }).ok, false);
    assert.equal(
      validateGlossaryEntry({ term: "x".repeat(61), spoken: "y" }).ok,
      false,
    );
    assert.equal(
      validateGlossaryEntry({ term: "a", spoken: "b — c" }).ok,
      false,
    );
    assert.equal(validateGlossaryEntry({ term: 1, spoken: {} }).ok, false);
  });
});

describe("canDeleteGlossaryEntry", () => {
  const entry = { created_by: "user-a" };

  it("lets authors remove their own entries", () => {
    assert.equal(
      canDeleteGlossaryEntry({ id: "user-a", user_type: "staff" }, entry),
      true,
    );
  });

  it("blocks staff from removing other people's entries", () => {
    assert.equal(
      canDeleteGlossaryEntry({ id: "user-b", user_type: "staff" }, entry),
      false,
    );
  });

  it("lets a founder remove anyone's entry, including orphaned ones", () => {
    assert.equal(
      canDeleteGlossaryEntry({ id: "f", user_type: "founder" }, entry),
      true,
    );
    assert.equal(
      canDeleteGlossaryEntry({ id: "f", user_type: "founder" }, { created_by: null }),
      true,
    );
    assert.equal(
      canDeleteGlossaryEntry({ id: "user-a", user_type: "staff" }, { created_by: null }),
      false,
    );
  });
});

describe("applyGlossary", () => {
  it("replaces whole words only, case-insensitively", () => {
    const glossary = [{ term: "Tanghin", spoken: "Than-gain" }];
    assert.equal(
      applyGlossary("À Tanghin et tanghin, pas Tanghinois", glossary),
      "À Than-gain et Than-gain, pas Tanghinois",
    );
  });

  it("treats regex characters in a term literally", () => {
    assert.equal(
      applyGlossary("Prix (TTC) ok", [{ term: "(TTC)", spoken: "toutes taxes" }]),
      "Prix toutes taxes ok",
    );
  });

  it("lets a team entry override the built-in table", () => {
    assert.equal(
      prepareForSpeech("Roogo", [{ term: "Roogo", spoken: "Roh-go" }]),
      "Roh-go",
    );
    assert.equal(prepareForSpeech("Roogo"), "Rohgo");
  });

  it("prefers the longest matching term", () => {
    assert.equal(
      applyGlossary("Zone Ouaga 2000", [
        { term: "Ouaga", spoken: "Waga" },
        { term: "Ouaga 2000", spoken: "Waga deux mille" },
      ]),
      "Zone Waga deux mille",
    );
  });
});

describe("currency", () => {
  it("converts USD to whole FCFA, rounding up", () => {
    assert.equal(usdToFcfa(0.036, 600), 22);
    assert.equal(usdToFcfa(15, 600), 9000);
    assert.equal(usdToFcfa(0, 600), 0);
  });

  it("formats FCFA first and USD on request", () => {
    assert.match(formatMoney(15, "FCFA", 600), /^9\s?000 FCFA$/u);
    assert.equal(formatMoney(15, "USD", 600), "15.00 $");
    assert.equal(formatMoney(0.036, "USD", 600), "0.036 $");
  });
});
