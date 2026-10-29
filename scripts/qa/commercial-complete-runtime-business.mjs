import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {lit,privateFile,qi} from './commercial-complete-runtime.mjs';

export function signLocal(secret,role,sub){
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const head=enc({alg:'HS256',typ:'JWT'}),body=enc({role,sub,aud:'authenticated',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+1800});
 return `${head}.${body}.${createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')}`;
}
export function actor(rt,who,query,{allowError=false,role='authenticated',commit=false}={}){
 const claims=JSON.stringify({role,sub:who});const actorClass=rt.actorClasses?.[who]||(role==='anon'?'anonymous':'synthetic');const entry=query.match(/(?:public|complete_probe)\.([a-z_]+)\(/)?.[1]||'direct-table-operation';return rt.sql(`begin;set local role ${qi(role)};select set_config('request.jwt.claims',${lit(claims)},true);select set_config('request.jwt.claim.sub',${lit(who||'')},true);select set_config('request.jwt.claim.role',${lit(role)},true);${query};${commit?'commit':'rollback'};`,{allowError,phase:`business actor=${actorClass} entry=${entry}`});
}
const outputLine=(r,prefix)=>r.stdout.split('\n').find(l=>l.startsWith(prefix))?.slice(prefix.length);
export function denied(rt,who,q,{states=['42501'],role='authenticated'}={}){
 const r=actor(rt,who,q,{allowError:true,role});const label=rt.actorClasses?.[who]||(role==='anon'?'anonymous':'synthetic');const entry=q.match(/(?:public|complete_probe)\.([a-z_]+)\(/)?.[1]||'direct-table-operation';assert.notEqual(r.status,0,`Expected denial: actor=${label},entry=${entry},exit=${r.status},sqlstate=${r.states.join(',')||'none'}`);assert.ok(r.states.some(s=>states.includes(s)),`Expected denial SQLSTATE, received ${r.states.join(',')||'none'}`);return r.states;
}
export async function seedSynthetic(rt,auth){
 const ids={company:randomUUID(),foreignCompany:randomUUID(),student:randomUUID(),enrollment:randomUUID(),plan:randomUUID(),lead:randomUUID(),workout:randomUUID(),session:randomUUID()};
 const users={},tokens={},password=randomBytes(24).toString('hex')+'aA1!';
 const service=signLocal(auth.jwtSecret,'service_role');
 for(const label of ['admin','master','coordinator','assigned','unassigned','foreign','student']){
  const r=rt.http(`http://${auth.svc.name}:9999/admin/users`,{method:'POST',headers:{Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:{email:`${label}-${rt.token}@example.invalid`,password,email_confirm:true,user_metadata:{full_name:`Synthetic ${label}`}}});
  assert.equal(r.status,200,`Actual GoTrue create synthetic ${label}: HTTP ${r.status}`);assert.ok(r.body?.id);users[label]=r.body.id;
  const session=rt.http(`http://${auth.svc.name}:9999/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json'},body:{email:`${label}-${rt.token}@example.invalid`,password}});
  assert.equal(session.status,200,`Actual GoTrue signin synthetic ${label}: HTTP ${session.status}`);assert.ok(session.body?.access_token);tokens[label]=session.body.access_token;
 }
 rt.actorClasses=Object.fromEntries(Object.entries(users).map(([label,id])=>[id,label]));
 privateFile(rt.dir,'synthetic-actors.private.json',JSON.stringify({users,tokens,ids}));
 const who=Object.values(users).map(lit).join(',');
 rt.sql(`begin;select set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.companies(id,name,tier) values(${lit(ids.company)},'Synthetic complete A','basic'),(${lit(ids.foreignCompany)},'Synthetic complete B','basic');
 delete from public.user_roles where user_id in (${who});
 insert into public.user_roles(user_id,role) values ${Object.entries(users).map(([label,id])=>`(${lit(id)},${lit(['assigned','unassigned'].includes(label)?'trainer':label==='foreign'?'admin':label)}::public.app_role)`).join(',')};
 insert into public.company_members(company_id,user_id) values ${['admin','coordinator','assigned','unassigned'].map(k=>`(${lit(ids.company)},${lit(users[k])})`).join(',')},(${lit(ids.foreignCompany)},${lit(users.foreign)});
 insert into public.students(id,user_id,company_id,assigned_trainer_id,full_name,status,sales_stage) values(${lit(ids.student)},${lit(users.student)},${lit(ids.company)},${lit(users.assigned)},'Synthetic complete student','active','interested');
 insert into public.plans(id,company_id,name,duration_weeks,duration_days) values(${lit(ids.plan)},${lit(ids.company)},'Synthetic 12 weeks',12,84);
 insert into public.enrollments(id,company_id,student_id,trainer_id,plan_id,status,training_start_date,start_date,end_date) values(${lit(ids.enrollment)},${lit(ids.company)},${lit(ids.student)},${lit(users.assigned)},${lit(ids.plan)},'active',public.current_business_date(),public.current_business_date(),public.current_business_date()+83);
 insert into public.leads(id,company_id,full_name,stage) values(${lit(ids.lead)},${lit(ids.company)},'Synthetic complete lead','interested');
 commit;`,{phase:'synthetic-core-seed'});
 const cycles=JSON.parse(rt.value(`select coalesce(jsonb_agg(jsonb_build_object('id',id,'start_date',start_date,'end_date',end_date,'status',status) order by start_date),'[]'::jsonb) from public.training_cycles where enrollment_id=${lit(ids.enrollment)}`));
 assert.ok(cycles.length>=2,'Real enrollment trigger must generate current and future cycles');ids.cycle=cycles[0].id;ids.futureCycle=cycles[1].id;
 rt.sql(`begin;select set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.workouts(id,cycle_id,company_id,name,title,exercises) values(${lit(ids.workout)},${lit(ids.cycle)},${lit(ids.company)},'Synthetic real history','Synthetic actual content','[{"name":"Synthetic squat","sets":"3","reps":"8"}]');
 insert into public.workout_sessions(id,student_id,company_id,workout_id,status,completed_at) values(${lit(ids.session)},${lit(ids.student)},${lit(ids.company)},${lit(ids.workout)},'completed',now());commit;`,{phase:'synthetic-history-seed'});
 return {ids,users,tokens,cycles,businessDate:rt.value('select public.current_business_date()')};
}
export function bindOriginals(rt){
 const specs=[
  ['get_company_dashboard_snapshot','_company_id uuid','jsonb'],
  ['reassign_student_trainer','_student_id uuid,_trainer_id uuid,_expected_trainer_id uuid','TABLE(student_id uuid,previous_trainer_id uuid,trainer_id uuid,updated_enrollments integer)'],
  ['set_registration_lead_stage','_company_id uuid,_entity_type text,_record_id uuid,_expected_stage text,_target_stage text','jsonb'],
  ['reschedule_training_cycles_from','p_enrollment_id uuid,p_cycle_id uuid,p_new_start_date date','void'],
 ];
 rt.sql(`create schema complete_probe;revoke all on schema complete_probe from public;grant usage on schema complete_probe to authenticated;${specs.map(([name,args,result])=>`create function complete_probe.${name}(${args}) returns ${result} language sql security definer begin atomic select * from public.${name}(${args.split(',').map(a=>a.trim().split(' ')[0]).join(',')});end;revoke all on function complete_probe.${name}(${args.split(',').map(a=>a.trim().split(' ')[1]).join(',')}) from public;grant execute on function complete_probe.${name}(${args.split(',').map(a=>a.trim().split(' ')[1]).join(',')}) to authenticated;`).join('\n')}`,{phase:'prebound-old-oids'});
}
export function baselineBusiness(rt,s){
 const {ids:i,users:u}=s,checks=[];
 const check=(name,fn)=>{fn();checks.push(name);console.log(`BUSINESS ${name}`);};
 const helper=(who,name,args)=>outputLine(actor(rt,u[who],`select 'VALUE='||public.${name}(${args})`),'VALUE=');
 check('actual helper role/tenant/assignment matrix',()=>{
  for(const who of ['admin','master','coordinator','assigned','unassigned'])assert.equal(helper(who,'can_manage_staff_student',`${lit(i.company)},${lit(i.student)}`),'true',who);
  for(const who of ['foreign','student'])assert.equal(helper(who,'can_manage_staff_student',`${lit(i.company)},${lit(i.student)}`),'false',who);
  for(const who of ['admin','coordinator','assigned','unassigned'])assert.equal(helper(who,'is_company_staff',`${lit(u[who])},${lit(i.company)}`),'true',who);
  assert.equal(helper('foreign','is_company_staff',`${lit(u.foreign)},${lit(i.company)}`),'false');
 });
 const calls=[
  `select public.get_company_dashboard_snapshot(${lit(i.company)})`,
  `select * from public.reassign_student_trainer(${lit(i.student)},${lit(u.unassigned)},${lit(u.assigned)})`,
  `select public.set_registration_lead_stage(${lit(i.company)},'lead',${lit(i.lead)},'interested','lost')`,
  `select public.reschedule_training_cycles_from(${lit(i.enrollment)},${lit(i.cycle)},public.current_business_date()+2)`,
 ];
 check('four original RPCs: actual business authorization positive and foreign/student denial',()=>{
  for(const q of calls){assert.equal(actor(rt,u.admin,q).status,0);for(const who of ['foreign','student'])denied(rt,u[who],q,{states:['42501','P0001']});}
 });
 check('actual assignment updates student plus enrollment; stale expected trainer denied',()=>{
  const r=actor(rt,u.admin,`${calls[1]};select 'ASSIGN='||assigned_trainer_id from public.students where id=${lit(i.student)};select 'ENROLL='||trainer_id from public.enrollments where id=${lit(i.enrollment)}`);
  assert.equal(outputLine(r,'ASSIGN='),u.unassigned);assert.equal(outputLine(r,'ENROLL='),u.unassigned);
  denied(rt,u.admin,`select * from public.reassign_student_trainer(${lit(i.student)},${lit(u.unassigned)},${lit(u.foreign)})`,{states:['40001']});
 });
 check('actual lead stage transition and optimistic concurrency',()=>{
  assert.equal(outputLine(actor(rt,u.admin,`${calls[2]};select 'STAGE='||stage from public.leads where id=${lit(i.lead)}`),'STAGE='),'lost');
  denied(rt,u.admin,`select public.set_registration_lead_stage(${lit(i.company)},'lead',${lit(i.lead)},'lost','lost')`,{states:['40001']});
 });
 check('actual date/status reschedule preserves workouts and completed session history',()=>verifyShift(rt,s,calls[3],u.admin));
 check('explicit dashboard grant preserves actual same-company staff management and RPC role checks',()=>{
  assert.equal(actor(rt,u.unassigned,calls[1]).status,0,'Actual same-company trainer reassignment is already permitted before dashboard grant');
  actor(rt,u.admin,`select public.set_staff_permission(${lit(i.company)},${lit(u.unassigned)},'company_dashboard_full',true)`,{commit:true});
  assert.equal(helper('unassigned','has_staff_permission',`${lit(i.company)},'company_dashboard_full'`),'true');
  assert.equal(helper('unassigned','can_read_staff_student',`${lit(i.company)},${lit(i.student)}`),'true');
  assert.equal(helper('unassigned','can_manage_staff_student',`${lit(i.company)},${lit(i.student)}`),'true');
  assert.equal(actor(rt,u.unassigned,calls[0]).status,0);assert.equal(actor(rt,u.unassigned,calls[1]).status,0);
 });
 return {checks,calls};
}
export function verifyShift(rt,s,call,who){
 const {ids:i}=s;
 const historyCycles=(s.historyCycleIds||[]).map(lit).join(',')||'null';
 const before=rt.value(`select md5(jsonb_build_object('frozenCycles',(select jsonb_agg(to_jsonb(c) order by id) from training_cycles c where id in (${historyCycles})),'workouts',(select jsonb_agg(to_jsonb(w)) from workouts w where cycle_id=${lit(i.cycle)}),'sessions',(select jsonb_agg(to_jsonb(w)) from workout_sessions w where id=${lit(i.session)}))::text)`);
 const r=actor(rt,who,`${call};select 'SHIFT='||((select start_date from training_cycles where id=${lit(i.cycle)})=public.current_business_date()+2)::text;select 'STATUS='||((select status from training_cycles where id=${lit(i.cycle)})=case when (select end_date from training_cycles where id=${lit(i.cycle)})<public.current_business_date() then 'completed' when public.current_business_date() between (select start_date from training_cycles where id=${lit(i.cycle)}) and (select end_date from training_cycles where id=${lit(i.cycle)}) then 'active' else 'pending' end)::text;select 'HISTORY='||md5(jsonb_build_object('frozenCycles',(select jsonb_agg(to_jsonb(c) order by id) from training_cycles c where id in (${historyCycles})),'workouts',(select jsonb_agg(to_jsonb(w)) from workouts w where cycle_id=${lit(i.cycle)}),'sessions',(select jsonb_agg(to_jsonb(w)) from workout_sessions w where id=${lit(i.session)}))::text)`);
 assert.equal(outputLine(r,'SHIFT='),'true');assert.equal(outputLine(r,'STATUS='),'true');assert.equal(outputLine(r,'HISTORY='),before);
}

export function postBusiness(rt,s){
 const {ids:i,users:u}=s,checks=[];
 const check=(name,fn)=>{fn();checks.push(name);console.log(`BUSINESS ${name}`);};
 const calls=namespace=>[
  `select ${namespace}.get_company_dashboard_snapshot(${lit(i.company)})`,
  `select * from ${namespace}.reassign_student_trainer(${lit(i.student)},${lit(u.unassigned)},${lit(u.assigned)})`,
  `select ${namespace}.set_registration_lead_stage(${lit(i.company)},'lead',${lit(i.lead)},'interested','lost')`,
  `select ${namespace}.reschedule_training_cycles_from(${lit(i.enrollment)},${lit(i.cycle)},public.current_business_date()+2)`,
 ];
 const adopt=features=>{
  rt.sql(`update public.platform_product_settings set version=version+1,settings=jsonb_set(settings,'{tiers,basic,features}',(select jsonb_object_agg(k,k=any(array[${features.map(lit).join(',')}]::text[])) from unnest(commercial_private.feature_keys()) k));`,{phase:'synthetic-catalog-update'});
  const versions=JSON.parse(rt.value(`select jsonb_build_object('policy',coalesce((select version from public.company_feature_policies where company_id=${lit(i.company)}),0),'catalog',(select version from public.platform_product_settings))`));
  actor(rt,u.master,`select public.set_company_feature_policy(${lit(i.company)},'catalog',${versions.policy},${versions.catalog},true)`,{commit:true});
 };
 check('legacy four RPCs retain actual business behavior through public and prebound OIDs',()=>{for(const ns of ['public','complete_probe'])for(const q of calls(ns))assert.equal(actor(rt,u.admin,q).status,0);});
 adopt([]);
 check('all capabilities disabled: all four public and old-OID entries deny',()=>{for(const ns of ['public','complete_probe'])for(const q of calls(ns))denied(rt,u.admin,q);});
 adopt(['hasDashboard']);
 check('Dashboard capability intersects original tenant/role authorization',()=>{for(const ns of ['public','complete_probe']){assert.equal(actor(rt,u.admin,calls(ns)[0]).status,0);denied(rt,u.foreign,calls(ns)[0]);denied(rt,u.student,calls(ns)[0]);}});
 adopt(['hasStudents']);
 check('Students capability allows actual reassign and retains stale expected trainer rejection',()=>{
  for(const ns of ['public','complete_probe']){assert.equal(actor(rt,u.admin,calls(ns)[1]).status,0);assert.equal(actor(rt,u.assigned,calls(ns)[1]).status,0);denied(rt,u.foreign,calls(ns)[1]);denied(rt,u.admin,`select * from ${ns}.reassign_student_trainer(${lit(i.student)},${lit(u.unassigned)},${lit(u.foreign)})`,{states:['40001']});}
 });
 adopt(['hasRegistration']);
 check('Registration capability preserves actual lead transition/OCC for both entries',()=>{
  for(const ns of ['public','complete_probe']){assert.equal(actor(rt,u.admin,calls(ns)[2]).status,0);denied(rt,u.foreign,calls(ns)[2]);denied(rt,u.admin,`select ${ns}.set_registration_lead_stage(${lit(i.company)},'lead',${lit(i.lead)},'lost','lost')`,{states:['40001']});}
 });
 adopt(['hasAgenda']);
 check('Agenda-only actual dates/statuses and completed workout history through public and old OID',()=>{
  for(const ns of ['public','complete_probe'])verifyShift(rt,s,calls(ns)[3],u.admin);
  assert.equal(rt.value('select count(*) from commercial_private.agenda_reschedule_authorizations'),'0');
 });
 check('Agenda-only direct status/publication/identity edits and private context insertion denied',()=>{
  for(const q of [`update public.training_cycles set status='completed' where id=${lit(i.cycle)}`,`update public.training_cycles set prescribed_offline_at=now() where id=${lit(i.cycle)}`,`update public.training_cycles set student_id=${lit(randomUUID())} where id=${lit(i.cycle)}`,`insert into commercial_private.agenda_reschedule_authorizations(transaction_id) values(txid_current())`])denied(rt,u.admin,q);
 });
 adopt(['hasPrescription']);
 check('Prescription alternative allows actual reschedule and reassignment',()=>{for(const ns of ['public','complete_probe'])for(const q of [calls(ns)[1],calls(ns)[3]])assert.equal(actor(rt,u.admin,q).status,0);});
 return {checks,limits:['Synthetic sequential OCC checks; no concurrent multi-session race test','No real messages, provider credentials or payment execution','Full hosted binaries and extension-version parity not asserted']};
}
export async function startRest(rt,auth){
 rt.sql(`alter role authenticator login password ${lit(auth.password)};`,{phase:'independent-rest-transport'});
 const svc=rt.startService('rest','public.ecr.aws/supabase/postgrest:v14.10',{
  PGRST_DB_URI:`postgres://authenticator:${auth.password}@${rt.name}:5432/postgres`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:auth.jwtSecret,PGRST_JWT_AUD:'authenticated',PGRST_SERVER_PORT:'3000',PGRST_DB_POOL:'5',PGRST_LOG_LEVEL:'error',
 });
 for(let n=0;n<80;n++){if(!rt.inspectService(svc).State.Running)break;if(rt.http(`http://${svc.name}:3000/`).status===200)return svc;await new Promise(r=>setTimeout(r,250));}
 throw Error('Actual PostgREST readiness failed');
}

export function seedPriorHistoryCycles(rt,s){
 const completed=randomUUID(),superseded=randomUUID(),{ids:i}=s;
 rt.sql(`begin;select set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into public.training_cycles(id,company_id,student_id,enrollment_id,cycle_number,start_date,end_date,status,name) values(${lit(completed)},${lit(i.company)},${lit(i.student)},${lit(i.enrollment)},0,public.current_business_date()-42,public.current_business_date()-1,'completed','Synthetic preserved completed');
 insert into public.training_cycles(id,company_id,student_id,enrollment_id,cycle_number,start_date,end_date,status,name,superseded_by_cycle_id) values(${lit(superseded)},${lit(i.company)},${lit(i.student)},${lit(i.enrollment)},-1,public.current_business_date()-84,public.current_business_date()-43,'superseded','Synthetic preserved superseded',${lit(i.cycle)});commit;`,{phase:'actual-prior-cycle-history-seed'});
 s.historyCycleIds=[completed,superseded];privateFile(rt.dir,'synthetic-history-ids.private.json',JSON.stringify(s.historyCycleIds));
}
