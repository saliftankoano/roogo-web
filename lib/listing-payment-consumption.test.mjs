import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import vm from "node:vm";
import ts from "typescript";

const db = new PGlite();
const first = "00000000-0000-0000-0000-000000000001";
const second = "00000000-0000-0000-0000-000000000002";
const migration = (name) =>
  readFileSync(
    new URL(`../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
before(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE properties(id UUID PRIMARY KEY, payment_id TEXT);
    CREATE TABLE transactions(deposit_id TEXT, property_id UUID, type TEXT);
  `);
  await db.exec(migration("010_property_cascade_deletes.sql"));
  await db.exec(migration("070_single_use_listing_payments.sql"));
  await db.query("INSERT INTO properties VALUES ($1, 'historical')", [first]);
  await db.query(
    "INSERT INTO transactions VALUES ('historical', $1, 'listing_submission')",
    [first],
  );
  await db.exec(migration("074_durable_listing_payment_consumption.sql"));
});
after(() => db.close());

test("backfills matching property/transaction evidence once", async () => {
  assert.equal(
    (
      await db.query(
        "SELECT * FROM listing_payment_consumptions WHERE deposit_id='historical'",
      )
    ).rows.length,
    1,
  );
});

test("property deletion cannot restore a consumed deposit, even for the same UUID", async () => {
  await db.query("DELETE FROM properties WHERE id=$1", [first]);
  assert.equal(
    (
      await db.query(
        "SELECT property_id FROM transactions WHERE deposit_id='historical'",
      )
    ).rows[0].property_id,
    null,
  );
  for (const id of [first, second]) {
    await assert.rejects(
      db.query("INSERT INTO properties VALUES ($1, 'historical')", [id]),
      { code: "23505" },
    );
  }
  assert.equal(
    (
      await db.query(
        "SELECT property_id FROM listing_payment_consumptions WHERE deposit_id='historical'",
      )
    ).rows[0].property_id,
    first,
  );
});

test("clearing or replacing a property's payment does not release the earlier credit", async () => {
  await db.query("INSERT INTO properties VALUES ($1, 'original')", [first]);
  await db.query("UPDATE properties SET payment_id=NULL WHERE id=$1", [first]);
  await assert.rejects(
    db.query("INSERT INTO properties VALUES ($1, 'original')", [second]),
    { code: "23505" },
  );
  await db.query("UPDATE properties SET payment_id='replacement' WHERE id=$1", [
    first,
  ]);
  await db.query("UPDATE properties SET payment_id='original' WHERE id=$1", [
    first,
  ]);
  await db.query("DELETE FROM properties WHERE id=$1", [first]);
  await assert.rejects(
    db.query("INSERT INTO properties VALUES ($1, 'replacement')", [second]),
    { code: "23505" },
  );
});

test("rolled-back property creation does not consume a deposit", async () => {
  await db.exec("BEGIN");
  await db.query("INSERT INTO properties VALUES ($1, 'rolled-back')", [first]);
  await db.exec("ROLLBACK");
  assert.equal(
    (
      await db.query(
        "SELECT * FROM listing_payment_consumptions WHERE deposit_id='rolled-back'",
      )
    ).rows.length,
    0,
  );
  await db.query("INSERT INTO properties VALUES ($1, 'rolled-back')", [first]);
  await assert.rejects(
    db.query("INSERT INTO properties VALUES ($1, 'rolled-back')", [second]),
    { code: "23505" },
  );
});

test("ordinary clients cannot read or erase consumption history", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(
      db.query("SELECT * FROM listing_payment_consumptions"),
      { code: "42501" },
    );
    await assert.rejects(db.query("DELETE FROM listing_payment_consumptions"), {
      code: "42501",
    });
    await db.exec("RESET ROLE");
  }
});

const routeSource = readFileSync(
  new URL("../app/api/properties/route.ts", import.meta.url),
  "utf8",
);
const guardStart = routeSource.indexOf("      const { data: consumption,");
const guardEnd = routeSource.indexOf(
  "\n    if (\n      isFreeSuccessFeeListing",
  guardStart,
);
assert.ok(guardStart > 0 && guardEnd > guardStart);
async function preflight({
  linked = false,
  existing = true,
  errorTable = null,
} = {}) {
  const context = {
    paidTransaction: { property_id: linked ? first : null },
    finishPaidListing: async () => true,
    announceCreatedProperty: async () => {},
    parsedListingData: { payment_id: "historical" },
    listingPaymentMode: "upfront_package",
    req: {},
    NextResponse: Response,
    cors: (response) => response,
    errorResponse: (error, status) => Response.json({ error }, { status }),
    supabase: {
      from: (table) => {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            error: table === errorTable ? { code: "08006" } : null,
            data:
              table === errorTable
                ? null
                : table === "listing_payment_consumptions"
                  ? { property_id: first }
                  : existing
                    ? { id: first, status: "en_attente" }
                    : null,
          }),
        };
        return q;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(
    ts.transpileModule(
      `globalThis.run = async () => { if (true) {
    ${routeSource.slice(guardStart, guardEnd)} return null; };`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  return context.run();
}

test("route rejects consumed deposits whose property was deleted", async () => {
  assert.equal((await preflight({ existing: false })).status, 409);
});
test("route returns the linked existing property idempotently", async () => {
  const response = await preflight({ linked: true });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).propertyId, first);
});
test("route permits existing unlinked properties to reach link repair", async () => {
  assert.equal(await preflight(), null);
});
test("route treats ledger and property lookup outages as retryable", async () => {
  for (const errorTable of ["listing_payment_consumptions", "properties"]) {
    assert.equal((await preflight({ errorTable })).status, 503);
  }
});
