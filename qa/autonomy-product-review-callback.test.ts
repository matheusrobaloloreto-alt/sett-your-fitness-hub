import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,SourceTextModule,SyntheticModule} from 'node:vm';

// Exercise the actual acceptance main control flow with inert imports only.
// No Runtime implementation, Docker command, network, DB or filesystem writes are executed.
async function fixture(failBase=false) {
 const events:string[]=[];
 const fakeProcess={argv:['node','qa-callback'],exitCode:0};
 const context=createContext({process:fakeProcess,console:{log:()=>{}},URL});
 class Runtime {
  dir='/synthetic';name='synthetic';network='synthetic';imageId='synthetic';volumes=[];
  async start(){events.push('start');}
  egressProof(){return {isolated:true};}
  sql(){}
  value(sql:string){if(sql==='show track_functions')return 'all';return sql.includes("schemaname in ('public','commercial_private')")?1:0;}
  cleanup(){events.push('cleanup');return {cleanup:true};}
 }
 const capture=()=>({hash:'synthetic-hash',data:{roles:[]}});
 const noOp=()=>({});
 const stubs:Record<string,unknown>={
  Runtime,configureManagedAuthorization:noOp,verifyCaptureManifest:()=>({hash:'manifest'}),readCapture:capture,
  freezeMigrations:()=>[],assertFrozen:noOp,bootstrapAuth:async()=>({svc:{imageId:'synthetic'}}),
  privateFile:()=>events.push('evidence'),sha:()=> 'synthetic-hash',capturePath:'/synthetic-capture',
  loadAuthTableACLs:capture,restoreAuthTableACLs:noOp,
  restAcceptance:()=>{events.push('base-rest');if(failBase)throw Error('synthetic baseline rejection');return {};},
  loadStorageBoundary:capture,bootstrapStorage:noOp,
  seedSynthetic:async()=>({businessDate:'2026-10-28'}),seedPriorHistoryCycles:noOp,
  baselineBusiness:noOp,bindOriginals:noOp,postBusiness:noOp,startRest:async()=>({imageId:'synthetic'}),
  verifyCatalog:noOp,verifyDefaultACLs:noOp,loadAuthCapture:capture,loadPrivileges:capture,
  loadSequences:capture,loadRoleDefaults:capture,defaultACLs:noOp,installSchema:noOp,
  fileURLToPath:()=>'/not-the-invoked-script',readFileSync:()=>Buffer.from('synthetic'),readdirSync:()=>[],
 };
 const code=readFileSync('scripts/qa/commercial-complete-runtime-acceptance.mjs','utf8');
 const mainModule=new SourceTextModule(code,{context,identifier:'file:///synthetic-acceptance.mjs',initializeImportMeta:meta=>{meta.url='file:///synthetic-acceptance.mjs';}});
 await mainModule.link(async()=>{
  const names=Object.keys(stubs);
  return new SyntheticModule(names,function(){for(const name of names)this.setExport(name,stubs[name]);},{context});
 });
 await mainModule.evaluate();
 return {main:mainModule.namespace.main as (options?:{onReady?:(value:unknown)=>unknown})=>Promise<Record<string,unknown>>,events,fakeProcess};
}

test('callback is awaited after base assertions and before cleanup',{timeout:5000},async()=>{
 const f=await fixture();
 let release!:()=>void;let entered!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 const ready=new Promise<void>(resolve=>{entered=resolve;});
 const execution=f.main({onReady:async(value)=>{
  assert.ok(f.events.includes('base-rest'));
  assert.deepEqual(Object.keys(value as object).sort(),['evidence','localAuth','rest','rt','synthetic']);
  f.events.push('callback-enter');entered();await pending;f.events.push('callback-return');return {reviewed:true};
 }});
 await ready;assert.equal(f.events.includes('cleanup'),false);
 release();const result=await execution;
 assert.ok(f.events.indexOf('cleanup')>f.events.indexOf('callback-return'));
 assert.equal(result.accepted,true);assert.equal(f.fakeProcess.exitCode,0);
});

test('callback rejection is recorded and cleanup still executes once',async()=>{
 const f=await fixture();
 const result=await f.main({onReady:async()=>{throw Error('synthetic callback rejection');}});
 assert.equal(result.accepted,false);assert.equal(f.fakeProcess.exitCode,1);
 assert.equal((result.failure as {message:string}).message,'synthetic callback rejection');
 assert.equal(f.events.filter(x=>x==='cleanup').length,1);
});

test('base acceptance failure prevents callback and still cleans up',async()=>{
 const f=await fixture(true);let called=false;
 const result=await f.main({onReady:async()=>{called=true;}});
 assert.equal(called,false);assert.equal(result.accepted,false);
 assert.equal(f.events.filter(x=>x==='cleanup').length,1);
});

test('default main remains one-shot and cleans up without a callback',async()=>{
 const f=await fixture();const result=await f.main();
 assert.equal(result.accepted,true);assert.equal(f.fakeProcess.exitCode,0);
 assert.equal(f.events.filter(x=>x==='cleanup').length,1);
});
