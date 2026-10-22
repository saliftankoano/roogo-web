import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCurrency, formatNumber, parsePrice } from "./format.ts";

const NNBSP = " ";

describe("formatNumber", () => {
  it("groups thousands with the French narrow no-break space", () => {
    assert.equal(formatNumber(1_000_000), `1${NNBSP}000${NNBSP}000`);
    assert.equal(formatNumber(990_000), `990${NNBSP}000`);
  });

  it("never shows decimals", () => {
    assert.equal(formatNumber(3_499.6), `3${NNBSP}500`);
    assert.equal(formatNumber(0.4), "0");
  });

  it("accepts numeric strings with spaces or commas", () => {
    assert.equal(formatNumber("1 000 000"), `1${NNBSP}000${NNBSP}000`);
    assert.equal(formatNumber("1,000,000"), `1${NNBSP}000${NNBSP}000`);
  });

  it("returns the input untouched when it is not a number", () => {
    assert.equal(formatNumber("abc"), "abc");
  });

  it("returns an empty string for missing values", () => {
    assert.equal(formatNumber(undefined), "");
    assert.equal(formatNumber(null), "");
    assert.equal(formatNumber(""), "");
  });

  it("uses commas in English", () => {
    assert.equal(formatNumber(1_000_000, "en"), "1,000,000");
  });
});

describe("formatCurrency", () => {
  it("appends the FCFA label after a plain space", () => {
    assert.equal(formatCurrency(50_000), `50${NNBSP}000 FCFA`);
  });

  it("supports the XOF label", () => {
    assert.equal(formatCurrency(50_000, "fr", "XOF"), `50${NNBSP}000 XOF`);
  });

  it("stays empty when there is nothing to format", () => {
    assert.equal(formatCurrency(null), "");
  });
});

describe("parsePrice", () => {
  it("reads back a formatted price", () => {
    assert.equal(parsePrice(`1${NNBSP}000${NNBSP}000 FCFA`), 1_000_000);
    assert.equal(parsePrice("1 000 000"), 1_000_000);
  });

  it("ignores any non-digit character", () => {
    assert.equal(parsePrice("≈ 75.000 F"), 75_000);
  });

  it("returns undefined for empty or non-numeric text", () => {
    assert.equal(parsePrice(""), undefined);
    assert.equal(parsePrice("FCFA"), undefined);
  });
});
