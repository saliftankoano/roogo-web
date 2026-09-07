import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPaymentFailure,
  extractPaymentPayerPhone,
  paymentFailureMessage,
  paymentFailureSmsMessage,
} from "./payment-failures.ts";

describe("payment failures", () => {
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
});

