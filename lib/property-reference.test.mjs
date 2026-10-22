import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPropertyReference,
  normalizePropertyReferenceQuery,
  propertyReferenceKind,
} from "./property-reference.ts";

describe("isPropertyReference", () => {
  it("accepts VEN and LOC codes with three or more digits", () => {
    assert.equal(isPropertyReference("VEN-014"), true);
    assert.equal(isPropertyReference("LOC-007"), true);
    assert.equal(isPropertyReference("VEN-1234"), true);
  });

  it("rejects other shapes and non-strings", () => {
    for (const bad of ["VEN-14", "ven-014", "HOT-001", "VEN014", "", null, undefined, 14]) {
      assert.equal(isPropertyReference(bad), false, String(bad));
    }
  });
});

describe("propertyReferenceKind", () => {
  it("tells a sale from a rental", () => {
    assert.equal(propertyReferenceKind("VEN-001"), "vente");
    assert.equal(propertyReferenceKind("LOC-026"), "location");
    assert.equal(propertyReferenceKind("XXX-001"), null);
  });
});

describe("normalizePropertyReferenceQuery", () => {
  it("pads and uppercases what people type", () => {
    assert.equal(normalizePropertyReferenceQuery("ven14"), "VEN-014");
    assert.equal(normalizePropertyReferenceQuery(" VEN 014 "), "VEN-014");
    assert.equal(normalizePropertyReferenceQuery("loc-7"), "LOC-007");
    assert.equal(normalizePropertyReferenceQuery("LOC-0026"), "LOC-0026");
  });

  it("returns null for anything that is not a code", () => {
    assert.equal(normalizePropertyReferenceQuery("karpala"), null);
    assert.equal(normalizePropertyReferenceQuery("VEN"), null);
    assert.equal(normalizePropertyReferenceQuery(""), null);
  });
});
