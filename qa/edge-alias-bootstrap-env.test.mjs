// Source-faithful Edge env object test; all values synthetic, no network/native writes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const base='output/hosted-staging-preflight-20261028/';
const vendor=readFileSync(base+'edge-runtime-env-source.private.js','utf8');
assert.ok(vendor.includes('export { SUPABASE_ENV };'));
const original=readFileSync(base+'edge-alias-deploy.private/supabase/functions/qa-20261028-c9ede238-public-registration/index.ts','utf8');
const proposed=readFileSync('qa/edge-alias-readonly-env-bootstrap.proposal.ts','utf8');
const backend='https://ifymocggowdlqqcxugko.supabase.co';
function harness(changes={},mode='normal'){
 const values={SUPABASE_URL:backend,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-only',SUPABASE_ANON_KEY:'synthetic-anon-only',APP_URL:'https://original.invalid',PUBLIC_APP_URL:'https://original.invalid',PRESCRIPTION_AI_FIRST:'on',PRESCRIPTION_ENGINE_V1:'on',OTHER_NAME:'synthetic-other',...changes};
 const reads=[];let sets=0,imports=0;const context=vm.createContext({});
 context.__bootstrap={core:{ops:{op_get_env:key=>{reads.push(key);return values[key];},op_env:()=>({...values}),op_set_env:()=>{sets++;throw new Error('NotSupported: The operation is not supported');},op_delete_env:()=>{throw new Error('delete forbidden');}}}};
 new vm.Script(vendor.replace('export { SUPABASE_ENV };','globalThis.__testEnv=SUPABASE_ENV;')).runInContext(context);
 const env=context.__testEnv;const beforeGet=env.get;const beforeToObject=env.toObject;
 const descriptor=Object.getOwnPropertyDescriptor(env,'get');assert.equal(descriptor.writable,true);assert.equal(descriptor.configurable,true);
 if(mode==='readonly')Object.defineProperty(env,'get',{writable:false});
 const selected=mode==='set-trap'?new Proxy(env,{set(){throw new Error('replacement refused');}}):env;
 // Match native bootstrap readOnly(SUPABASE_ENV): property readonly, inner object mutable.
 context.Deno={};Object.defineProperty(context.Deno,'env',{value:selected,writable:false,configurable:false});
 context.__candidateImport=async()=>{imports++;};
 async function run(source){assert.equal(source.split('await import("./candidate.ts");').length,2);return await new vm.Script('(async()=>{"use strict";\n'+source.replace('await import("./candidate.ts");','await __candidateImport();')+'\n})()').runInContext(context);}
 return{values,reads,env,beforeGet,beforeToObject,run,get sets(){return sets;},get imports(){return imports;}};
}
test('RED: old unmodified wrapper hits native unsupported setter before candidate import',async()=>{
 const h=harness();await assert.rejects(h.run(original),/NotSupported/);assert.equal(h.sets,1);assert.equal(h.imports,0);
});
test('GREEN: descriptor-compatible four-key read overlay preserves original getter for every unlisted name',async()=>{
 const h=harness();await h.run(proposed);assert.equal(h.imports,1);assert.equal(h.sets,0);
 for(const key of ['APP_URL','PUBLIC_APP_URL'])assert.equal(h.env.get(key),'http://127.0.0.1:57650');
 for(const key of ['PRESCRIPTION_AI_FIRST','PRESCRIPTION_ENGINE_V1'])assert.equal(h.env.get(key),'off');
 for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','OTHER_NAME','UNKNOWN','ANTHROPIC_API_KEY','OPENAI_API_KEY','LOVABLE_API_KEY']){
  const before=h.reads.length;assert.equal(h.env.get(key),h.values[key]);assert.equal(h.reads.length,before+1);assert.equal(h.reads.at(-1),key);
 }
 assert.equal(h.env.toObject,h.beforeToObject);assert.equal(h.env.toObject().APP_URL,h.values.APP_URL);assert.equal(h.values.PRESCRIPTION_AI_FIRST,'on');
});
test('stage and all paid-key guards refuse before overlay/import with original getter intact',async()=>{
 for(const change of [{SUPABASE_URL:'https://foreign.invalid'},...['ANTHROPIC_API_KEY','OPENAI_API_KEY','LOVABLE_API_KEY'].map(key=>({[key]:'synthetic-blocked-paid-key'}))]){
  const h=harness(change);await assert.rejects(h.run(proposed),/TEST backend mismatch|Paid provider credential present/);
  assert.equal(h.env.get,h.beforeGet);assert.equal(h.sets,0);assert.equal(h.imports,0);
 }
});
test('nonwritable descriptor and replacement refusal fail closed before importing handler',async()=>{
 for(const mode of ['readonly','set-trap']){const h=harness({},mode);await assert.rejects(h.run(proposed),/TEST env read overlay unavailable/);assert.equal(h.imports,0);assert.equal(h.sets,0);assert.equal(h.env.get,h.beforeGet);}
});
