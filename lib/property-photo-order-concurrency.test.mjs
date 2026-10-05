import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {test} from 'node:test';
const container=process.env.ROOGO_PHOTO_ORDER_TEST_CONTAINER;
const args=['exec','-i',container || '', 'psql','-U','postgres','-v','ON_ERROR_STOP=1','-qAt'];
function sql(query) { const r=spawnSync('docker',args,{input:query,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim(); }
function concurrent(query) { return new Promise((resolve,reject)=>{ const child=spawn('docker',args);let out='',err='';child.stdout.on('data',s=>{out+=s;});child.stderr.on('data',s=>{err+=s;});child.on('error',reject);child.on('close',code=>code?reject(new Error(err)):resolve(out.trim()));child.stdin.end(query); }); }
test('concurrent photo orders cannot overwrite a stale gallery and deletes coordinate with reorder', {skip:!container},async()=>{
  const id='00000000-0000-0000-0000-000000000001';
  sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE TABLE properties(id uuid PRIMARY KEY);
    CREATE TABLE property_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid REFERENCES properties ON DELETE CASCADE,url text,is_primary boolean);
    CREATE VIEW property_details AS SELECT id,ARRAY[]::text[] AS images,NULL::text AS primary_image FROM properties;
    CREATE VIEW public_property_details AS SELECT * FROM property_details;
    INSERT INTO properties VALUES ('${id}');
    INSERT INTO property_images(property_id,url,is_primary) VALUES ('${id}','a',true),('${id}','b',false),('${id}','c',false);`);
  sql(readFileSync(new URL('../supabase/migrations/076_property_photo_order_executed.sql',import.meta.url),'utf8'));
  const call=urls=>`SELECT reorder_property_images('${id}',ARRAY[${urls.map(u=>`'${u}'`).join(',')}],ARRAY['a','b','c']);`;
  const results=await Promise.allSettled([concurrent(call(['c','a','b'])),concurrent(call(['b','a','c']))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/Gallery changed/);
  assert.equal(sql(`SELECT count(*) FROM property_images WHERE property_id='${id}' AND is_primary;`),'1');
  const order=sql(`SELECT array_to_string(images,',') FROM public_property_details WHERE id='${id}';`).split(',');
  const expected=`ARRAY[${order.map(u=>`'${u}'`).join(',')}]`;
  const race=await Promise.allSettled([
    concurrent(`SELECT delete_property_image('${id}','a');`),
    concurrent(`SELECT reorder_property_images('${id}',ARRAY['a','b','c'],${expected});`),
  ]);
  assert.ok(race.some(r=>r.status==='fulfilled'));
  assert.ok(race.every(r=>r.status==='fulfilled'||!/deadlock/.test(r.reason.message)));
  assert.equal(sql(`SELECT count(*) FROM property_images WHERE property_id='${id}' AND is_primary;`),'1');
  assert.equal(sql(`SELECT count(*) FROM property_images WHERE property_id='${id}';`),'2');
});
