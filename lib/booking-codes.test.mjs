import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateBookingCode,
  generateHotelInviteCode,
  normalizeBookingCode,
} from "./booking-codes.ts";

describe("hotel booking codes", () => {
  for (const [input, expected] of [
    ["rg 7xk2m9", "RG-7XK2M9"],
    ["RG7XK2M9", "RG-7XK2M9"],
    ["RG-7XK2M9", "RG-7XK2M9"],
    ["7XK2M9", "RG-7XK2M9"],
    ["RG34X7", "RG-RG34X7"],
  ]) {
    it(`normalizes ${input}`, () => {
      assert.equal(normalizeBookingCode(input), expected);
    });
  }

  it("generates front-desk-safe booking codes", () => {
    const generated = Array.from({ length: 50 }, generateBookingCode);
    assert.equal(
      generated.every((code) => /^RG-[2-9A-HJ-KM-NP-TV-Z]{6}$/.test(code)),
      true,
    );
    assert.equal(new Set(generated).size, generated.length);
  });

  it("generates eight-character hotel invite codes", () => {
    assert.match(generateHotelInviteCode(), /^[2-9A-HJ-KM-NP-TV-Z]{8}$/);
  });
});
