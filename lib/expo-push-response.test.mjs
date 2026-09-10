import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getInvalidExpoPushTokens,
  isExpoPushResponseAccepted,
  isExpoPushResponseRejected,
} from "./expo-push-response.ts";

describe("Expo push responses", () => {
  it("requires explicit rejection tickets for every target before retrying", () => {
    assert.equal(
      isExpoPushResponseRejected({ data: [{ status: "error" }] }, 1),
      true,
    );
    assert.equal(
      isExpoPushResponseRejected({ data: [{ status: "error" }] }, 2),
      false,
    );
    assert.equal(isExpoPushResponseRejected({ data: [] }, 1), false);
    assert.equal(
      isExpoPushResponseRejected(
        { data: [{ status: "ok" }, { status: "error" }] },
        2,
      ),
      false,
    );
  });
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

  it("maps DeviceNotRegistered tickets back to their target tokens", () => {
    assert.deepEqual(
      getInvalidExpoPushTokens(
        {
          data: [
            { status: "ok", id: "ticket-1" },
            { status: "error", details: { error: "DeviceNotRegistered" } },
            { status: "error", details: { error: "MessageTooBig" } },
          ],
        },
        [
          "ExponentPushToken[one]",
          "ExponentPushToken[two]",
          "ExponentPushToken[three]",
        ],
      ),
      ["ExponentPushToken[two]"],
    );
  });
});
