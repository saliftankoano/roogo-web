import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const propertyId = "00000000-0000-0000-0000-000000000001";
const transactionId = "00000000-0000-0000-0000-000000000002";
before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE properties (id UUID PRIMARY KEY, status TEXT);
    CREATE TABLE transactions (
      id UUID PRIMARY KEY, deposit_id TEXT, type TEXT, status TEXT,
      failure_code TEXT, metadata JSONB, property_id UUID, updated_at TIMESTAMPTZ
    );
  `);
  for (const migration of [
    "069_atomic_direct_property_lock.sql",
    "071_preserve_completed_property_locks.sql",
  ]) {
    await db.exec(
      readFileSync(
        new URL(`../supabase/migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }
});
after(() => db.close());
beforeEach(() => db.exec("TRUNCATE transactions, properties"));

async function seed(status, propertyStatus, metadata = {}) {
  await db.query("INSERT INTO properties(id, status) VALUES ($1, $2)", [
    propertyId,
    propertyStatus,
  ]);
  await db.query(
    `INSERT INTO transactions(id, deposit_id, type, status, metadata, property_id)
    VALUES ($1, 'deposit', 'property_lock', $2, $3, $4)`,
    [transactionId, status, metadata, propertyId],
  );
}
const finalize = async () =>
  (await db.query("SELECT * FROM finalize_direct_property_lock('deposit')"))
    .rows[0];
const property = async () =>
  (await db.query("SELECT * FROM properties")).rows[0];

for (const propertyStatus of ["locked", "en_ligne", "en_attente"]) {
  test(`legacy completed payment leaves ${propertyStatus} property and metadata untouched`, async () => {
    await seed("completed", propertyStatus);
    await db.query(`UPDATE properties SET lock_payment_deposit_id = 'newer-deposit',
      lock_payment_expires_at = NOW() + INTERVAL '30 minutes'`);
    const beforeProperty = await property();
    const result = await finalize();
    assert.equal(result.payment_status, "completed");
    assert.equal(result.fulfillment_conflict, false);
    assert.equal(result.transitioned, false);
    assert.deepEqual(await property(), beforeProperty);
    assert.deepEqual(
      (await db.query("SELECT metadata FROM transactions")).rows[0].metadata,
      {},
    );
  });
}

test("legacy completion with a deleted property remains completed", async () => {
  await seed("completed", "en_ligne");
  await db.exec("DELETE FROM properties");
  assert.equal((await finalize()).payment_status, "completed");
});

test("an unclaimed relisted property is not re-locked by a legacy payment", async () => {
  await seed("completed", "en_ligne", null);
  const result = await finalize();
  assert.equal(result.fulfillment_conflict, false);
  assert.equal((await property()).status, "en_ligne");
  assert.equal((await property()).lock_payment_deposit_id, null);
});

test("new completion locks once; subsequent polls do not re-lock a relisted property", async () => {
  await seed("pending", "en_ligne");
  await db.query("SELECT claim_direct_property_lock_payment($1, 'deposit')", [
    propertyId,
  ]);
  assert.equal((await finalize()).transitioned, true);
  assert.equal((await property()).status, "locked");
  assert.equal((await property()).lock_payment_deposit_id, null);
  await db.exec("UPDATE properties SET status = 'en_ligne'");
  assert.equal((await finalize()).transitioned, false);
  assert.equal((await property()).status, "en_ligne");
});

test("a new fulfillment conflict remains durable after the property is relisted", async () => {
  await seed("submitted", "locked");
  assert.equal((await finalize()).fulfillment_conflict, true);
  await db.exec("UPDATE properties SET status = 'en_ligne'");
  const result = await finalize();
  assert.equal(result.payment_status, "completed");
  assert.equal(result.fulfillment_conflict, true);
  assert.equal((await property()).status, "en_ligne");
});

test("failed payment cannot lock a property", async () => {
  await seed("failed", "en_ligne");
  assert.equal((await finalize()).payment_status, "failed");
  assert.equal((await property()).status, "en_ligne");
});
