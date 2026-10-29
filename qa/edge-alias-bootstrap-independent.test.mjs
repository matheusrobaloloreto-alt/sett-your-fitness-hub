import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const manifest=JSON.parse(readFileSync('output/hosted-staging-preflight-20261028/edge-alias-manifest.private.json','utf8'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const expected='https://ifymocggowdlqqcxugko.supabase.co';
for(const alias of Object.values(manifest.aliases)) {
 const source=readFileSync(path.join(manifest.workdir,'supabase/functions',alias,'index.ts'),'utf8');
 test(`${alias}: backend and paid credentials fail before import or environment mutation`,async()=>{
  assert.equal(createHash('sha256').update(source).digest('hex'),manifest.wrapper_sha256);
  assert.equal(source.split('await import("./candidate.ts");').length,2);
  const bootstrap=new AsyncFunction('Deno','loadCandidate',source.replace('await import("./candidate.ts");','await loadCandidate();'));
  for(const initial of [{SUPABASE_URL:'https://other.invalid'},...['ANTHROPIC_API_KEY','OPENAI_API_KEY','LOVABLE_API_KEY'].map(k=>({SUPABASE_URL:expected,[k]:'synthetic-do-not-echo'}))]) {
   const env=new Map(Object.entries(initial)); let imports=0; const mutations=[];
   await assert.rejects(bootstrap({env:{get:k=>env.get(k),set:(k,v)=>{mutations.push(k);env.set(k,v);}}},()=>{imports++;}),e=> !String(e).includes('synthetic-do-not-echo'));
   assert.equal(imports,0); assert.deepEqual(mutations,[]);
  }
  const env=new Map([['SUPABASE_URL',expected],['unrelated','preserved']]); let imports=0;
  await bootstrap({env:{get:k=>env.get(k),set:(k,v)=>env.set(k,v)}},()=>{
   imports++;
   for(const k of ['APP_URL','PUBLIC_APP_URL']) assert.equal(env.get(k),'http://127.0.0.1:57650');
   for(const k of ['PRESCRIPTION_AI_FIRST','PRESCRIPTION_ENGINE_V1']) assert.equal(env.get(k),'off');
  });
  assert.equal(imports,1); assert.equal(env.get('unrelated'),'preserved'); assert.equal(env.get('SUPABASE_URL'),expected);
 });
}
