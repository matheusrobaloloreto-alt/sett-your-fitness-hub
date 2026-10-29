import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {main} from './commercial-complete-runtime-acceptance.mjs';
import {output,repo,allowlist} from './commercial-complete-runtime.mjs';

const released=process.env.COMPLETE_RUNTIME_INDEPENDENT_RELEASE==='1';
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
test('independent fresh internal runtime: frozen authoritative schema plus explicit migrations accepted and cleaned',{
 skip:released?false:'Awaiting worker final freeze or root release', timeout:1200000,
},async()=>{
 const runners=readdirSync(new URL('./',import.meta.url)).filter(n=>/^commercial-complete-runtime.*\.mjs$/.test(n));
 const captures=readdirSync(output).filter(n=>/^commercial-complete-.*\.private\.json$/.test(n));
 const paths=[...runners.map(n=>`${repo}/scripts/qa/${n}`),...allowlist.map(n=>`${repo}/supabase/migrations/${n}`),...captures.map(n=>`${output}/${n}`)];
 const frozen=new Map(paths.map(p=>[p,digest(p)]));
 let result;
 try{
  result=await main();
  assert.equal(result.cleanup?.cleanup,true,'Own container/network cleanup must be verified');
  assert.equal(result.sourcesUnchanged,true,'Worker must verify immutable migration and capture inputs');
  assert.equal(result.egress?.internal,true,'Runtime must retain its internal network');
  assert.equal(result.egress?.hostPorts,0);assert.equal(result.egress?.binds,0);
  assert.equal(result.egress?.defaultRoutes,0);
  const boundary=result.install?.extensionBoundary;
  assert.ok(Array.isArray(boundary),'Extension binary boundary must be visible in evidence');
  const pgnet=boundary.find(x=>x.name==='pg_net');
  assert.ok(pgnet,'Known pg_net deviation must not be silently dropped');
  assert.equal(pgnet.target,'0.20.0');assert.equal(pgnet.runtime,'0.20.4');
  assert.match(pgnet.reason,/no extension parity claim/i);
  assert.equal(result.baselineAccepted,true,'Baseline compile alone cannot certify real commercial acceptance');
  assert.equal(result.migrationsApplied.length,allowlist.length,'All and only allowlisted migrations required');
  assert.equal(result.stage,'accepted-with-runtime-boundaries','Baseline acceptance alone cannot certify post-migration behavior');
  for(const name of ['baseline','postMigration','rest'])assert.ok(result[name]?.checks?.length>0,`Missing ${name} assertions`);
  assert.equal(result.captureManifest?.verified,true);assert.equal(result.captureManifest?.files?.length,9);
  assert.equal(result.failure,undefined,'No swallowed baseline/acceptance error');
 }finally{
  const drift=[...frozen].filter(([p,h])=>digest(p)!==h).map(([p])=>p.split('/').at(-1));
  console.log(JSON.stringify({independent:true,sourceFiles:frozen.size,sourceDrift:drift,runnerHashes:runners.map(name=>({name,sha256:frozen.get(`${repo}/scripts/qa/${name}`)})),scope:'local synthetic commercial acceptance; no provider/full Auth parity claim'}));
  assert.deepEqual(drift,[],'Any source drift invalidates the independent run');
 }
});
