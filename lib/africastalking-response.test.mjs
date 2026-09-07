import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSmsRecipientAccepted } from "./africastalking-response.ts";

describe("Africa's Talking SMS responses", () => {
  it("accepts successful recipient acknowledgements", () => {
    assert.equal(
      isSmsRecipientAccepted(
        {
          SMSMessageData: {
            Recipients: [
              {
                number: "+22663784299",
                status: "Success",
                statusCode: 101,
              },
            ],
          },
        },
        "+22663784299",
      ),
      true,
    );
  });

  it("rejects recipient-level failures from a resolved API call", () => {
    assert.equal(
      isSmsRecipientAccepted(
        {
          SMSMessageData: {
            Recipients: [
              {
                number: "+22663784299",
                status: "InsufficientBalance",
                statusCode: 405,
              },
            ],
          },
        },
        "+22663784299",
      ),
      false,
    );
  });

  it("fails closed for malformed or mismatched responses", () => {
    assert.equal(isSmsRecipientAccepted({}, "+22663784299"), false);
    assert.equal(
      isSmsRecipientAccepted(
        {
          SMSMessageData: {
            Recipients: [
              { number: "+22670000000", status: "Success", statusCode: 101 },
              { number: "+22671000000", status: "Success", statusCode: 101 },
            ],
          },
        },
        "+22663784299",
      ),
      false,
    );
  });
});
