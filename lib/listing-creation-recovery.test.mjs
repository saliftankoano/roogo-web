import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const propertyId = "00000000-0000-0000-0000-000000000001";
const transactionId = "00000000-0000-0000-0000-000000000002";
before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE properties(id UUID PRIMARY KEY, payment_id TEXT, status TEXT, transaction_id UUID);
    CREATE TABLE transactions(id UUID PRIMARY KEY, deposit_id TEXT, property_id UUID, type TEXT, user_id TEXT, status TEXT, updated_at TIMESTAMPTZ);
    CREATE TABLE amenities(id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE property_amenities(property_id UUID REFERENCES properties ON DELETE CASCADE, amenity_id TEXT REFERENCES amenities, PRIMARY KEY(property_id, amenity_id));
    INSERT INTO amenities VALUES ('wifi', 'wifi'), ('parking', 'parking');
  `);
  for (const migration of [
    "010_property_cascade_deletes.sql",
    "072_atomic_listing_payments.sql",
  ])
    await db.exec(
      readFileSync(
        new URL(`../supabase/migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
});
beforeEach(async () => {
  await db.exec(
    "TRUNCATE properties, transactions, listing_payment_consumptions, property_amenities CASCADE",
  );
  await db.query(
    "INSERT INTO transactions VALUES ($1, 'deposit', NULL, 'listing_submission', 'owner', 'completed', NOW())",
    [transactionId],
  );
});
after(() => db.close());

const source = readFileSync(
  new URL("../app/api/properties/route.ts", import.meta.url),
  "utf8",
);
const helpers = source.slice(
  source.indexOf("    const announceCreatedProperty ="),
  source.indexOf("    // 7. Map interdiction"),
);
const guard = source.slice(
  source.indexOf("      const { data: consumption,"),
  source.indexOf("\n    if (\n      isFreeSuccessFeeListing"),
);
const creationStart = source.indexOf("    // 9. Insert property");
const creation = source.slice(
  creationStart,
  source.indexOf("\n  } catch (error)", creationStart),
);

function harness() {
  const faults = new Set();
  const announcements = [];
  const context = {
    console: { log() {}, error() {} },
    supabase: {
      from(table) {
        let action = "select",
          patch,
          selected = false;
        const filters = [];
        const q = {
          insert(value) {
            action = "insert";
            patch = value;
            return q;
          },
          update(value) {
            action = "update";
            patch = value;
            return q;
          },
          select() {
            selected = true;
            return q;
          },
          eq(key, value) {
            filters.push([key, value]);
            return q;
          },
          is(key, value) {
            filters.push([key, value]);
            return q;
          },
          single: () => execute(true),
          maybeSingle: () => execute(true),
          then: (resolve, reject) => execute(false).then(resolve, reject),
        };
        async function execute(single) {
          if (faults.has(`${table}:${action}`))
            return { data: null, error: { code: "08006" } };
          const values = [];
          const param = (value) => {
            values.push(value);
            return `$${values.length}`;
          };
          // Table/column names originate exclusively in the real route under test.
          const where = () =>
            filters.length
              ? " WHERE " +
                filters
                  .map(([key, value]) =>
                    value === null
                      ? `${key} IS NULL`
                      : `${key}=${param(value)}`,
                  )
                  .join(" AND ")
              : "";
          let sql;
          if (action === "insert") {
            sql = `INSERT INTO ${table}(${Object.keys(patch).join(",")}) VALUES (${Object.values(patch).map(param).join(",")}) RETURNING *`;
          } else if (action === "update") {
            sql = `UPDATE ${table} SET ${Object.entries(patch)
              .map(([key, value]) => `${key}=${param(value)}`)
              .join(",")}${where()}${selected ? " RETURNING *" : ""}`;
          } else sql = `SELECT * FROM ${table}${where()}`;
          try {
            const { rows } = await db.query(sql, values);
            return { data: single ? (rows[0] ?? null) : rows, error: null };
          } catch (error) {
            return { data: null, error };
          }
        }
        return q;
      },
    },
    propertyData: {
      id: propertyId,
      payment_id: "deposit",
      status: "en_ligne",
      creation_amenity_names: ["wifi", "wifi"],
    },
    parsedListingData: { payment_id: "deposit", equipements: ["wifi"] },
    listingPaymentTransactionId: transactionId,
    propertyStatus: "en_ligne",
    isStaffOrFounder: false,
    directOwner: null,
    isSaleListing: false,
    deferredSuccessFeeAmount: 0,
    freeListingReferral: null,
    user: { id: "owner", user_type: "owner" },
    req: {},
    NextResponse: Response,
    cors: (response) => response,
    errorResponse: (error, status) => Response.json({ error }, { status }),
    safeError: (_, fallback) => fallback,
    listingPaymentMode: "upfront_package",
    captureServerEvent: async (...args) => announcements.push(args),
    notifyRentersOfNewMatchingProperty: async (id) => announcements.push(id),
    qualifyReferralForTransaction: async () => {},
    translatePropertyIfNeeded: async () => {},
  };
  vm.createContext(context);
  vm.runInContext(
    ts.transpileModule(
      `
    ${helpers}
    globalThis.create = async () => { ${creation} };
    globalThis.preflight = async () => { if (true) { ${guard} return null; };
  `,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
    context,
  );
  return { context, faults, announcements };
}

test("transaction-link outage preserves atomic amenities and retry finishes the same listing", async () => {
  const h = harness();
  h.faults.add("transactions:update");
  assert.equal((await h.context.create()).status, 503);
  assert.equal(
    (await db.query("SELECT * FROM property_amenities")).rows.length,
    1,
  );
  assert.equal(h.announcements.length, 2);
  h.faults.clear();
  h.context.propertyData.creation_amenity_names = ["parking"];
  const response = await h.context.create();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).propertyId, propertyId);
  assert.deepEqual(
    (await db.query("SELECT amenity_id FROM property_amenities")).rows,
    [{ amenity_id: "wifi" }],
  );
  assert.equal(
    (await db.query("SELECT transaction_id FROM properties")).rows[0]
      .transaction_id,
    transactionId,
  );
  assert.equal(h.announcements.length, 2);
  assert.equal(
    h.announcements[0][2].$insert_id,
    `property-listing-created:${propertyId}`,
  );
});

test("linked preflight repairs a failed reverse link before reporting success", async () => {
  const h = harness();
  h.faults.add("properties:update");
  assert.equal((await h.context.create()).status, 503);
  h.context.paidTransaction = (
    await db.query("SELECT * FROM transactions")
  ).rows[0];
  assert.equal((await h.context.preflight()).status, 503);
  h.faults.clear();
  assert.equal((await h.context.preflight()).status, 200);
  assert.equal(
    (await db.query("SELECT transaction_id FROM properties")).rows[0]
      .transaction_id,
    transactionId,
  );
  assert.equal(
    (await db.query("SELECT * FROM property_amenities")).rows.length,
    1,
  );
});

test("an amenities write failure rolls back both property and consumption", async () => {
  await db.exec(`CREATE FUNCTION reject_test_amenity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END; $$;
    CREATE TRIGGER reject_test_amenity BEFORE INSERT ON property_amenities FOR EACH ROW EXECUTE FUNCTION reject_test_amenity();`);
  const h = harness();
  try {
    assert.equal((await h.context.create()).status, 500);
    assert.equal((await db.query("SELECT * FROM properties")).rows.length, 0);
    assert.equal(
      (await db.query("SELECT * FROM listing_payment_consumptions")).rows
        .length,
      0,
    );
  } finally {
    await db.exec(
      "DROP TRIGGER reject_test_amenity ON property_amenities; DROP FUNCTION reject_test_amenity()",
    );
  }
  assert.equal((await h.context.create()).status, 200);
});

test("retries do not restore amenities intentionally removed after creation", async () => {
  const h = harness();
  assert.equal((await h.context.create()).status, 200);
  await db.exec("DELETE FROM property_amenities");
  h.context.paidTransaction = (
    await db.query("SELECT * FROM transactions")
  ).rows[0];
  assert.equal((await h.context.preflight()).status, 200);
  assert.equal(
    (await db.query("SELECT * FROM property_amenities")).rows.length,
    0,
  );
});

test("legacy writers can omit the new nullable amenities snapshot", async () => {
  await db.query(
    "INSERT INTO properties(id, payment_id) VALUES ($1, 'legacy')",
    [propertyId],
  );
  assert.equal(
    (await db.query("SELECT * FROM listing_payment_consumptions")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("SELECT * FROM property_amenities")).rows.length,
    0,
  );
});

test("concurrent submissions attach amenities to only the deposit's winning property", async () => {
  const first = harness();
  const second = harness();
  second.context.propertyData.id = "00000000-0000-0000-0000-000000000003";
  second.context.propertyData.creation_amenity_names = ["parking"];
  const responses = await Promise.all([first.context.create(), second.context.create()]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  const ids = await Promise.all(responses.map(async response => (await response.json()).propertyId));
  assert.equal(ids[0], ids[1]);
  assert.equal((await db.query("SELECT * FROM properties")).rows.length, 1);
  const amenities = (await db.query("SELECT * FROM property_amenities")).rows;
  assert.equal(amenities.length, 1);
  assert.equal(amenities[0].property_id, ids[0]);
  assert.equal(first.announcements.length + second.announcements.length, 2);
});

test("the route snapshots sale-filtered amenities in the atomic insert", () => {
  assert.match(source, /creation_amenity_names: isSaleListing/);
  assert.match(
    source.slice(
      source.indexOf("creation_amenity_names:"),
      source.indexOf("// Boost information"),
    ),
    /SALE_EQUIPEMENT_IDS/,
  );
  assert.doesNotMatch(creation, /from\("property_amenities"\)/);
});
