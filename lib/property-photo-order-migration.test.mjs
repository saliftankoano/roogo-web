import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const p='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const migration=readFileSync(new URL('../supabase/migrations/076_property_photo_order_executed.sql',import.meta.url),'utf8');
async function fixture() {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE properties(id uuid PRIMARY KEY, agent_name text);
    CREATE TABLE property_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES properties ON DELETE CASCADE, url text, is_primary boolean, UNIQUE(property_id,url));
    CREATE VIEW property_details WITH (security_invoker=true,security_barrier=true) AS SELECT p.id,p.agent_name,array_agg(i.url ORDER BY i.url) AS images,NULL::text AS primary_image FROM properties p LEFT JOIN property_images i ON i.property_id=p.id GROUP BY p.id;
    CREATE VIEW public_property_details WITH (security_barrier=true) AS SELECT id,NULL::text AS agent_name,images,primary_image FROM property_details;
    GRANT SELECT ON public_property_details TO anon;
    INSERT INTO properties VALUES ('${p}','private'),('${other}','other');
    INSERT INTO property_images(property_id,url,is_primary) VALUES ('${p}','a',false),('${p}','b',true),('${p}','c',false),('${other}','foreign',true);`);
  await db.exec(migration);
  return db;
}
async function gallery(db) { return (await db.query(`SELECT images,primary_image FROM public_property_details WHERE id=$1`,[p])).rows[0]; }
async function reorder(db,urls,expected) { return db.query('SELECT reorder_property_images($1,$2,$3) AS photos',[p,urls,expected]); }
test('saved order, automatic cover, legacy selection, appends, deletions and public read views agree', async () => {
  const db=await fixture();
  try {
    assert.deepEqual(await gallery(db),{images:['b','a','c'],primary_image:'b'});
    await reorder(db,['c','b','a'],['b','a','c']);
    assert.deepEqual(await gallery(db),{images:['c','b','a'],primary_image:'c'});
    assert.deepEqual((await db.query('SELECT sort_order,is_primary FROM property_images WHERE property_id=$1 ORDER BY sort_order',[p])).rows,
      [{sort_order:0,is_primary:true},{sort_order:1,is_primary:false},{sort_order:2,is_primary:false}]);
    await db.query(`INSERT INTO property_images(property_id,url,is_primary) VALUES ($1,'new',true)`,[p]);
    assert.deepEqual(await gallery(db),{images:['c','b','a','new'],primary_image:'c'});
    await db.query('SELECT set_property_primary_image($1,$2)',[p,'a']);
    assert.deepEqual(await gallery(db),{images:['a','c','b','new'],primary_image:'a'});
    await db.query('SELECT delete_property_image($1,$2)',[p,'a']);
    assert.deepEqual(await gallery(db),{images:['c','b','new'],primary_image:'c'});
    assert.equal((await db.query(`SELECT agent_name FROM public_property_details WHERE id=$1`,[p])).rows[0].agent_name,null);
    assert.equal((await db.query(`SELECT has_table_privilege('anon','public_property_details','SELECT') AS allowed`)).rows[0].allowed,true);
    const options=(await db.query(`SELECT reloptions FROM pg_class WHERE oid='property_details'::regclass`)).rows[0].reloptions;
    assert.ok(options.includes('security_invoker=true')); assert.ok(options.includes('security_barrier=true'));
    for(const role of ['anon','authenticated']) assert.equal((await db.query(`SELECT has_function_privilege('${role}','reorder_property_images(uuid,text[],text[])','EXECUTE') AS allowed`)).rows[0].allowed,false);
    assert.deepEqual((await db.query('SELECT images,primary_image FROM public_property_details WHERE id=$1',[other])).rows[0],{images:['foreign'],primary_image:'foreign'});
  } finally { await db.close(); }
});
test('stale, incomplete, duplicate and foreign orders fail intact; retries are idempotent and writes roll back', async () => {
  const db=await fixture();
  try {
    await reorder(db,['c','b','a'],['b','a','c']);
    await reorder(db,['c','b','a'],['b','a','c']);
    await assert.rejects(reorder(db,['a','b','c'],['b','a','c']),error=>error.code==='40001');
    for(const urls of [[],['a','b'],['a','a','c'],['a','b','foreign'],['a','b',null]])
      await assert.rejects(reorder(db,urls,['c','b','a']),error=>error.code==='22023');
    assert.deepEqual(await gallery(db),{images:['c','b','a'],primary_image:'c'});
    await db.exec(`CREATE FUNCTION fail_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.url='a' AND NEW.sort_order=0 THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_order BEFORE UPDATE ON property_images FOR EACH ROW EXECUTE FUNCTION fail_order();`);
    await assert.rejects(reorder(db,['a','c','b'],['c','b','a']),/injected failure/);
    assert.deepEqual(await gallery(db),{images:['c','b','a'],primary_image:'c'});
    await db.query('DELETE FROM properties WHERE id=$1',[p]);
    assert.equal((await db.query('SELECT count(*) FROM property_images WHERE property_id=$1',[p])).rows[0].count,0);
  } finally { await db.close(); }
});

test('four-photo upload batches append distinct positions and one cover before immediate reorder', async () => {
  const db=await fixture();
  const empty='00000000-0000-0000-0000-000000000003';
  try {
    await db.query('INSERT INTO properties(id) VALUES ($1)',[empty]);
    // Match the upload route: one INSERT with four records and no sort_order.
    // Reverse UUID order to prove that the view uses assigned positions.
    await db.query(`INSERT INTO property_images(id,property_id,url,is_primary) VALUES
      ('00000000-0000-0000-0000-000000000014',$1,'first',true),
      ('00000000-0000-0000-0000-000000000013',$1,'second',false),
      ('00000000-0000-0000-0000-000000000012',$1,'third',false),
      ('00000000-0000-0000-0000-000000000011',$1,'fourth',false)`,[empty]);
    const read=async()=>(await db.query('SELECT images,primary_image FROM public_property_details WHERE id=$1',[empty])).rows[0];
    const initial=['first','second','third','fourth'];
    assert.deepEqual(await read(),{images:initial,primary_image:'first'});
    assert.deepEqual((await db.query('SELECT sort_order,is_primary FROM property_images WHERE property_id=$1 ORDER BY sort_order',[empty])).rows,
      [{sort_order:0,is_primary:true},{sort_order:1,is_primary:false},{sort_order:2,is_primary:false},{sort_order:3,is_primary:false}]);
    await db.query(`INSERT INTO property_images(property_id,url,is_primary) VALUES
      ($1,'fifth',true),($1,'sixth',true),($1,'seventh',true),($1,'eighth',true)`,[empty]);
    const appended=[...initial,'fifth','sixth','seventh','eighth'];
    assert.deepEqual(await read(),{images:appended,primary_image:'first'});
    assert.deepEqual(await read(),{images:appended,primary_image:'first'});
    assert.equal((await db.query('SELECT count(DISTINCT sort_order) AS positions,count(*) FILTER (WHERE is_primary) AS covers FROM property_images WHERE property_id=$1',[empty])).rows[0].positions,8);
    assert.equal((await db.query('SELECT count(*) AS covers FROM property_images WHERE property_id=$1 AND is_primary',[empty])).rows[0].covers,1);
    const wanted=['fourth',...appended.filter(url=>url!=='fourth')];
    await db.query('SELECT reorder_property_images($1,$2,$3)',[empty,wanted,appended]);
    assert.deepEqual(await read(),{images:wanted,primary_image:'fourth'});
  } finally { await db.close(); }
});
