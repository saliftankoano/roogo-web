import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_SALE_ECONOMICS, settle } from "./sale-economics.ts";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/075_sale_guaranteed_price.sql",
    import.meta.url,
  ),
  "utf8",
);

const USER = "00000000-0000-0000-0000-000000000001";
const PROPERTY = "00000000-0000-0000-0000-000000000002";
const V2_MANDATE = "00000000-0000-0000-0000-000000000003";
const V3_MANDATE = "00000000-0000-0000-0000-000000000004";

// Minimal pre-075 shape of the tables the migration touches.
async function before075() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION public.update_updated_at_column() RETURNS TRIGGER
      LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
    CREATE TABLE public.users(id UUID PRIMARY KEY);
    CREATE TABLE public.properties(id UUID PRIMARY KEY);
    CREATE TABLE public.listing_config(
      id TEXT PRIMARY KEY DEFAULT 'default',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO public.listing_config(id) VALUES ('default');
    CREATE TABLE public.property_mandates(
      id UUID PRIMARY KEY,
      property_id UUID NOT NULL REFERENCES public.properties(id),
      seller_id UUID,
      conversation_id UUID,
      seller_net_price NUMERIC,
      list_price NUMERIC,
      desired_price NUMERIC,
      base_commission_pct NUMERIC,
      surplus_split_pct NUMERIC,
      exclusivity_days INTEGER NOT NULL DEFAULT 90,
      exclusivity_start_at TIMESTAMPTZ,
      exclusivity_end_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'sent',
      terms_version TEXT NOT NULL DEFAULT '2026-07-v2',
      signed_typed_name TEXT,
      notes TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signed_at TIMESTAMPTZ,
      declined_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    GRANT ALL ON public.property_mandates TO anon, authenticated, service_role;
    CREATE TABLE public.visit_requests(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID NOT NULL REFERENCES public.properties(id),
      buyer_id UUID NOT NULL REFERENCES public.users(id)
    );
    INSERT INTO public.users VALUES ('${USER}');
    INSERT INTO public.properties VALUES ('${PROPERTY}');
    INSERT INTO public.property_mandates(id, property_id, desired_price, status)
      VALUES ('${V2_MANDATE}', '${PROPERTY}', 30000000, 'cancelled');
  `);
  return db;
}

async function withMigrated(fn) {
  const db = await before075();
  try {
    await db.exec(migration);
    await db.exec(`
      INSERT INTO public.property_mandates(
        id, property_id, seller_net_price, status, economics_version,
        listing_markup_pct, target_markup_pct, team_floor_markup_pct,
        hard_floor_markup_pct, notary_fee_pct, buyer_referral_pct,
        seller_referral_pct, bypass_fee_pct, bypass_months
      ) VALUES (
        '${V3_MANDATE}', '${PROPERTY}', 35000000, 'signed', 'v3',
        0.30, 0.20, 0.15, 0.10, 0.02, 0.02, 0.01, 0.10, 12
      );
    `);
    await fn(db);
  } finally {
    await db.close();
  }
}

function closingInsert(overrides = {}) {
  const s = settle(overrides.final_price ?? 42_000_000, 35_000_000, DEFAULT_SALE_ECONOMICS, {
    buyerReferred: overrides.buyer_referred ?? false,
    sellerReferred: overrides.seller_referred ?? false,
  });
  const row = {
    property_id: PROPERTY,
    mandate_id: V3_MANDATE,
    final_price: s.finalPrice,
    seller_net_price: 35_000_000,
    team_floor_markup_pct: 0.15,
    hard_floor_markup_pct: 0.1,
    notary_fee_pct: 0.02,
    buyer_referral_pct: 0.02,
    seller_referral_pct: 0.01,
    bypass_fee_pct: 0.1,
    buyer_referred: false,
    seller_referred: false,
    notary_fee: s.notaryFee,
    buyer_referral_fee: s.buyerReferralFee,
    seller_referral_fee: s.sellerReferralFee,
    roogo_margin: s.roogoMargin,
    below_team_floor: s.belowTeamFloor,
    status: "draft",
    ...overrides,
  };
  const cols = Object.keys(row);
  return {
    sql: `INSERT INTO public.sale_closings(${cols.join(", ")})
      VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
    params: cols.map((c) => row[c]),
  };
}

describe("075 sale guaranteed price migration", () => {
  it("is one transaction and runs twice without error", async () => {
    assert.equal((migration.match(/^BEGIN;$/gm) ?? []).length, 1);
    assert.equal((migration.match(/^COMMIT;$/gm) ?? []).length, 1);
    const db = await before075();
    try {
      await db.exec(migration);
      await db.exec(migration);
      const config = await db.query(
        "SELECT listing_markup_pct::float8 AS l, hard_floor_markup_pct::float8 AS h FROM sale_economics_config",
      );
      assert.deepEqual(config.rows, [{ l: 0.3, h: 0.1 }]);
      const listing = await db.query(
        "SELECT sale_bypass_fee_pct::float8 AS pct, sale_bypass_months AS months FROM listing_config",
      );
      assert.deepEqual(listing.rows, [{ pct: 0.1, months: 12 }]);
      const old = await db.query(
        `SELECT economics_version FROM property_mandates WHERE id = '${V2_MANDATE}'`,
      );
      assert.equal(old.rows[0].economics_version, "v2");
    } finally {
      await db.close();
    }
  });

  it("keeps the ladder private and closings service-role only", async () => {
    await withMigrated(async (db) => {
      for (const table of ["sale_economics_config", "sale_closings"]) {
        for (const role of ["anon", "authenticated"]) {
          const { rows } = await db.query(
            "SELECT has_table_privilege($1, $2, 'SELECT') AS allowed",
            [role, `public.${table}`],
          );
          assert.equal(rows[0].allowed, false, `${role} on ${table}`);
        }
        const { rows } = await db.query(
          "SELECT has_table_privilege('service_role', $1, 'INSERT') AS allowed",
          [`public.${table}`],
        );
        assert.equal(rows[0].allowed, true);
      }
    });
  });

  it("hides the v3 ladder snapshot from sellers reading their own mandate", async () => {
    await withMigrated(async (db) => {
      const can = async (column) =>
        (
          await db.query(
            "SELECT has_column_privilege('authenticated', 'public.property_mandates', $1, 'SELECT') AS allowed",
            [column],
          )
        ).rows[0].allowed;
      for (const column of ["seller_net_price", "bypass_fee_pct", "bypass_months", "status"]) {
        assert.equal(await can(column), true, column);
      }
      for (const column of [
        "listing_markup_pct",
        "target_markup_pct",
        "team_floor_markup_pct",
        "hard_floor_markup_pct",
        "notary_fee_pct",
        "buyer_referral_pct",
        "seller_referral_pct",
        "notes",
      ]) {
        assert.equal(await can(column), false, column);
      }
      const anon = await db.query(
        "SELECT has_table_privilege('anon', 'public.property_mandates', 'SELECT') AS allowed",
      );
      assert.equal(anon.rows[0].allowed, false);
    });
  });

  it("rejects a v3 mandate without its snapshot or net price", async () => {
    await withMigrated(async (db) => {
      await assert.rejects(
        db.exec(`INSERT INTO property_mandates(id, property_id, status, economics_version)
          VALUES (gen_random_uuid(), '${PROPERTY}', 'draft', 'v3')`),
        { code: "23514" },
      );
    });
  });

  it("rejects an out-of-order ladder and fees that do not fit the hard floor", async () => {
    await withMigrated(async (db) => {
      await assert.rejects(
        db.exec("UPDATE sale_economics_config SET hard_floor_markup_pct = 0.2"),
        { code: "23514" },
      );
      await assert.rejects(
        db.exec("UPDATE sale_economics_config SET notary_fee_pct = 0.08"),
        { code: "23514" },
      );
    });
  });

  it("accepts the computed closing and enforces floor, margin and approval", async () => {
    await withMigrated(async (db) => {
      // Below the hard floor (+10%) is refused.
      const below = closingInsert({ final_price: 38_499_999 });
      await assert.rejects(db.query(below.sql, below.params), { code: "23514" });

      // A margin that does not add up is refused.
      const wrong = closingInsert();
      wrong.params[wrong.params.length - 3] = 1; // roogo_margin
      await assert.rejects(db.query(wrong.sql, wrong.params), { code: "23514" });

      // Between the floors, approval without a founder is refused.
      const unapproved = closingInsert({ final_price: 38_500_000, status: "approved" });
      await assert.rejects(
        db.query(unapproved.sql, unapproved.params),
        { code: "23514" },
      );

      // Exactly +10% as a draft is accepted, then founder-approved.
      const atFloor = closingInsert({
        final_price: 38_500_000,
        buyer_referred: true,
        seller_referred: true,
      });
      await db.query(atFloor.sql, atFloor.params);
      await db.exec(`UPDATE sale_closings SET status = 'approved',
        approved_by = '${USER}', approved_at = NOW()`);
      const { rows } = await db.query(
        "SELECT roogo_margin::float8 AS margin, below_team_floor FROM sale_closings",
      );
      assert.deepEqual(rows, [{ margin: 1_575_000, below_team_floor: true }]);

      // Only one live closing per property.
      const second = closingInsert();
      await assert.rejects(db.query(second.sql, second.params), { code: "23505" });
    });
  });

  it("records a bypass sale below the floor with the bypass fee as margin", async () => {
    await withMigrated(async (db) => {
      const bypass = closingInsert({
        final_price: 36_000_000,
        is_bypass: true,
        notary_fee: 0,
        buyer_referral_fee: 0,
        seller_referral_fee: 0,
        bypass_fee: 3_600_000,
        roogo_margin: 3_600_000,
        below_team_floor: false,
        status: "approved",
      });
      await db.query(bypass.sql, bypass.params);
      const { rows } = await db.query(
        "SELECT roogo_margin::float8 AS margin FROM sale_closings WHERE is_bypass",
      );
      assert.equal(rows[0].margin, 3_600_000);
    });
  });
});
