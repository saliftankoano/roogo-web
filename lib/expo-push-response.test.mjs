import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpoPushResponseAccepted } from "./expo-push-response.ts";

describe("Expo push responses", () => {
  it("accepts a successful push ticket", () => {
    assert.equal(
      isExpoPushResponseAccepted({ data: [{ status: "ok", id: "ticket-1" }] }),
      true,
    );
  });

  it("rejects HTTP-success payloads containing only failed tickets", () => {
    assert.equal(
      isExpoPushResponseAccepted({
        data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
      }),
      false,
    );
  });

  it("fails closed for malformed responses", () => {
    assert.equal(isExpoPushResponseAccepted({ data: [] }), false);
    assert.equal(isExpoPushResponseAccepted(null), false);
  });
});
