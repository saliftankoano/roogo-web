import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Only an explicitly named disposable container; never use a remote database.
const container = process.env.ROOGO_PRIMARY_IMAGE_TEST_CONTAINER;
const args = ['exec', '-i', container || '', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'];
function sql(query) {
  const result = spawnSync('docker', args, { input: query, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function concurrentSql(query) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args); let out = '', err = '';
    child.stdout.on('data', s => { out += s; }); child.stderr.on('data', s => { err += s; });
    child.on('error', reject); child.on('close', code => code ? reject(new Error(err)) : resolve(out.trim()));
    child.stdin.end(query);
  });
}
async function exercise(sql, runConcurrency) {
  const p = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE properties(id uuid PRIMARY KEY, agent_name text);
    CREATE TABLE property_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES properties, url text, is_primary boolean);
    CREATE VIEW property_details WITH (security_barrier=true) AS SELECT id, agent_name FROM properties;
    CREATE VIEW public_property_details AS SELECT id, NULL::text AS agent_name FROM properties;
    GRANT SELECT ON public_property_details TO anon;
    INSERT INTO properties VALUES ('${p}', 'private seller'), ('${other}', 'other seller');
    INSERT INTO property_images(property_id,url,is_primary) VALUES ('${p}','first',true), ('${p}','second',false), ('${p}','second',false), ('${other}','other',true);`);
  const migration = readFileSync(new URL('../supabase/migrations/075_property_primary_image_executed.sql', import.meta.url), 'utf8');
  await sql(migration); await sql(migration); // repeat-safe
  const call = url => `SELECT set_property_primary_image('${p}','${url}');`;
  assert.equal(await sql(call('second')), 'second');
  assert.equal(await sql(`SELECT primary_image FROM public_property_details WHERE id='${p}';`), 'second');
  assert.equal(await sql(`SELECT count(*) FROM property_images WHERE property_id='${p}' AND is_primary;`), '1');
  assert.equal(await sql(`SELECT agent_name IS NULL FROM public_property_details WHERE id='${p}';`), 't');
  assert.equal(await sql(`SELECT agent_name FROM property_details WHERE id='${p}';`), 'private seller');
  assert.equal(await sql(`SELECT has_table_privilege('anon','public_property_details','SELECT');`), 't');
  assert.equal(await sql(`SELECT reloptions::text FROM pg_class WHERE oid='property_details'::regclass;`), '{security_barrier=true}');
  for (const url of ['missing', 'other']) {
    await assert.rejects(() => sql(call(url)), /Image not found/);
    assert.equal(await sql(`SELECT primary_image FROM property_details WHERE id='${p}';`), 'second');
  }
  await sql(`CREATE FUNCTION fail_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.url='first' AND NEW.is_primary THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_update BEFORE UPDATE ON property_images FOR EACH ROW EXECUTE FUNCTION fail_update();`);
  await assert.rejects(() => sql(call('first')), /injected failure/);
  assert.equal(await sql(`SELECT primary_image FROM property_details WHERE id='${p}';`), 'second');
  await sql('DROP TRIGGER fail_update ON property_images;');
  if (runConcurrency) await Promise.all([concurrentSql(call('first')), concurrentSql(call('second'))]);
  assert.equal(await sql(`SELECT count(*) FROM property_images WHERE property_id='${p}' AND is_primary;`), '1');
  assert.equal(await sql(`SELECT primary_image FROM property_details WHERE id='${other}';`), 'other');
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await sql(`SELECT has_function_privilege('${role}','set_property_primary_image(uuid,text)','EXECUTE');`), 'f');
  }
  assert.equal(await sql(`SELECT has_function_privilege('service_role','set_property_primary_image(uuid,text)','EXECUTE');`), 't');
}

test('primary photo persists, rolls back and preserves public redaction', async () => {
  const db = new PGlite();
  try {
    await exercise(async query => {
      const results = await db.exec(query);
      const rows = results.at(-1)?.rows || [];
      return rows.map(row => Object.values(row).map(value => typeof value === 'boolean' ? (value ? 't' : 'f') : String(value ?? '')).join('|')).join('\n');
    }, false);
  } finally { await db.close(); }
});

test('principal photo concurrent selections serialize in disposable Postgres', {skip: !container}, async () => {
  await exercise(async query => sql(query), true);
});
