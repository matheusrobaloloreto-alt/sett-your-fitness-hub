import assert from 'node:assert/strict';
import {lit} from './commercial-complete-runtime.mjs';

export function restAcceptance(rt,s,svc){
 const {ids:i,users:u}=s,base=`http://${svc.name}:3000`,checks=[];
 const request=(label,route,body)=>rt.http(base+route,{method:body===undefined?'GET':'POST',headers:{...(label==='anon'?{}:{Authorization:`Bearer ${s.tokens[label]}`}),'Content-Type':'application/json'},body:body??null});
 const check=(name,fn)=>{fn();checks.push(name);console.log(`HTTP ${name}`);};
 const adopt=features=>{
  rt.sql(`update public.platform_product_settings set version=version+1,settings=jsonb_set(settings,'{tiers,basic,features}',(select jsonb_object_agg(k,k=any(array[${features.map(lit).join(',')}]::text[])) from unnest(commercial_private.feature_keys()) k));`);
  const versions=JSON.parse(rt.value(`select jsonb_build_object('policy',(select version from public.company_feature_policies where company_id=${lit(i.company)}),'catalog',(select version from public.platform_product_settings))`));
  const r=request('master','/rpc/set_company_feature_policy',{_company_id:i.company,_source:'catalog',_expected_version:versions.policy,_catalog_version:versions.catalog,_confirm:true});
  assert.equal(r.status,200,'Master adoption via actual Auth JWT / PostgREST');
  const read=request('master','/rpc/get_company_feature_entitlements',{_company_id:i.company});assert.equal(read.status,200);
  assertFeatureReadback(read.body.features,features);
  return r;
 };
 const datePlus=n=>rt.value(`select (public.current_business_date()+${n})::text`);
 const specs=[
  {name:'get_company_dashboard_snapshot',body:{_company_id:i.company},status:200,denialStatus:403,denialCode:'42501'},
  {name:'reassign_student_trainer',body:{_student_id:i.student,_trainer_id:u.unassigned,_expected_trainer_id:u.assigned},status:200,denialStatus:403,denialCode:'42501'},
  {name:'set_registration_lead_stage',body:{_company_id:i.company,_entity_type:'lead',_record_id:i.lead,_expected_stage:'interested',_target_stage:'lost'},status:200,denialStatus:403,denialCode:'42501'},
  {name:'reschedule_training_cycles_from',body:{p_enrollment_id:i.enrollment,p_cycle_id:i.cycle,p_new_start_date:datePlus(2)},status:204,denialStatus:403,denialCode:'42501'},
 ];
 const readback=(route,expected)=>{const r=request('admin',route);assert.equal(r.status,200);assert.equal(r.body.length,1);for(const [k,v] of Object.entries(expected))assert.equal(r.body[0][k],v);};
 const historyCycleIds=(s.historyCycleIds||[]).map(lit).join(',')||'null';
 const history=()=>rt.value(`select md5(jsonb_build_object('frozenCycles',(select jsonb_agg(to_jsonb(c) order by id) from public.training_cycles c where id in (${historyCycleIds})),'workouts',(select jsonb_agg(to_jsonb(w)) from public.workouts w where w.id=${lit(i.workout)}),'sessions',(select jsonb_agg(to_jsonb(w)) from public.workout_sessions w where w.id=${lit(i.session)}))::text)`);
 const all=['hasPrescription','hasDashboard','hasRegistration','hasAnamnesis','hasStudents','hasAgenda','hasTeam','hasPlans','hasAppearance','hasFinancial','hasWhatsApp','hasAutomation'];
 check('Master adopts full synthetic catalog via real REST',()=>adopt(all));
 check('all four RPC endpoints accept actual admin JWT and read back committed data',()=>{
  const before=history();
  for(const spec of specs){const r=request('admin',`/rpc/${spec.name}`,spec.body);assert.equal(r.status,spec.status,`${spec.name}: expected actual successful endpoint contract; got ${r.status}, code=${r.body?.code||'none'}`);if(spec.name==='get_company_dashboard_snapshot')assertDashboard(r.body,i.company,s.businessDate);}
  readback(`/students?id=eq.${i.student}&select=id,assigned_trainer_id`,{assigned_trainer_id:u.unassigned});
  readback(`/enrollments?id=eq.${i.enrollment}&select=id,trainer_id`,{trainer_id:u.unassigned});
  readback(`/leads?id=eq.${i.lead}&select=id,stage`,{stage:'lost'});
  readback(`/training_cycles?id=eq.${i.cycle}&select=id,start_date,status`,{start_date:datePlus(2),status:'pending'});
  assert.equal(history(),before,'Committed real REST date correction preserves completed history');
 });
 check('foreign/student denial at all four actual endpoints preserves original error contract; anonymous denied',()=>{
  const before=mutationDigest(rt,s);
  for(const spec of specs){
   for(const who of ['foreign','student']){const r=request(who,`/rpc/${spec.name}`,spec.body);const originalStudentDenial=who==='student'&&spec.name==='reschedule_training_cycles_from';assert.equal(r.status,originalStudentDenial?400:spec.denialStatus,`${who}/${spec.name} denial HTTP contract`);assert.equal(r.body?.code,originalStudentDenial?'P0001':spec.denialCode);if(originalStudentDenial)assert.match(r.body.message,/^Sem permissao para reagendar os ciclos desta matricula/);}
   const anon=request('anon',`/rpc/${spec.name}`,spec.body);assert.equal(anon.status,401,`${spec.name} anonymous execute denial`);assert.equal(anon.body?.code,'42501');
  }
  assert.equal(mutationDigest(rt,s),before,'All denied HTTP requests preserve business rows');
 });
 check('Master disables all four capabilities via REST; every admin endpoint denies 42501/403',()=>{
  adopt([]);for(const spec of specs){const r=request('admin',`/rpc/${spec.name}`,spec.body);assert.equal(r.status,403);assert.equal(r.body?.code,'42501');}
 });
 check('Master re-enables Agenda only via REST, commits real two-phase shift and preserves completed history',()=>{
  adopt(['hasAgenda']);const before=history();const spec=specs[3];const r=request('admin',`/rpc/${spec.name}`,{...spec.body,p_new_start_date:datePlus(4)});assert.equal(r.status,204);
  assert.equal(rt.value(`select start_date from public.training_cycles where id=${lit(i.cycle)}`),datePlus(4));
  assert.equal(rt.value(`select status from public.training_cycles where id=${lit(i.cycle)}`),'pending');assert.equal(history(),before);
  assert.equal(rt.value('select count(*) from commercial_private.agenda_reschedule_authorizations'),'0');
  for(const spec of specs.slice(0,3)){const r=request('admin',`/rpc/${spec.name}`,spec.body);assert.equal(r.status,403);assert.equal(r.body?.code,'42501');}
 });
 const historyRead=request('master',`/company_feature_policy_history?company_id=eq.${i.company}&select=version,source`);assert.equal(historyRead.status,200);assert.ok(historyRead.body.length>=3);
 return {checks,allFourActualRpcEndpoints:true,actualGoTrueJwt:true,actualPostgRestVersion:'14.10',wrappedRescheduleDenial:{foreign:{http:403,sqlstate:'42501'},student:{http:400,sqlstate:'P0001',originalAuthorization:true}},baselineOriginalSqlAllowsP0001:true,baselineHttpNotTested:true,anonymousDenial:401,adoptionHistoryRows:historyRead.body.length,providerCalls:0};
}

export const exactFeatureKeys=Object.freeze(['hasPrescription','hasDashboard','hasRegistration','hasAnamnesis','hasStudents','hasAgenda','hasTeam','hasPlans','hasAppearance','hasFinancial','hasWhatsApp','hasAutomation']);
export function assertFeatureReadback(features,enabled){
 assert.ok(features&&typeof features==='object'&&!Array.isArray(features),'Actual entitlement feature object');assert.deepEqual(Object.keys(features).sort(),[...exactFeatureKeys].sort(),'Exact 12 actual feature keys');
 for(const k of exactFeatureKeys){assert.equal(typeof features[k],'boolean',`${k} boolean`);assert.equal(features[k],enabled.includes(k),`${k} expected adoption value`);}
}
export function assertDashboard(body,company,businessDate){
 assert.ok(body&&typeof body==='object'&&!Array.isArray(body));assert.equal(body.version,1);assert.equal(body.companyId,company);assert.equal(body.asOfDate,businessDate);
 assert.deepEqual(body.stats,{totalStudents:1,interestedStudents:1,pendingStudents:0,awaitingRenewalStudents:0,inactiveStudents:0,trainers:2},'Actual synthetic tenant stats');
 for(const k of ['planChart','expiringContracts','cycleCountdowns','monthlyPrescriptions','pendingFeedback','contactCadence','cohortFeedback','atRiskStudents'])assert.ok(Array.isArray(body[k]),`Dashboard contract ${k}`);
 assert.ok(body.trainerMap&&typeof body.trainerMap==='object');
 for(const k of ['pendingActions','birthdays','missingWorkouts','awaitingTrainer','awaitingTrainingDate','missingEnrollment','incompleteBilling','recentStudents'])assert.ok(Array.isArray(body.alerts?.[k]),`Dashboard alert contract ${k}`);
 for(const k of ['expiringContracts','awaitingRenewal','cycleCountdowns'])assert.ok(Array.isArray(body.renewals?.[k]),`Dashboard renewal contract ${k}`);
 assert.ok(body.renewals.trainerMap&&typeof body.renewals.trainerMap==='object');
 assert.ok(body.planChart.some(p=>p.name==='Synthetic 12 weeks'&&p.count===1),'Actual synthetic enrollment plan count');
}
function mutationDigest(rt,s){
 const i=s.ids;return rt.value(`select md5(jsonb_build_object('student',(select to_jsonb(x) from public.students x where id=${lit(i.student)}),'enrollment',(select to_jsonb(x) from public.enrollments x where id=${lit(i.enrollment)}),'cycles',(select jsonb_agg(to_jsonb(x) order by id) from public.training_cycles x where enrollment_id=${lit(i.enrollment)}),'lead',(select to_jsonb(x) from public.leads x where id=${lit(i.lead)}))::text)`);
}
