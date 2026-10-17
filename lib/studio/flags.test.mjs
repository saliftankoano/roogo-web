import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isVoiceCloningEnabled } from "./flags.ts";

describe("isVoiceCloningEnabled", () => {
  it("is off unless explicitly set to true", () => {
    assert.equal(isVoiceCloningEnabled(undefined), false);
    assert.equal(isVoiceCloningEnabled(""), false);
    assert.equal(isVoiceCloningEnabled("false"), false);
    assert.equal(isVoiceCloningEnabled("1"), false);
    assert.equal(isVoiceCloningEnabled("true"), true);
    assert.equal(isVoiceCloningEnabled(" TRUE "), true);
  });
});
