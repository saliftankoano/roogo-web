import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// lib/sale-price-guard.ts imports the calculation through the "@/lib" alias.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/sale-economics") {
      return {
        url: new URL("./sale-economics.ts", import.meta.url).href,
        shortCircuit: true,
      };
    }
    return next(specifier, context);
  },
});

const { DEFAULT_SALE_ECONOMICS } = await import("./sale-economics.ts");
const { evaluateSalePriceChange } = await import("./sale-price-guard.ts");

const NET = 35_000_000;

function decide(newPrice, isFounder = false) {
  return evaluateSalePriceChange({
    newPrice,
    sellerNetPrice: NET,
    snapshot: DEFAULT_SALE_ECONOMICS,
    isFounder,
  });
}

describe("public sale price guard (net 35M)", () => {
  it("allows the listing rung and anything down to the team floor", () => {
    assert.deepEqual(decide(45_500_000), { ok: true });
    assert.deepEqual(decide(42_000_000), { ok: true });
    assert.deepEqual(decide(40_250_000), { ok: true });
  });

  it("requires a founder between +15% and +10%", () => {
    const staff = decide(40_000_000);
    assert.equal(staff.ok, false);
    assert.equal(staff.status, 403);
    assert.deepEqual(decide(40_000_000, true), { ok: true });
    assert.deepEqual(decide(38_500_000, true), { ok: true });
  });

  it("refuses anything below +10%, even for a founder", () => {
    for (const isFounder of [false, true]) {
      const d = decide(38_499_999, isFounder);
      assert.equal(d.ok, false);
      assert.equal(d.status, 422);
    }
    assert.equal(decide(NET, true).ok, false);
  });

  it("rejects invalid prices", () => {
    assert.equal(decide(0).ok, false);
    assert.equal(decide(Number.NaN).ok, false);
  });

  it("uses no em dash in its messages", () => {
    for (const d of [decide(40_000_000), decide(1_000)]) {
      assert.ok(!d.error.includes("—"));
    }
  });
});

describe("migration 076: private seller asking price", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/076_private_seller_asking_price.sql",
      import.meta.url,
    ),
    "utf8",
  );

  it("moves existing values out and blocks new public writes", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER
        LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
      CREATE TABLE public.properties(
        id UUID PRIMARY KEY,
        price NUMERIC,
        seller_asking_price NUMERIC
      );
      INSERT INTO public.properties VALUES
        ('00000000-0000-0000-0000-000000000001', 45500000, 35000000),
        ('00000000-0000-0000-0000-000000000002', 150000, NULL);
    `);
    await db.exec(migration);

    const moved = await db.query(
      "SELECT property_id, seller_asking_price::float8 AS p, source FROM public.sale_asking_prices",
    );
    assert.equal(moved.rows.length, 1);
    assert.equal(moved.rows[0].p, 35_000_000);
    assert.equal(moved.rows[0].source, "backfill_properties");

    const cleared = await db.query(
      "SELECT count(*)::int AS n FROM public.properties WHERE seller_asking_price IS NOT NULL",
    );
    assert.equal(cleared.rows[0].n, 0);

    await assert.rejects(
      db.exec(
        "UPDATE public.properties SET seller_asking_price = 1 WHERE id = '00000000-0000-0000-0000-000000000002'",
      ),
    );

    const grants = await db.query(
      "SELECT has_table_privilege('anon', 'public.sale_asking_prices', 'SELECT') AS anon_can, has_table_privilege('authenticated', 'public.sale_asking_prices', 'SELECT') AS auth_can",
    );
    assert.equal(grants.rows[0].anon_can, false);
    assert.equal(grants.rows[0].auth_can, false);
  });
});
