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
      propertyLockMigration.indexOf("UPDATE public.properties", pendingConflict),
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
});
