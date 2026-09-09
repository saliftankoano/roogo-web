import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const failureMigration = readFileSync(
  new URL(
    "../supabase/migrations/070_payment_failure_notifications.sql",
    import.meta.url,
  ),
  "utf8",
);
const propertyLockMigration = readFileSync(
  new URL(
    "../supabase/migrations/071_atomic_property_lock_payments.sql",
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

const paymentMigrations = [
  "070_payment_failure_notifications.sql",
  "071_atomic_property_lock_payments.sql",
  "072_atomic_listing_payments.sql",
];
const migration = (name) => readFileSync(
  new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8",
);
async function beforePayments() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE users(id UUID PRIMARY KEY);
    CREATE TABLE bookings(id UUID PRIMARY KEY);
    CREATE TABLE properties(id UUID PRIMARY KEY, payment_id TEXT, status TEXT);
    CREATE TABLE transactions(id UUID PRIMARY KEY, deposit_id TEXT, property_id UUID,
      type TEXT, status TEXT, metadata JSONB, updated_at TIMESTAMPTZ);
    CREATE TABLE amenities(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE property_amenities(property_id UUID REFERENCES properties ON DELETE CASCADE,
      amenity_id TEXT REFERENCES amenities, PRIMARY KEY(property_id, amenity_id));
  `);
  await db.exec(migration("026_notification_deliveries.sql"));
  return db;
}

describe("consolidated first payment rollout", () => {
  it("has unique repository versions and one transaction/final definition per payment file", () => {
    const files = readdirSync(new URL("../supabase/migrations", import.meta.url))
      .filter((name) => name.endsWith(".sql"));
    const versions = files.map((name) => name.split("_")[0]);
    assert.equal(new Set(versions).size, versions.length);
    const functions = paymentMigrations.flatMap((name) => {
      const sql = migration(name);
      assert.equal((sql.match(/^BEGIN;$/gm) ?? []).length, 1);
      assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1);
      return [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)/g)]
        .map((match) => match[1]);
    });
    assert.equal(new Set(functions).size, functions.length);
    assert.equal(functions.length, 11);
  });

  it("installs the complete chain on the pre-payment schema without intermediate versions", async () => {
    const db = await beforePayments();
    try {
      await db.exec(`INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001');
        INSERT INTO notification_deliveries(user_id,notification_type,event_type,subject_id)
        VALUES ('00000000-0000-0000-0000-000000000001','payments','legacy.alert','old');`);
      for (const name of paymentMigrations) await db.exec(migration(name));
      assert.equal((await db.query("SELECT delivery_status FROM notification_deliveries")).rows[0].delivery_status, "sent");
      const claim = await db.query("SELECT claim_payment_failure_delivery(NULL,'payments','payments.failed','accountless','{}'::jsonb) AS claimed");
      assert.equal(claim.rows[0].claimed, true);
      await db.exec(`INSERT INTO amenities VALUES ('wifi','wifi');
        INSERT INTO properties(id,payment_id,status,creation_amenity_names)
        VALUES ('00000000-0000-0000-0000-000000000002','listing','en_ligne',ARRAY['wifi']);`);
      assert.equal((await db.query("SELECT * FROM property_amenities")).rows.length, 1);
      assert.equal((await db.query("SELECT * FROM listing_payment_consumptions")).rows.length, 1);
      for (const role of ["anon", "authenticated"]) {
        assert.equal((await db.query("SELECT has_function_privilege($1,'finalize_direct_property_lock(text,jsonb)','EXECUTE') AS allowed", [role])).rows[0].allowed, false);
      }
    } finally { await db.close(); }
  });

  for (const conflict of ["duplicate properties", "contradictory transaction link"]) {
    it(`rolls back all listing DDL on ${conflict} and allows a corrected retry`, async () => {
      const db = await beforePayments();
      try {
        await db.exec(`INSERT INTO properties(id,payment_id) VALUES
          ('00000000-0000-0000-0000-000000000001','deposit'),
          ('00000000-0000-0000-0000-000000000002',${conflict === "duplicate properties" ? "'deposit'" : "NULL"});`);
        if (conflict === "contradictory transaction link") {
          await db.exec(`INSERT INTO transactions(id,deposit_id,property_id,type)
            VALUES ('00000000-0000-0000-0000-000000000003','deposit',
            '00000000-0000-0000-0000-000000000002','listing_submission');`);
        }
        await assert.rejects(db.exec(migration(paymentMigrations[2])), { code: "23505" });
        await db.exec("ROLLBACK");
        assert.deepEqual((await db.query(`SELECT to_regclass('public.listing_payment_consumptions') AS ledger,
          to_regclass('public.properties_payment_id_unique') AS payment_index`)).rows[0], { ledger: null, payment_index: null });
        assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name='creation_amenity_names'")).rows.length, 0);
        assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM properties")).rows[0].count, 2);
        // Correct only the synthetic evidence, then retry the full transaction.
        await db.exec(`UPDATE properties SET payment_id=NULL WHERE id='00000000-0000-0000-0000-000000000002';
          UPDATE transactions SET property_id='00000000-0000-0000-0000-000000000001';`);
        await db.exec(migration(paymentMigrations[2]));
        assert.equal((await db.query("SELECT * FROM listing_payment_consumptions")).rows.length, 1);
      } finally { await db.close(); }
    });
  }
});

describe("payment-critical migrations", () => {
  it("makes a property fulfillment conflict a durable finalization result", () => {
    const firstConflict = propertyLockMigration.indexOf(
      "IF v_property_status <> 'en_ligne'",
    );
    const pendingConflict = firstConflict;
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
