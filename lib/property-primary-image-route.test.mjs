import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test } from 'node:test';

async function route({ user = {id:'owner'}, owner = 'owner', rpcError = null, property = true } = {}) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      assert.equal(table, 'properties');
      return { select: () => ({ eq: () => ({ single: async () => ({data: property ? {id:'property',agent_id:owner} : null}) }) }) };
    },
    async rpc(name, args) { calls.push(['rpc',name,args]); return {data:args.p_urls || args.p_url,error:rpcError}; },
  };
  const mocks = {
    '@/lib/api-helpers': { cors:r=>r, corsOptions:()=>new Response('{}') },
    'next/server': { NextResponse: {json:(body,{status=200}={})=>new Response(JSON.stringify(body),{status})} },
    '@/lib/user-sync': {getSupabaseClient:()=>client},
    '@/lib/api-auth': {getAuthenticatedUser:async()=>user,isStaffOrFounder:u=>u.staff===true},
  };
  const context = vm.createContext({console:{error(){}},Response});
  const source=readFileSync(new URL('../app/api/properties/[id]/images/route.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const routeModule=new vm.SourceTextModule(compiled,{context});
  await routeModule.link(name=>{ const exports=mocks[name]; assert.ok(exports,name); return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context}); });
  await routeModule.evaluate();
  const request = body => new Request('https://example.test/api/properties/property/images',{method:'PATCH',body:JSON.stringify(body)});
  return {calls, reorder: async (urls,expectedUrls) => routeModule.namespace.PATCH(request({urls,expectedUrls}),{params:Promise.resolve({id:'property'})}), patch: async url => routeModule.namespace.PATCH(new Request('https://example.test/api/properties/property/images',{method:'PATCH',body:JSON.stringify({url})}),{params:Promise.resolve({id:'property'})})};
}
test('PATCH authorizes before atomic mutation and returns saved selection', async () => {
  for (const [config,status] of [[{user:null},401],[{owner:'someone-else'},403],[{property:false},404]]) {
    const r=await route(config); assert.equal((await r.patch('photo')).status,status); assert.ok(!r.calls.some(c=>c[0]==='rpc'));
  }
  for(const url of ['',null,42,{}]) { const r=await route(); assert.equal((await r.patch(url)).status,400); assert.equal(r.calls.length,0); }
  for(const user of [{id:'owner'},{id:'staff',staff:true}]) {
    const r=await route({user}); const response=await r.patch('photo'); assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{success:true,primaryImageUrl:'photo'});
    assert.equal(r.calls.filter(c=>c[0]==='rpc').length,1);
    assert.equal(r.calls.at(-1)[1],'set_property_primary_image');
  }
  for (const [code,status] of [['P0002',404],['XX000',500]]) {
    const r=await route({rpcError:{code}}); assert.equal((await r.patch('photo')).status,status);
  }
});

test('reordering validates and authorizes complete snapshots, returns saved order and exposes stale conflicts', async () => {
  for(const [config,status] of [[{user:null},401],[{owner:'other'},403],[{property:false},404]]) {
    const r=await route(config); assert.equal((await r.reorder(['b','a'],['a','b'])).status,status);
    assert.ok(!r.calls.some(c=>c[0]==='rpc'));
  }
  for(const urls of [[],['a','a'],['a',null],42,new Array(21).fill('a')]) {
    const r=await route(); assert.equal((await r.reorder(urls,['a','b'])).status,400); assert.equal(r.calls.length,0);
  }
  const r=await route(); const response=await r.reorder(['b','a'],['a','b']);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{success:true,photos:['b','a'],primaryImageUrl:'b'});
  assert.deepEqual(JSON.parse(JSON.stringify(r.calls.at(-1))),['rpc','reorder_property_images',{p_property_id:'property',p_urls:['b','a'],p_expected_urls:['a','b']}]);
  for(const code of ['40001','22023']) {
    const failed=await route({rpcError:{code}}); const response=await failed.reorder(['b','a'],['a','b']);
    assert.equal(response.status,409); assert.equal((await response.json()).code,'PHOTO_ORDER_CONFLICT');
  }
});
