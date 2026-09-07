import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.ROOGO_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const agent = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const staff = "00000000-0000-4000-8000-000000000003";
const renter = "00000000-0000-4000-8000-000000000004";
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE users (id uuid PRIMARY KEY, user_type text);
    CREATE TABLE properties (id uuid PRIMARY KEY);
    CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END; $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    INSERT INTO users VALUES ('${agent}', 'agent'), ('${owner}', 'owner'), ('${staff}', 'staff'), ('${renter}', 'renter');`);
  await db.exec(await readFile(new URL("../supabase/migrations/068_property_requests.sql", import.meta.url), "utf8"));
  const { rows: [request] } = await db.query(`INSERT INTO property_requests (title,description,listing_type,property_type,city,budget_max,commission_rate,commission_terms,customer_name,customer_contact,status,created_by)
    VALUES ('Villa familiale','Trois chambres avec cour','vendre','Villa','Ouagadougou',45000000,2.5,'Payable après vente réalisée et fonds encaissés','Private client','Private phone','open',$1) RETURNING id,updated_at::text`, [staff]);
  const input = { property_type: "Villa", city: "Ouagadougou", neighborhood: "Ouaga 2000", address: "Parcelle 12", asking_price: 42000000, area: 300, bedrooms: 3, bathrooms: 2, description: "Villa avec cour et trois chambres", document_types: ["Titre foncier"], contact_phone: "+22670000000", attachments: [], request_updated_at: request.updated_at, terms_accepted: true };
  async function submit(user, changes = {}) {
    const { rows: [row] } = await db.query("SELECT submit_property_request_response($1,$2,$3) AS result", [request.id, user, JSON.stringify({ ...input, ...changes })]);
    return row.result;
  }
  assert.equal((await submit(renter)).error, "forbidden");
  assert.equal((await submit(staff)).error, "forbidden");
  assert.equal((await submit(agent, { terms_accepted: false })).error, "terms_required");
  assert.equal((await submit(agent, { request_updated_at: "2020-01-01T00:00:00Z" })).error, "terms_changed");
  const submitted = await submit(agent, { commission_rate: 90, respondent_role: "owner", status: "accepted" });
  assert.equal(submitted.existing, false);
  const duplicate = await submit(agent, { asking_price: 1 });
  assert.equal(duplicate.id, submitted.id);
  assert.equal(duplicate.existing, true);
  let { rows: [response] } = await db.query("SELECT * FROM property_request_responses WHERE id = $1", [submitted.id]);
  assert.equal(Number(response.commission_rate), 2.5);
  assert.equal(response.respondent_role, "agent");
  assert.equal(response.status, "submitted");
  assert.equal(Number(response.asking_price), 42000000);
  await db.query("UPDATE property_requests SET commission_rate = 5, commission_terms = 'Changed terms' WHERE id = $1", [request.id]);
  assert.equal((await submit(owner)).error, "terms_changed");
  ({ rows: [response] } = await db.query("SELECT * FROM property_request_responses WHERE id = $1", [submitted.id]));
  assert.equal(Number(response.commission_rate), 2.5);
  assert.equal(response.commission_terms, "Payable après vente réalisée et fonds encaissés");
  const { rows: [changed] } = await db.query("SELECT updated_at::text FROM property_requests WHERE id = $1", [request.id]);
  const ownerResponse = await submit(owner, { request_updated_at: changed.updated_at });
  const { rows: [ownerRecord] } = await db.query("SELECT commission_rate FROM property_request_responses WHERE id = $1", [ownerResponse.id]);
  assert.equal(Number(ownerRecord.commission_rate), 0);
  await db.query("UPDATE property_requests SET status = 'closed' WHERE id = $1", [request.id]);
  assert.equal((await submit(agent)).id, submitted.id, "retry works after closure");
  await db.query("DELETE FROM property_request_responses WHERE id = $1", [ownerResponse.id]);
  assert.equal((await submit(owner)).error, "closed");
  await db.query("UPDATE property_requests SET status = 'draft' WHERE id = $1", [request.id]);
  assert.equal((await submit(owner)).error, "closed");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query("SELECT * FROM property_requests"), /permission denied/);
    await assert.rejects(db.query("SELECT * FROM property_request_responses"), /permission denied/);
    await assert.rejects(submit(agent), /permission denied/);
    await db.exec("RESET ROLE");
  }
  const { rows: [bucket] } = await db.query("SELECT * FROM storage.buckets WHERE id = 'property-request-files'");
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 10485760);
  console.log("Property request database checks passed: migration, roles, immutable snapshots, retries, changed terms, closed/draft calls, owner commission, private storage.");
} finally { await db.close(); }
