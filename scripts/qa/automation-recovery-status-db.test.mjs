import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {api,login} from './self-service-api.mjs';
import {sql,privateFile} from './self-service-local.mjs';

const quote=v=>`'${String(v).replaceAll("'","''")}'`;
async function checked(path,options={}){const r=await api(path,options);assert.equal(r.ok,true,`${path.split('?')[0]} HTTP${r.status} code=${r.data?.code||''}`);return r.data;}
const insert=async(table,body)=>(await checked(`/rest/v1/${table}`,{method:'POST',admin:true,body}))[0];
const read=(table,filter)=>checked(`/rest/v1/${table}?${filter}`,{admin:true});
const source=readFileSync(new URL('../../supabase/functions/_shared/form-definitions.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {defaultFormDefinition}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('actual Auth/REST: scoped uncertainty queue and valid intercycle response without resend',{timeout:180000},async t=>{
  const company=randomUUID(),foreign=randomUUID(),people={};
  await checked('/rest/v1/companies',{method:'POST',admin:true,body:[{id:company,name:'Synthetic recovery status',slug:`status-${company}`},{id:foreign,name:'Synthetic foreign status',slug:`status-${foreign}`}]});
  for(const role of ['admin','foreign','student']){
    const email=`status-${role}-${randomUUID()}@self-service.invalid`;
    const u=await checked('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,email_confirm:true}});
    const own=role==='foreign'?foreign:company;
    sql(`insert into user_roles(user_id,role) values(${quote(u.id)},${quote(role==='student'?'student':'admin')});insert into company_members(company_id,user_id) values(${quote(own)},${quote(u.id)});`);
    people[role]={id:u.id,email,token:(await login({id:u.id,email})).access_token};
  }
  const student=await insert('students',{company_id:company,user_id:people.student.id,full_name:'Synthetic recovery student'});
  const plan=await insert('plans',{company_id:company,name:'Synthetic recovery plan',duration_days:42,duration_weeks:6,cycle_duration_days:42});
  const date=delta=>new Date(Date.now()+delta*86400000).toISOString().slice(0,10);
  const enrollment=await insert('enrollments',{company_id:company,student_id:student.id,plan_id:plan.id,status:'active',start_date:date(-33),end_date:date(8)});
  const definition=await checked('/rest/v1/rpc/publish_company_form_definition',{method:'POST',token:people.admin.token,body:{_company_id:company,_definition:defaultFormDefinition('intercycle'),_expected_version:0}});
  const deliveries=[];
  const answers={prescription_evaluation:'better',goals_continue:true,availability_changed:false,pain_present:false,sensitive_consent:true};
  async function invitation(versioned){
    const cycle=await insert('training_cycles',{company_id:company,student_id:student.id,enrollment_id:enrollment.id,status:'active',start_date:date(-33),end_date:date(8),cycle_number:deliveries.length+1});
    const delivery=await insert('intercycle_anamnesis_deliveries',{company_id:company,student_id:student.id,enrollment_id:enrollment.id,training_cycle_id:cycle.id,status:'failed',last_error_code:'dispatch_uncertain',idempotency_key:`intercycle:${cycle.id}`,scheduled_for:new Date().toISOString()});
    deliveries.push(delivery.id);
    const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
    await insert('intercycle_anamnesis_invites',{company_id:company,student_id:student.id,enrollment_id:enrollment.id,training_cycle_id:cycle.id,delivery_id:delivery.id,token_sha256:hash,expires_at:new Date(Date.now()+86400000).toISOString(),...(versioned?{form_definition_id:definition.id}:{})});
    sql(`insert into automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state) values('intercycle',${quote(delivery.id)},'_legacy_unknown',${quote(randomUUID())},'in_flight');`);
    return {delivery,hash};
  }
  const first=await invitation(false);
  const queue=token=>api('/rest/v1/rpc/get_company_dispatch_uncertainties',{method:'POST',token,body:{_company_id:company}});
  await t.test('staff reads exact safe projection; same-company student, foreign and anon denied',async()=>{
    const result=await queue(people.admin.token);assert.equal(result.ok,true);assert.equal(result.data.length,1);
    assert.deepEqual(Object.keys(result.data[0]).sort(),['id','name','source','updated_at']);
    for(const token of [people.student.token,people.foreign.token,undefined])assert.equal((await queue(token)).ok,false);
  });
  await t.test('quarantined delivery cannot requeue or refresh link state',async()=>{
    for(const status of ['scheduled','sending','ready']){
      const r=await api(`/rest/v1/intercycle_anamnesis_deliveries?id=eq.${first.delivery.id}`,{method:'PATCH',admin:true,body:{status,last_error_code:null}});
      assert.equal(r.ok,false);assert.equal(r.status,409);
    }
    assert.equal((await read('intercycle_anamnesis_deliveries',`id=eq.${first.delivery.id}&select=status,last_error_code`))[0].last_error_code,'dispatch_uncertain');
  });
  for(const versioned of [false,true])await t.test(`${versioned?'versioned':'legacy'} valid response resolves uncertainty, not provider ACK`,async()=>{
    const item=versioned?await invitation(true):first;
    const endpoint=versioned?'submit_versioned_intercycle_form':'submit_intercycle_anamnesis';
    const payload=versioned?{_token_sha256:item.hash,_definition_id:definition.id,_answers:answers,_payload:answers}:{_token_sha256:item.hash,_prescription_evaluation:'better',_goals_continue:true,_new_goals:null,_availability_changed:false,_available_days:[],_session_duration_minutes:null,_training_location:null,_available_equipment:null,_pain_present:false,_pain_location:null,_pain_eva:null,_pain_started_at:null,_pain_movement:null,_additional_information:null,_sensitive_consent:true,_consent_text_version:'intercycle-sensitive-v1'};
    const result=await api(`/rest/v1/rpc/${endpoint}`,{method:'POST',admin:true,body:payload});assert.equal(result.ok,true,`response HTTP${result.status} code=${result.data?.code||''}`);
    const [delivery]=await read('intercycle_anamnesis_deliveries',`id=eq.${item.delivery.id}&select=status,last_error_code`);assert.equal(delivery.status,'responded');assert.equal(delivery.last_error_code,null);
    assert.equal((await api(`/rest/v1/rpc/${endpoint}`,{method:'POST',admin:true,body:payload})).ok,false,'token replay must still fail');
    assert.deepEqual((await read('automation_dispatch_attempts',`owner_id=eq.${item.delivery.id}&select=state`)).map(row=>row.state),['in_flight'],'response does not fabricate a provider ACK');
    assert.equal((await queue(people.admin.token)).data.length,0,'resolved case leaves queue');
  });
  privateFile('recovery-status-evidence.private.json',JSON.stringify({stage:'passed',company,deliveries,authRoles:['admin','foreign','student','anon'],providerCalls:0}));
});
