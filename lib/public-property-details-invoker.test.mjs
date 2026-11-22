import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Migration 110: public_property_details runs with the reader's rights.
// The view is rebuilt here from the real migrations (058, 075, 076, 088, 094),
// so 110 rewrites the same definition shape it meets in production.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/110_public_property_details_invoker_executed.sql");
const usersReadLock = read("../supabase/migrations/095_users_table_read_lock.sql");
const packageJson = JSON.parse(read("../package.json"));
const statements = (sql) => sql.replace(/--.*$/gm, "");

const viewBlocks = (file) =>
  [...read(`../supabase/migrations/${file}`).matchAll(/DO \$\$[\s\S]*?\n\$\$;/g)]
    .map((match) => match[0])
    .filter((block) => block.includes("public_property_details"));

describe("110 listing view with the reader's rights (statements)", () => {
  const sql = statements(migration);

  it("switches the view to security_invoker = true and keeps its grants", () => {
    assert.match(sql, /ALTER VIEW public\.public_property_details SET \(security_invoker = true\)/);
    assert.match(sql, /GRANT SELECT ON public\.public_property_details TO anon, authenticated, service_role/);
  });

  it("drops no existing policy, only its own names", () => {
    for (const match of sql.matchAll(/DROP POLICY IF EXISTS (\w+)/g)) {
      assert.match(match[1], /_public_read$/);
    }
  });

  it("keeps renter ids away from anon", () => {
    assert.match(sql, /REVOKE SELECT ON public\.property_locks FROM anon/);
    assert.match(sql, /GRANT SELECT \(id, property_id, status, locked_at\) ON public\.property_locks TO anon/);
  });

  it("is in the npm test list", () => {
    assert.match(packageJson.scripts.test, /lib\/public-property-details-invoker\.test\.mjs/);
  });
});

let PGlite = null;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  PGlite = null;
}

const SCHEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clerk_id text UNIQUE,
    email text, full_name varchar(200), avatar_url text, phone text, whatsapp text,
    user_type text, company_name text, professional_link text,
    identity_verification_status text, signup_ip text, staff_level text
  );
  CREATE TABLE public.properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid REFERENCES public.users(id), owner_id uuid, title text,
    listing_type text, status text, is_test boolean DEFAULT false,
    ownership_verification_status text, slug text
  );
  CREATE TABLE public.property_locks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES public.properties(id),
    renter_id uuid REFERENCES public.users(id), status text, locked_at timestamptz, amount numeric
  );
  CREATE TABLE public.amenities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
  CREATE TABLE public.property_amenities (property_id uuid, amenity_id uuid);
  CREATE TABLE public.property_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid,
    url text, is_primary boolean DEFAULT false, sort_order int DEFAULT 0
  );
  CREATE TABLE public.favorites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid, user_id uuid
  );
  CREATE VIEW public.property_details AS SELECT p.*, NULL::text[] AS images FROM public.properties p;
  ALTER TABLE public.amenities ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.property_amenities ENABLE ROW LEVEL SECURITY;
  CREATE POLICY public_read_amenities ON public.amenities FOR SELECT TO anon, authenticated USING (true);
  CREATE POLICY public_read_property_amenities ON public.property_amenities FOR SELECT TO anon, authenticated USING (true);
  ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
`;

const DATA = `
  INSERT INTO public.users (clerk_id, email, full_name, phone, user_type) VALUES
    ('owner', 'owner@example.test', 'Owner', '+22670000001', 'owner'),
    ('seller', 'seller@example.test', 'Seller', '+22670000002', 'owner'),
    ('renter', 'renter@example.test', 'Renter', '+22670000003', 'renter'),
    ('drafter', 'drafter@example.test', 'Drafter', '+22670000004', 'owner');
  INSERT INTO public.properties (agent_id, title, listing_type, status) VALUES
    ((SELECT id FROM public.users WHERE clerk_id = 'owner'), 'live', 'louer', 'en_ligne'),
    ((SELECT id FROM public.users WHERE clerk_id = 'owner'), 'reserved', 'louer', 'locked'),
    ((SELECT id FROM public.users WHERE clerk_id = 'seller'), 'sale', 'vendre', 'en_ligne'),
    ((SELECT id FROM public.users WHERE clerk_id = 'drafter'), 'draft', 'louer', 'en_attente');
  INSERT INTO public.property_images (property_id, url, sort_order)
    SELECT id, title || '-1.jpg', 1 FROM public.properties;
  INSERT INTO public.property_locks (property_id, renter_id, status, locked_at)
    SELECT p.id, u.id, 'active', now() FROM public.properties p, public.users u
    WHERE p.title = 'reserved' AND u.clerk_id = 'renter';
  INSERT INTO public.favorites (property_id, user_id)
    SELECT p.id, u.id FROM public.properties p, public.users u
    WHERE p.title = 'live' AND u.clerk_id IN ('renter', 'drafter');
  -- Supabase default: client roles hold every table privilege.
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
`;

async function productionShape({ rlsOnListingTables = false } = {}) {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(viewBlocks("058_direct_sale_intakes_executed.sql")[0]);
  await db.exec(viewBlocks("075_property_primary_image_executed.sql")[0]);
  await db.exec(viewBlocks("076_property_photo_order_executed.sql")[0]);
  // 088 added properties.reference after 058 had listed the columns.
  await db.exec("ALTER TABLE public.properties ADD COLUMN reference text;");
  await db.exec(viewBlocks("088_property_references_executed.sql")[0]);
  await db.exec(viewBlocks("094_users_table_exposure_executed.sql")[0]);
  await db.exec("ALTER VIEW public.public_property_details SET (security_invoker = false);");
  await db.exec(DATA);
  if (rlsOnListingTables) {
    // RLS on, with only owner-style policies that anon does not match.
    await db.exec(`
      ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.property_locks ENABLE ROW LEVEL SECURITY;
      CREATE POLICY properties_owner ON public.properties FOR SELECT TO authenticated
        USING (agent_id IN (SELECT id FROM public.users WHERE clerk_id = auth.jwt() ->> 'sub'));
    `);
  }
  return db;
}

async function asAnon(db, sql) {
  await db.exec("BEGIN; SET LOCAL ROLE anon;");
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("ROLLBACK;");
  }
}

const cards = (db) =>
  asAnon(db, `SELECT title, status, agent_name, agent_phone, renter_name, lock_status,
    primary_image, favorites_count FROM public.public_property_details ORDER BY title`);

describe("110 on a real Postgres (PGlite)", { skip: PGlite ? false : "PGlite not installed" }, () => {
  it("keeps every view column, name, order and type", async () => {
    const db = await productionShape();
    const columns = () => db.query(`
      SELECT attname, format_type(atttypid, atttypmod) AS type FROM pg_attribute
      WHERE attrelid = 'public.public_property_details'::regclass AND attnum > 0 ORDER BY attnum`);
    const before = (await columns()).rows;
    await db.exec(migration);
    assert.deepEqual((await columns()).rows, before);
  });

  it("runs with the reader's rights and reads neither users nor favorites", async () => {
    const db = await productionShape();
    await db.exec(migration);
    const view = (await db.query(`
      SELECT reloptions, obj_description(oid, 'pg_class') AS comment
      FROM pg_class WHERE oid = 'public.public_property_details'::regclass`)).rows[0];
    assert.deepEqual(view.reloptions, ["security_invoker=true"]);
    assert.match(view.comment, /\[094\] \[110\]/);
    const reads = (await db.query(`
      SELECT DISTINCT d.refobjid::regclass::text AS name FROM pg_depend d
      JOIN pg_rewrite rw ON rw.oid = d.objid
      WHERE rw.ev_class = 'public.public_property_details'::regclass AND d.classid = 'pg_rewrite'::regclass
        AND d.refobjid IN ('public.users'::regclass, 'public.favorites'::regclass)`)).rows;
    assert.deepEqual(reads, []);
  });

  it("keeps live cards whole for anon, with RLS off on listing tables", async () => {
    const db = await productionShape();
    await db.exec(migration);
    const rows = await cards(db);
    const live = rows.find((row) => row.title === "live");
    assert.equal(live.agent_name, "Owner");
    assert.equal(live.agent_phone, "+22670000001");
    assert.equal(live.primary_image, "live-1.jpg");
    assert.equal(Number(live.favorites_count), 2);
    const sale = rows.find((row) => row.title === "sale");
    assert.equal(sale.agent_name, null, "sale sellers stay hidden");
    assert.ok(rows.every((row) => row.renter_name === null));
  });

  it("keeps live cards whole and hides drafts, with RLS on listing tables", async () => {
    const db = await productionShape({ rlsOnListingTables: true });
    await db.exec(migration);
    const rows = await cards(db);
    assert.deepEqual(rows.map((row) => row.title), ["live", "reserved", "sale"]);
    const live = rows.find((row) => row.title === "live");
    assert.equal(live.agent_name, "Owner");
    assert.equal(live.primary_image, "live-1.jpg");
    assert.equal(rows.find((row) => row.title === "reserved").lock_status, "active");
  });

  it("shows anon only the cards of owners with a live rental", async () => {
    const db = await productionShape({ rlsOnListingTables: true });
    await db.exec(migration);
    const names = (await asAnon(db, "SELECT full_name FROM public.agent_cards ORDER BY 1"))
      .map((row) => row.full_name);
    assert.deepEqual(names, ["Owner"], "no seller, renter or draft-only owner");
  });

  it("never gives anon a renter id", async () => {
    const db = await productionShape();
    await db.exec(migration);
    await assert.rejects(asAnon(db, "SELECT renter_id FROM public.property_locks"), /permission denied/);
    const locks = await asAnon(db, "SELECT status FROM public.property_locks");
    assert.equal(locks.length, 1);
  });

  it("keeps cards in sync when a user changes", async () => {
    const db = await productionShape();
    await db.exec(migration);
    await db.exec("UPDATE public.users SET phone = '+22671111111' WHERE clerk_id = 'owner'");
    await db.exec("INSERT INTO public.users (clerk_id, full_name) VALUES ('new', 'New')");
    const live = (await cards(db)).find((row) => row.title === "live");
    assert.equal(live.agent_phone, "+22671111111");
    const count = (await db.query("SELECT count(*)::int AS n FROM public.agent_cards")).rows[0].n;
    assert.equal(count, 5);
  });

  it("is a no-op the second time", async () => {
    const db = await productionShape();
    await db.exec(migration);
    const definition = async () =>
      (await db.query("SELECT pg_get_viewdef('public.public_property_details'::regclass) AS d")).rows[0].d;
    const first = await definition();
    await db.exec(migration);
    assert.equal(await definition(), first);
  });

  it("stops and changes nothing when anon would lose live photos", async () => {
    const db = await productionShape();
    await db.exec(`
      ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
      CREATE POLICY images_hidden ON public.property_images AS RESTRICTIVE FOR SELECT TO anon USING (false);
    `);
    await assert.rejects(db.exec(migration), /110: anon would lose live cards/);
    await db.exec("ROLLBACK").catch(() => {});
    const options = (await db.query(
      "SELECT reloptions FROM pg_class WHERE oid = 'public.public_property_details'::regclass")).rows[0];
    assert.deepEqual(options.reloptions, ["security_invoker=false"]);
    assert.equal(await db.query("SELECT to_regclass('public.agent_cards') AS t").then((r) => r.rows[0].t), null);
  });

  it("lets 095 close users afterwards without blanking cards", async () => {
    const db = await productionShape();
    await db.exec(migration);
    await db.exec(usersReadLock);
    const live = (await cards(db)).find((row) => row.title === "live");
    assert.equal(live.agent_name, "Owner");
    assert.deepEqual(await asAnon(db, "SELECT id FROM public.users"), []);
  });
});
