import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const phaseOne = read("../supabase/migrations/094_users_table_exposure_executed.sql");
const phaseTwo = read("../supabase/migrations/095_users_table_read_lock.sql");
const packageJson = JSON.parse(read("../package.json"));

// Strip SQL comments so the checks look at statements, not the explanations.
const statements = (sql) => sql.replace(/--.*$/gm, "");

describe("094 users table exposure (statements)", () => {
  const sql = statements(phaseOne);

  it("revokes every client write on users, table and column level", () => {
    assert.match(
      sql,
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.users FROM PUBLIC, anon, authenticated/,
    );
    assert.match(sql, /REVOKE INSERT \(%1\$s\), UPDATE \(%1\$s\), REFERENCES \(%1\$s\) ON public\.users/);
  });

  it("keeps users reads open in phase 1 so old apps keep working", () => {
    assert.doesNotMatch(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /REVOKE (ALL|SELECT)[^;]*ON public\.users/);
  });

  it("closes staff_users to client roles", () => {
    assert.match(sql, /REVOKE ALL ON public\.staff_users FROM PUBLIC, anon, authenticated/);
  });

  it("blanks renter fields and runs the listing view with its owner's rights", () => {
    for (const column of ["renter_name", "renter_phone", "renter_email", "renter_avatar"]) {
      assert.ok(sql.includes(`'${column}'`), `${column} is projected as NULL`);
    }
    assert.match(sql, /ALTER VIEW public\.public_property_details SET \(security_invoker = false\)/);
    assert.match(sql, /GRANT SELECT ON public\.public_property_details TO anon, authenticated, service_role/);
    assert.match(sql, /LIKE '%\[094\]%'/, "a second run must not wrap the view again");
  });
});

describe("095 users table read lock (statements)", () => {
  const sql = statements(phaseTwo);

  it("refuses to run before 094 or when the view could not see owners", () => {
    assert.match(sql, /RAISE EXCEPTION '095: run 094_users_table_exposure\.sql first'/);
    assert.match(sql, /rolbypassrls/);
  });

  it("enables RLS and drops every existing users policy", () => {
    assert.match(sql, /ALTER TABLE public\.users ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /WHERE schemaname = 'public' AND tablename = 'users'[\s\S]*DROP POLICY %I ON public\.users/);
  });

  it("gives signed-in users their own row only, and anon no rows", () => {
    assert.match(sql, /REVOKE ALL ON public\.users FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /CREATE POLICY users_select_own\s+ON public\.users\s+FOR SELECT\s+TO authenticated\s+USING \(clerk_id = \(SELECT auth\.jwt\(\) ->> 'sub'\)\)/);
    const policies = sql.match(/CREATE POLICY/g) ?? [];
    assert.equal(policies.length, 1, "no other policy, in particular none for anon");
    assert.doesNotMatch(sql, /GRANT (SELECT|ALL)[^;(]*ON public\.users TO anon/);
    const anonColumns = sql.match(/GRANT SELECT \(([^)]*)\) ON public\.users TO anon/);
    assert.ok(anonColumns, "anon keeps the card columns for old embeds");
    for (const privateColumn of ["clerk_id", "whatsapp", "signup_ip", "location", "staff_level"]) {
      assert.doesNotMatch(anonColumns[1], new RegExp(`\\b${privateColumn}\\b`));
    }
  });

  it("is in the npm test list", () => {
    assert.match(packageJson.scripts.test, /lib\/users-table-exposure\.test\.mjs/);
  });
});

// Behaviour on a real Postgres (PGlite). Skipped where PGlite is not installed.
let PGlite = null;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  PGlite = null;
}

const SETUP = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

  CREATE TABLE public.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id text UNIQUE, email text, full_name text, avatar_url text,
    phone text, whatsapp text, location text, user_type text, company_name text,
    professional_link text, identity_verification_status text,
    signup_ip text, staff_level text
  );
  CREATE TABLE public.properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid REFERENCES public.users(id), listing_type text, status text
  );
  CREATE TABLE public.property_locks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id),
    renter_id uuid REFERENCES public.users(id), status text, locked_at timestamptz
  );
  CREATE VIEW public.public_property_details WITH (security_invoker = true) AS
    SELECT p.id, p.status, p.listing_type,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.full_name END AS agent_name,
      CASE WHEN p.listing_type = 'vendre' THEN NULL ELSE u.phone END AS agent_phone,
      r.full_name AS renter_name, r.phone AS renter_phone,
      r.email AS renter_email, r.avatar_url AS renter_avatar,
      pl.status AS lock_status
    FROM public.properties p
    LEFT JOIN public.users u ON u.id = p.agent_id
    LEFT JOIN public.property_locks pl ON pl.property_id = p.id AND pl.status = 'active'
    LEFT JOIN public.users r ON r.id = pl.renter_id;
  CREATE VIEW public.staff_users WITH (security_invoker = true) AS
    SELECT id, clerk_id, email, phone FROM public.users
    WHERE user_type IN ('staff', 'founder');
  -- Supabase default: client roles hold every table privilege.
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

  INSERT INTO public.users (clerk_id, email, full_name, phone, whatsapp, user_type, signup_ip) VALUES
    ('user_owner', 'owner@example.test', 'Owner', '+22670000001', '+22670000001', 'owner', '10.0.0.1'),
    ('user_renter', 'renter@example.test', 'Renter', '+22670000002', NULL, 'renter', '10.0.0.2'),
    ('user_staff', 'staff@example.test', 'Staff', '+22670000003', NULL, 'staff', '10.0.0.3');
  INSERT INTO public.properties (agent_id, listing_type, status)
    SELECT id, 'louer', 'en_ligne' FROM public.users WHERE clerk_id = 'user_owner';
  INSERT INTO public.property_locks (property_id, renter_id, status, locked_at)
    SELECT p.id, r.id, 'active', now() FROM public.properties p, public.users r
    WHERE r.clerk_id = 'user_renter';
`;

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(SETUP);
  return db;
}

async function as(db, role, sub, query) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '${
    sub ? JSON.stringify({ sub }) : ""
  }', false); SET ROLE ${role};`);
  try {
    return await db.query(query);
  } finally {
    await db.exec("RESET ROLE;");
  }
}

describe("094 and 095 on Postgres", { skip: PGlite ? false : "PGlite not installed" }, () => {
  it("phase 1 blocks writes and renter fields, and keeps reads for old apps", async () => {
    const db = await freshDatabase();
    // Before: anyone with the anon key can rewrite a user.
    await as(db, "anon", null, "UPDATE public.users SET user_type = 'founder' WHERE false");

    await db.exec(phaseOne);
    await db.exec(phaseOne); // idempotent

    await assert.rejects(
      as(db, "anon", null, "UPDATE public.users SET user_type = 'founder' WHERE false"),
      /permission denied/,
    );
    await assert.rejects(
      as(db, "authenticated", "user_renter", "UPDATE public.users SET user_type = 'founder' WHERE clerk_id = 'user_renter'"),
      /permission denied/,
    );
    await assert.rejects(
      as(db, "anon", null, "INSERT INTO public.users (clerk_id) VALUES ('x')"),
      /permission denied/,
    );
    await assert.rejects(as(db, "anon", null, "SELECT * FROM public.staff_users"), /permission denied/);

    const card = await as(db, "anon", null, "SELECT * FROM public.public_property_details");
    assert.equal(card.rows.length, 1);
    assert.equal(card.rows[0].agent_name, "Owner");
    assert.equal(card.rows[0].agent_phone, "+22670000001");
    assert.equal(card.rows[0].renter_name, null);
    assert.equal(card.rows[0].renter_phone, null);
    assert.equal(card.rows[0].renter_email, null);
    assert.equal(card.rows[0].lock_status, "active");

    // Old apps' select * on their own row still works until phase 2.
    const own = await as(db, "anon", null, "SELECT * FROM public.users WHERE clerk_id = 'user_owner'");
    assert.equal(own.rows.length, 1);

    const service = await as(db, "service_role", null, "SELECT count(*)::int AS n FROM public.staff_users");
    assert.equal(service.rows[0].n, 1);
  });

  it("phase 2 refuses to run without phase 1", async () => {
    const db = await freshDatabase();
    await assert.rejects(db.exec(phaseTwo), /run 094_users_table_exposure\.sql first/);
  });

  it("phase 2 hides every row from anon and leaves signed-in users their own row", async () => {
    const db = await freshDatabase();
    // A permissive dashboard-style policy that must not survive.
    await db.exec(`
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "Enable read access for all users" ON public.users FOR SELECT USING (true);
    `);
    await db.exec(phaseOne);
    await db.exec(phaseTwo);
    await db.exec(phaseTwo); // idempotent

    const anonCount = await as(db, "anon", null, "SELECT count(*)::int AS n FROM public.users");
    assert.equal(anonCount.rows[0].n, 0);
    const anonCard = await as(db, "anon", null, "SELECT id, full_name, phone, email FROM public.users");
    assert.equal(anonCard.rows.length, 0);
    await assert.rejects(as(db, "anon", null, "SELECT * FROM public.users"), /permission denied/);
    await assert.rejects(
      as(db, "anon", null, "SELECT id FROM public.users WHERE clerk_id = 'user_owner'"),
      /permission denied/,
    );

    const mine = await as(db, "authenticated", "user_owner", "SELECT * FROM public.users");
    assert.equal(mine.rows.length, 1);
    assert.equal(mine.rows[0].clerk_id, "user_owner");
    assert.equal(mine.rows[0].whatsapp, "+22670000001");
    await assert.rejects(
      as(db, "authenticated", "user_owner", "UPDATE public.users SET user_type = 'founder'"),
      /permission denied/,
    );

    const card = await as(db, "anon", null, "SELECT agent_name, agent_phone, renter_phone FROM public.public_property_details");
    assert.equal(card.rows[0].agent_name, "Owner");
    assert.equal(card.rows[0].agent_phone, "+22670000001");
    assert.equal(card.rows[0].renter_phone, null);

    const policies = await db.query(
      "SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'",
    );
    assert.deepEqual(policies.rows.map((row) => row.policyname), ["users_select_own"]);

    const service = await as(db, "service_role", null, "SELECT count(*)::int AS n FROM public.users");
    assert.equal(service.rows[0].n, 3);
  });
});
