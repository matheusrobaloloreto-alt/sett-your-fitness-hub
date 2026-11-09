import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const directory = path.dirname(fileURLToPath(import.meta.url));
const ids = { token:'10000000-0000-4000-8000-000000000001', student:'20000000-0000-4000-8000-000000000002', company:'30000000-0000-4000-8000-000000000003', link:'40000000-0000-4000-8000-000000000004' };
const baseInput = { country_code:'BR', email:'fixture@example.invalid', phone:'11999990000', whatsapp:'11999990000', cpf:'00000000000', cep:'00000000', address:'Fixture', address_number:'1', neighborhood:'Fixture', city:'Fixture', state:'SP' };

function fixture(options={}) {
  const effects = { updates:[], linkCompleted:0, paymentReads:0, sends:[], auditUses:0 };
  const student = { id:ids.student, company_id:ids.company, full_name:'Synthetic student', status:'active', phone:'11999990000', whatsapp:'11999990000', country_code:'BR', updated_at:'2026-10-29T10:00:00.000Z', ...options.student };
  const link = { id:ids.link, student_id:ids.student, company_id:ids.company, expires_at:'2999-01-01T00:00:00Z', completed_at:null, revoked_at:null };
  let handler;
  const db = { from(table) {
    let operation='read', payload, selected=false;
    const filters=[];
    const result = () => {
      if (table==='public_registration_links') {
        if(operation==='read') return {data:{...link},error:null};
        if(payload.last_used_at && !payload.completed_at) { effects.auditUses++; return {data:null,error:null}; }
        if(options.linkReject) throw new TypeError('synthetic link offline');
        const currentLink={...link,...options.linkConcurrent};
        if(!filters.every(([op,key,value])=>op==='is'?currentLink[key]==null:op==='gt'?Date.parse(currentLink[key])>Date.parse(value):currentLink[key]===value)) return {data:null,error:null};
        if(options.linkError) return {data:null,error:{code:'42501',message:'synthetic denied'}};
        if(options.linkEmpty) return {data:null,error:null};
        effects.linkCompleted++;
        if(payload.last_used_at) effects.auditUses++;
        return {data:selected?{...link,...payload,completed_at:options.linkAckAt?.(payload.completed_at) ?? payload.completed_at}:null,error:null};
      }
      if(table==='students') {
        if(operation==='read') return {data: options.readMissing?null:{...student},error:null};
        effects.updates.push({payload:{...payload},filters:[...filters]});
        if(options.updateReject) throw new TypeError('synthetic offline');
        if(options.updateError) return {data:null,error:{code:options.updateError,message:'synthetic denied'}};
        const current={...student,...options.concurrent};
        if(options.updateEmpty || !filters.every(([op,key,value])=>op==='is'? current[key]==null:current[key]===value)) return {data:null,error:null};
        return {data:selected?{...current,...payload,...options.ack}:null,error:null};
      }
      if(table==='public_payment_links') { effects.paymentReads++; return {data:{id:'payment-fixture',token:'payment-token-fixture',expires_at:link.expires_at},error:null}; }
      throw new Error('Unexpected table: '+table);
    };
    const q={
      select:()=>{selected=true;return q;}, update:value=>{operation='update';payload=value;selected=false;return q;},
      insert:value=>{operation='insert';payload=value;return q;},
      eq:(key,value)=>{filters.push(['eq',key,value]);return q;}, is:(key,value)=>{filters.push(['is',key,value]);return q;},
      gt:(key,value)=>{filters.push(['gt',key,value]);return q;}, order:()=>q, limit:()=>q,
      maybeSingle:()=>Promise.resolve().then(result), single:()=>Promise.resolve().then(result),
      then:(resolve,reject)=>Promise.resolve().then(result).then(resolve,reject),
    };return q;
  }};
  const cache=new Map();
  function load(file) {
    if(cache.has(file)) return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const importModule = specifier => {
      if(specifier.startsWith('https://esm.sh/')) return {createClient:()=>db};
      if(specifier.endsWith('/sales-funnel.ts')) return {buildPaymentLinkMessage:()=> 'Synthetic payment link',sendFunnelWhatsAppMessage:async args=>{effects.sends.push(args);return {sent:false};}};
      if(['/fiscal-registration.ts','/whatsappIdentity.ts','/tenant-auth.ts'].some(suffix=>specifier.endsWith(suffix))) return load(path.resolve(path.dirname(file),specifier));
      return new Proxy({}, {get:(_target,key)=>()=>{throw new Error('Unexpected dependency: '+String(key));}});
    };
    const context=vm.createContext({exports:module.exports,module,require:importModule,URL,Request,Response,TextEncoder,TextDecoder,Date,Uint8Array,
      console:{error:()=>{},log:()=>{},warn:()=>{}},
      Deno:{env:{get:key=>key==='SUPABASE_URL'?'https://backend.invalid':key==='PUBLIC_APP_URL'?'https://app.invalid':'synthetic'},serve:value=>{handler=value;}},
      fetch:()=>{throw new Error('Network forbidden');},
    });
    new vm.Script(code,{filename:file}).runInContext(context);
    return module.exports;
  }
  load(path.join(directory,'index.ts'));
  return {effects, async complete(input={}) {
    const response=await handler(new Request('https://edge.invalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete',token:ids.token,student:{...baseInput,...input}})}));
    return {status:response.status,body:await response.json()};
  }};
}
function noEffects(f) {
  assert.equal(f.effects.linkCompleted,0);
  assert.equal(f.effects.paymentReads,0);
  assert.equal(f.effects.sends.length,0);
}
for(const options of [{updateError:'42501'},{updateError:'PT409'},{updateEmpty:true},{updateReject:true}]) {
  test('student error/zero-row/rejected ACK stops completion and effects: '+JSON.stringify(options),async()=>{
    const f=fixture(options);const r=await f.complete();
    assert.ok(r.status>=400);noEffects(f);
  });
}
for(const concurrent of [{updated_at:'2026-10-29T10:01:00Z'},{phone:'11977770000',updated_at:'2026-10-29T10:01:00Z'}]) {
  test('CAS refuses concurrent student changes: '+Object.keys(concurrent).join(','),async()=>{
    const f=fixture({concurrent});const r=await f.complete();
    assert.equal(r.status,409);noEffects(f);
  });
}
for(const ack of [{id:'other-student'},{company_id:'other-company'},{phone:'11977770000'},{country_code:'PT'}]) {
  test('does not trust a mismatched update ACK: '+Object.keys(ack),async()=>{
    const f=fixture({ack});const r=await f.complete();assert.ok(r.status>=400);noEffects(f);
  });
}
for(const options of [{linkError:true},{linkEmpty:true},{linkReject:true},
  {linkConcurrent:{completed_at:'2026-10-29T11:00:00Z'}},
  {linkConcurrent:{revoked_at:'2026-10-29T11:00:00Z'}},
  {linkConcurrent:{expires_at:'2000-01-01T00:00:00Z'}},
]) {
  test('link ACK failure stops payment and messaging: '+JSON.stringify(options),async()=>{
    const f=fixture(options);const r=await f.complete();assert.ok(r.status>=400);noEffects(f);
  });
}
test('accepts the same completion instant in the PostgREST timezone format',async()=>{
  const f=fixture({linkAckAt:at=>at.replace(/Z$/, '+00:00')});
  const r=await f.complete();
  assert.equal(r.status,200);
  assert.equal(f.effects.paymentReads,1);
});
test('rejects a completion ACK for another instant',async()=>{
  const f=fixture({linkAckAt:()=> '2000-01-01T00:00:00Z'});
  const r=await f.complete();
  assert.equal(r.status,409);
  assert.equal(f.effects.paymentReads,0);
  assert.equal(f.effects.sends.length,0);
});

for(const [input,expected] of [
  [{phone:'(11) 99999-0000',whatsapp:'+55 11 99999-0000'},'5511999990000'],
  [{phone:'1199990000',whatsapp:'11999990000'},'5511999990000'],
  [{phone:'11999990000',whatsapp:''},'5511999990000'],
  [{phone:'',whatsapp:'11999990000'},'5511999990000'],
  [{country_code:'PT',phone:'+351 912 345 678',whatsapp:'351912345678'},'351912345678'],
  [{country_code:'US',phone:'+1 415 555 0100',whatsapp:'14155550100'},'14155550100'],
  [{country_code:'PT',phone:'+351 234 5678',whatsapp:'3512345678'},'3512345678'],
  [{phone:'02111999990000',whatsapp:'11999990000'},'5511999990000'],
]) {
  test('single/equivalent direct input persists one contact and preserves country: '+JSON.stringify(input),async()=>{
    const f=fixture({student:{phone:null,whatsapp:null}});const r=await f.complete(input);assert.equal(r.status,200);
    const payload=f.effects.updates[0].payload;
    assert.equal(payload.phone,expected);assert.equal(payload.whatsapp,expected);
    assert.equal(payload.country_code,input.country_code||'BR');
    assert.equal(f.effects.linkCompleted,1);assert.equal(f.effects.sends.length,1);
    assert.equal(f.effects.sends[0].phone,expected);
  });
}
for(const input of [
  {phone:'11999990000',whatsapp:'11988880000'},
  {country_code:'PT',phone:'+351912345678',whatsapp:'+351913345678'},
]) {
  test('rejects distinct direct inputs before student write: '+JSON.stringify(input),async()=>{
    const f=fixture();const r=await f.complete(input);assert.equal(r.status,422);
    assert.equal(f.effects.updates.length,0);noEffects(f);
  });
}
test('happy ACK retains active status and uses snapshot version and scope',async()=>{
  const f=fixture();const r=await f.complete();assert.equal(r.status,200);
  const u=f.effects.updates[0];assert.equal(u.payload.status,'active');
  assert.ok(u.filters.some(([,key,value])=>key==='updated_at'&&value==='2026-10-29T10:00:00.000Z'));
  assert.ok(u.filters.some(([,key,value])=>key==='company_id'&&value===ids.company));
});

test('missing version stops before student write or business effects',async()=>{
  const f=fixture({student:{updated_at:null}});const r=await f.complete();assert.equal(r.status,503);
  assert.equal(f.effects.updates.length,0);noEffects(f);
});
test('cross-company concurrent reassignment cannot be overwritten',async()=>{
  const f=fixture({concurrent:{company_id:'another-company'}});const r=await f.complete();assert.equal(r.status,409);noEffects(f);
});
test('explicit foreign calling code is not silently recast as BR',async()=>{
  const f=fixture();const r=await f.complete({country_code:'BR',phone:'+351912345678',whatsapp:'+351912345678'});
  assert.equal(r.status,422);assert.equal(f.effects.updates.length,0);noEffects(f);
});

for(const student of [
  {phone:'11988880000',whatsapp:'11988880000',updated_at:'2026-10-29T12:00:00Z'},
  {phone:'11999990000',whatsapp:'11988880000',updated_at:'2026-10-29T12:00:00Z'},
  {phone:'invalid',whatsapp:null,updated_at:'2026-10-29T12:00:00Z'},
]) {
  test('stale public form cannot replace a corrected or unresolved official contact before request: '+JSON.stringify(student),async()=>{
    const f=fixture({student});const r=await f.complete();
    assert.equal(r.status,409);
    assert.equal(f.effects.updates.length,0);
    assert.equal(f.effects.auditUses,0);
    noEffects(f);
  });
}
for(const [student,input,country,expected] of [
  [{phone:'+55 11 99999-0000',whatsapp:'1199990000',country_code:'BR'}, {phone:'11999990000',whatsapp:'+55 11 99999-0000',country_code:'US'}, 'BR','5511999990000'],
  [{phone:'351912345678',whatsapp:'351912345678',country_code:'PT'}, {phone:'+351912345678',whatsapp:'351912345678',country_code:'US'}, 'PT','351912345678'],
]) {
  test('equivalent recipient preserves official country despite stale client label: '+country,async()=>{
    const f=fixture({student});const r=await f.complete(input);assert.equal(r.status,200);
    assert.equal(f.effects.updates[0].payload.country_code,country);
    assert.equal(f.effects.updates[0].payload.phone,expected);
    assert.equal(f.effects.updates[0].payload.whatsapp,expected);
  });
}
test('stale non-BR label cannot bypass current official BR fiscal requirements',async()=>{
  const f=fixture();const r=await f.complete({country_code:'US',phone:'+5511999990000',whatsapp:'+5511999990000',cpf:'',cep:''});
  assert.equal(r.status,422);assert.equal(f.effects.updates.length,0);assert.equal(f.effects.auditUses,0);noEffects(f);
});
test('valid stale foreign recipient cannot replace a corrected BR official contact',async()=>{
  const f=fixture();const r=await f.complete({country_code:'PT',phone:'+351912345678',whatsapp:'+351912345678'});
  assert.equal(r.status,409);assert.equal(f.effects.updates.length,0);assert.equal(f.effects.auditUses,0);noEffects(f);
});
test('same international recipient keeps official PT label even if client says BR',async()=>{
  const f=fixture({student:{country_code:'PT',phone:'351912345678',whatsapp:'351912345678'}});
  const r=await f.complete({country_code:'BR',phone:'+351912345678',whatsapp:'351912345678'});
  assert.equal(r.status,200);assert.equal(f.effects.updates[0].payload.country_code,'PT');
});
