import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const failureMigration = readFileSync(
  new URL(
    "../supabase/migrations/068_payment_failure_notifications.sql",
    import.meta.url,
  ),
  "utf8",
);
const propertyLockMigration = readFileSync(
  new URL(
    "../supabase/migrations/069_atomic_direct_property_lock.sql",
    import.meta.url,
  ),
  "utf8",
);
const paymentPageRoute = readFileSync(
  new URL("../app/api/payments/paymentpage/route.ts", import.meta.url),
  "utf8",
);
const failureDispatcher = readFileSync(
  new URL("./payment-failure-notifications.ts", import.meta.url),
  "utf8",
);

describe("payment-critical migrations", () => {
  it("makes a property fulfillment conflict a durable finalization result", () => {
    const firstConflict = propertyLockMigration.indexOf(
      "IF v_property_status <> 'en_ligne'",
    );
    const pendingConflict = propertyLockMigration.indexOf(
      "IF v_property_status <> 'en_ligne'",
      firstConflict + 1,
    );
    const conflictBranch = propertyLockMigration.slice(
      pendingConflict,
      propertyLockMigration.indexOf(
        "UPDATE public.properties",
        pendingConflict,
      ),
    );
    assert.match(conflictBranch, /'propertyLockFinalizedAt', NOW\(\)/);
    assert.match(conflictBranch, /'propertyLockConflict', TRUE/);
  });

  it("supports leased retries for payment-critical per-user alerts", () => {
    assert.match(
      failureMigration,
      /FUNCTION public\.claim_retryable_notification_delivery/,
    );
    assert.match(failureMigration, /delivery_status = 'pending'/);
    assert.match(failureMigration, /delivery_status = 'failed'/);
    assert.match(failureMigration, /lease_expires_at < NOW\(\)/);
  });

  it("server-prices and claims hosted monthly property payments", () => {
    const propertyLockBranch = paymentPageRoute.slice(
      paymentPageRoute.indexOf('if (transactionType === "property_lock")'),
      paymentPageRoute.indexOf('log("request-validated"'),
    );
    assert.match(propertyLockBranch, /propertyRecord\.status !== "en_ligne"/);
    assert.match(propertyLockBranch, /getMoveInPaymentBreakdown/);
    assert.match(propertyLockBranch, /resolvedAmount = breakdown\.totalAmount/);

    const claim = paymentPageRoute.indexOf(
      "claimMonthlyPropertyLockPayment(",
      paymentPageRoute.indexOf("const payload ="),
    );
    const upstream = paymentPageRoute.indexOf(
      "fetch(`${pawaUrl}\/v2\/paymentpage`",
    );
    assert.ok(claim > 0 && claim < upstream);
  });

  it("releases property claims before queuing optional notification work", () => {
    const release = failureDispatcher.indexOf(
      "await releaseMonthlyPropertyLockPayment",
    );
    const backgroundWork = failureDispatcher.indexOf("after(async () =>");
    assert.ok(release > 0 && release < backgroundWork);
  });
});
