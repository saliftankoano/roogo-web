import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPaymentFailure,
  extractPaymentPayerPhone,
  isUncertainPaymentInitiationFailure,
  parsePawaPayInitiationResponse,
  paymentFailureMessage,
  paymentFailureSmsMessage,
  parsePawaPayDepositStatus,
  shouldApplyPaymentStatus,
  shouldRetryPaymentFailureNotification,
} from "./payment-failures.ts";

describe("payment failures", () => {
  it("normalizes malformed and non-object initiation bodies to an unknown response", () => {
    for (const body of [
      "null",
      "[]",
      "42",
      '"unavailable"',
      "",
      "<html>Bad Gateway</html>",
    ])
      assert.deepEqual(parsePawaPayInitiationResponse(body), {});
    assert.deepEqual(parsePawaPayInitiationResponse('{"status":"REJECTED"}'), {
      status: "REJECTED",
    });
  });
  it("extracts a v2 failure from a callback", () => {
    assert.deepEqual(
      extractPaymentFailure({
        failureReason: {
          failureCode: "INSUFFICIENT_BALANCE",
          failureMessage: "The customer does not have enough funds.",
        },
      }),
      {
        code: "INSUFFICIENT_BALANCE",
        providerMessage: "The customer does not have enough funds.",
      },
    );
  });

  it("extracts a nested initiation failure", () => {
    assert.equal(
      extractPaymentFailure({
        details: {
          failureReason: { failureCode: "payment_not_approved" },
        },
      }).code,
      "PAYMENT_NOT_APPROVED",
    );
  });

  it("extracts a persisted JSON failure", () => {
    assert.equal(
      extractPaymentFailure({
        failure_reason: JSON.stringify({
          failureCode: "PAYER_NOT_FOUND",
          failureMessage: "Internal provider wording",
        }),
      }).code,
      "PAYER_NOT_FOUND",
    );
  });

  it("extracts the payer number from a status payload", () => {
    assert.equal(
      extractPaymentPayerPhone({
        payer: { accountDetails: { phoneNumber: "22602345048" } },
      }),
      "22602345048",
    );
  });

  it("returns controlled localized copy instead of provider wording", () => {
    assert.equal(
      paymentFailureMessage("INSUFFICIENT_BALANCE", "en"),
      "Your Mobile Money balance is insufficient. Add funds and try again.",
    );
    assert.equal(
      paymentFailureMessage("SOMETHING_NEW", "fr"),
      "Le paiement a échoué. Vérifiez les informations puis réessayez.",
    );
  });

  it("keeps failure SMS copy GSM-friendly", () => {
    assert.doesNotMatch(
      paymentFailureSmsMessage("INSUFFICIENT_BALANCE", "fr"),
      /[\u0300-\u036fàâçéèêëîïôûùüÿñæœ]/i,
    );
  });

  it("keeps PawaPay UNKNOWN_ERROR initiations pending for reconciliation", () => {
    const payload = { failureReason: { failureCode: "UNKNOWN_ERROR" } };
    assert.equal(isUncertainPaymentInitiationFailure(500, payload), true);
    assert.equal(isUncertainPaymentInitiationFailure(400, payload), false);
    assert.equal(
      isUncertainPaymentInitiationFailure(500, {
        status: "REJECTED",
        failureReason: { failureCode: "INVALID_AMOUNT" },
      }),
      false,
    );
  });

  it("preserves unstructured gateway errors and timeouts for reconciliation", () => {
    for (const status of [408, 500, 502, 503, 504]) {
      for (const body of [
        null,
        "",
        "<html>Bad Gateway</html>",
        {},
        { raw: "<html>Bad Gateway</html>" },
        { failureReason: { failureCode: "NEW_GATEWAY_ERROR" } },
        { status: "REJECTED", failureReason: { failureCode: "UNKNOWN_ERROR" } },
      ])
        assert.equal(isUncertainPaymentInitiationFailure(status, body), true);
    }
    assert.equal(isUncertainPaymentInitiationFailure(400, {}), false);
  });

  it("does not regress terminal payment states", () => {
    assert.equal(shouldApplyPaymentStatus("pending", "failed"), true);
    assert.equal(shouldApplyPaymentStatus("failed", "failed"), true);
    assert.equal(shouldApplyPaymentStatus("completed", "failed"), false);
    assert.equal(shouldApplyPaymentStatus("failed", "completed"), false);
    assert.equal(shouldApplyPaymentStatus("completed", "refunded"), true);
  });

  it("retries transient notification failures but not terminal skips", () => {
    assert.equal(
      shouldRetryPaymentFailureNotification({
        delivered: false,
        reason: "push",
      }),
      true,
    );
    assert.equal(
      shouldRetryPaymentFailureNotification({
        delivered: false,
        reason: "sms_claim_failed",
      }),
      true,
    );
    assert.equal(
      shouldRetryPaymentFailureNotification({
        delivered: false,
        reason: "push_context",
      }),
      true,
    );
    assert.equal(
      shouldRetryPaymentFailureNotification({
        delivered: false,
        reason: "sms_cooldown",
      }),
      false,
    );
    assert.equal(
      shouldRetryPaymentFailureNotification({
        delivered: true,
        reason: "sms",
      }),
      false,
    );
  });

  it("unwraps the PawaPay v2 FOUND status envelope", () => {
    const result = parsePawaPayDepositStatus({
      status: "FOUND",
      data: {
        depositId: "deposit-1",
        status: "FAILED",
        failureReason: { failureCode: "INSUFFICIENT_BALANCE" },
      },
    });

    assert.equal(result.lookupStatus, "FOUND");
    assert.equal(result.status, "FAILED");
    assert.equal(result.deposit?.depositId, "deposit-1");
  });

  it("recognizes the HTTP-200 PawaPay v2 NOT_FOUND result", () => {
    assert.deepEqual(parsePawaPayDepositStatus({ status: "NOT_FOUND" }), {
      lookupStatus: "NOT_FOUND",
      deposit: null,
      status: "NOT_FOUND",
    });
  });

  it("keeps compatibility with direct and legacy-array status payloads", () => {
    assert.equal(
      parsePawaPayDepositStatus({ status: "COMPLETED" }).status,
      "COMPLETED",
    );
    assert.equal(
      parsePawaPayDepositStatus([{ status: "SUBMITTED" }]).status,
      "SUBMITTED",
    );
  });
});
