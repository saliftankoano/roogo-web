import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeOrder, moveItem } from "./photo-order.ts";

describe("moveItem", () => {
  it("moves one photo forward and back", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  });
  it("ignores out-of-range moves", () => {
    const list = ["a", "b"];
    assert.equal(moveItem(list, 0, 5), list);
  });
});

describe("mergeOrder", () => {
  it("keeps the saved order, drops removed photos and appends new ones", () => {
    assert.deepEqual(mergeOrder(["c", "a", "x"], ["a", "b", "c"]), ["c", "a", "b"]);
  });
  it("falls back to the listing order when nothing was saved", () => {
    assert.deepEqual(mergeOrder([], ["a", "b"]), ["a", "b"]);
  });
});
