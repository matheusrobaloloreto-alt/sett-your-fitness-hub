import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {DEFAULT_COMPANY_PRODUCT_SETTINGS} from '../../supabase/functions/_shared/company-product-settings.ts';
import {assertCompanyStudioDenied} from './studio-master-scope-contract.mjs';

const file=path.resolve(process.argv[2]||'');
if(!/\/output\/self-service-local-20261026\/sett-complete-[a-f0-9]{16}\.private\/preview-access\.private\.json$/.test(file))throw Error('Explicit own synthetic preview access file required');
const access=JSON.parse(readFileSync(file));
assert.equal(access.api,'http://127.0.0.1:57621');assert.equal(access.syntheticOnly,true);
const company=access.companyId,tokens={},users={},results=[];
async function request(who,route,body){
 const response=await fetch(access.api+route,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',...(tokens[who]?{Authorization:`Bearer ${tokens[who]}`}:{})},
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 return {status:response.status,body:await response.json().catch(()=>null)};
}
for(const who of ['admin','coordinator','master','foreign','assigned','student']){
 const r=await request(who,'/auth/v1/token?grant_type=password',access.accounts[who]);
 assert.equal(r.status,200,`Synthetic ${who} login`);assert.ok(r.body?.access_token);
 tokens[who]=r.body.access_token;users[who]=r.body.user.id;
}
async function rpc(who,name,body,status=200){const r=await request(who,`/rest/v1/rpc/${name}`,body);assert.equal(r.status,status,`${who}/${name}: HTTP ${r.status}`);return r.body;}
async function group(name,run){try{await run();results.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){results.push({name,passed:false,reason:error.message});console.log(`FAIL ${name}`);}}
const settings=async()=>{const r=await request('admin',`/rest/v1/company_product_settings?company_id=eq.${company}&select=settings,version`);assert.equal(r.status,200);return r.body[0]||{version:0,settings:structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS)};};

await group('methodology save/reload and stale version rejection',async()=>{
 const current=await settings(),next=structuredClone(current.settings);next.prescription={...structuredClone(DEFAULT_COMPANY_PRODUCT_SETTINGS.prescription),...next.prescription};
 next.prescription.default_cadence='3030';next.prescription.progression_mode='maintain';
 await rpc('admin','save_company_product_settings',{_company_id:company,_settings:next,_expected_version:current.version});
 const read=await settings();assert.equal(read.version,current.version+1);assert.equal(read.settings.prescription.progression_mode,'maintain');assert.equal(read.settings.prescription.default_cadence,'3030');
 await rpc('admin','save_company_product_settings',{_company_id:company,_settings:next,_expected_version:current.version},409);
});
await group('governance named-recipient transfer roundtrip and permission bundle',async()=>{
 let current=await rpc('admin','get_company_governance',{_company_id:company});assert.equal(current.owner_id,users.admin);
 const change=async(who,action,payload)=>current=await rpc(who,'change_company_governance',{_company_id:company,_action:action,_payload:payload,_expected_version:current.version});
 await change('admin','request_transfer',{recipient_id:users.coordinator});
 let pending=current.transfers.find(t=>t.status==='pending');assert.ok(pending);
 await rpc('admin','change_company_governance',{_company_id:company,_action:'accept_transfer',_payload:{request_id:pending.id},_expected_version:current.version},403);
 await change('coordinator','accept_transfer',{request_id:pending.id});assert.equal(current.owner_id,users.coordinator);
 await change('coordinator','request_transfer',{recipient_id:users.admin});pending=current.transfers.find(t=>t.status==='pending');
 await change('admin','accept_transfer',{request_id:pending.id});assert.equal(current.owner_id,users.admin);
 const name=`Perfil local ${Date.now()}`;await change('admin','save_role',{name,permissions:['company_dashboard_full']});
 const role=current.bundles.find(r=>r.name===name);assert.ok(role);
 await change('admin','assign_role',{role_id:role.id,user_id:users.assigned});
 await change('admin','unassign_role',{role_id:role.id,user_id:users.assigned});
 await change('admin','delete_role',{role_id:role.id});
});
await group('funnel configuration and aggregate report readback',async()=>{
 const current=await rpc('admin','get_company_operations',{_company_id:company});const next=structuredClone(current.settings);
 next.stages.find(s=>s.code==='contacted').label='Contato da homologação';
 const saved=await rpc('admin','save_company_operations',{_company_id:company,_settings:next,_expected_version:current.version});
 assert.equal(saved.version,current.version+1);
 const read=await rpc('admin','get_company_operations',{_company_id:company});assert.equal(read.settings.stages.find(s=>s.code==='contacted').label,'Contato da homologação');
 const metrics=await rpc('admin','get_company_operation_metrics',{_company_id:company});assert.ok(metrics&&typeof metrics==='object');
 await rpc('admin','save_company_operations',{_company_id:company,_settings:next,_expected_version:current.version},409);
});
await group('weekly availability and date exception persistence',async()=>{
 const current=await rpc('admin','get_company_agenda_availability',{_company_id:company});
 const next={timezone:'America/Sao_Paulo',weekly:[{weekday:1,start:'09:00',end:'11:00'}],exceptions:[{date:'2026-12-25',windows:[]}]};
 const saved=await rpc('admin','save_company_agenda_availability',{_company_id:company,_settings:next,_expected_version:current.version});assert.equal(saved.version,current.version+1);
 const read=await rpc('admin','get_company_agenda_availability',{_company_id:company});assert.deepEqual(read.settings,next);
});
await group('Master CMS publication and prospective XP adoption',async()=>{
 const before=await settings(),state=await rpc('master','get_platform_content_editor',{}),document=structuredClone(state.document);
 document.cms.hero_title='SETT — ambiente local de homologação';document.experience.xp_workout=55;
 const saved=await rpc('master','save_platform_content',{_document:document,_expected_version:state.version,_publish:true});
 const publicCopy=await rpc('anon','get_public_platform_content',{});assert.equal(publicCopy.hero_title,document.cms.hero_title);
 const adopted=await rpc('admin','adopt_platform_experience_defaults',{_company_id:company,_platform_version:saved.published_version,_expected_settings_version:before.version,_confirm:true});assert.equal(adopted.adopted,true);
 const read=await settings();assert.equal(read.settings.experience.xp_workout,55);assert.deepEqual(read.settings.prescription,before.settings.prescription);
});
await group('company Studio is unavailable to company customers and master via company RPCs',async()=>{
 for(const who of ['admin','coordinator','master','foreign','assigned','student'])for(const [name,body] of [
  ['get_company_content',{_company_id:company}],
  ['save_company_content',{_company_id:company,_document:{},_expected_version:0}],
 ]){
  const response=await request(who,`/rest/v1/rpc/${name}`,body);
  assertCompanyStudioDenied(response,`${who}/${name}`);
 }
});
await group('foreign-company and student denials; scoped reconciliation projection',async()=>{
 for(const who of ['foreign','student'])for(const name of ['get_company_governance','get_company_operations','get_company_agenda_availability'])await rpc(who,name,{_company_id:company},403);
 const read=await rpc('admin','inspect_company_dispatch_reconciliation',{_company_id:company});assert.ok(read&&typeof read==='object');
 await rpc('foreign','inspect_company_dispatch_reconciliation',{_company_id:company},403);
 await rpc('admin','get_platform_content_editor',{},403);
});
const result={syntheticOnly:true,realAuthRest:true,results,passed:results.filter(r=>r.passed).length,total:results.length,noDeploy:true};
writeFileSync(path.join(path.dirname(file),`product-rpc-${Date.now()}.json`),JSON.stringify(result,null,2),{mode:0o600});
console.log(JSON.stringify(result));if(results.some(r=>!r.passed))process.exitCode=1;
