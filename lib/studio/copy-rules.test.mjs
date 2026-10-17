import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkScript, normalizeScript } from "./copy-rules.ts";

describe("normalizeScript", () => {
  it("replaces em dashes automatically", () => {
    assert.equal(
      normalizeScript("Belle villa — à Waga"),
      "Belle villa, à Waga",
    );
  });
});

describe("checkScript", () => {
  it("passes a clean script", () => {
    assert.deepEqual(
      checkScript("Belle villa à louer. Visitez roogobf.com ou appelez-nous."),
      [],
    );
  });

  it("flags banned wording", () => {
    const codes = checkScript(
      "Un faux plafond, roogo.bf et des add-ons \u{1F600}",
    ).map((w) => w.code);
    assert.deepEqual(
      codes.sort(),
      ["add-ons", "emoji", "faux", "wrong-domain"].sort(),
    );
  });

  it("flags fee wording only when a percentage meets a fee word", () => {
    assert.equal(checkScript("7% de commission").length, 1);
    assert.equal(checkScript("Remise de 7% ce mois").length, 0);
  });
});
