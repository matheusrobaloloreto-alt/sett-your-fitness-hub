import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {Runtime,repo,lit,sha} from './commercial-complete-runtime.mjs';
const dir=path.resolve(process.argv[2]||'');
if(!dir.startsWith(path.join(repo,'output/self-service-local-20261026/sett-complete-'))||!dir.endsWith('.private'))throw Error('Owned synthetic preview required');
const state=JSON.parse(readFileSync(path.join(dir,'preview-state.private.json')));
const rt=Object.assign(new Runtime(),{token:state.token,name:state.name,network:state.network,imageId:state.imageId,dir,sqlUser:'postgres'});rt.inspect();
const c=lit(state.synthetic.ids.company),u=lit(state.synthetic.users.admin),other=lit(state.synthetic.users.foreign);
const migration=readFileSync(path.join(repo,'supabase/migrations/20261028143001_atomic_lead_conversion.sql'),'utf8');
const assertions=`
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $qa$
declare leadid uuid:=gen_random_uuid();lead2 uuid:=gen_random_uuid();l3 uuid:=gen_random_uuid();existing uuid;v jsonb;v2 jsonb;count_before integer;stamp timestamptz:=now();
begin
 assert commercial_private.registration_phone_key('14155552671','US','e164')='14155552671';
 assert commercial_private.registration_phone_key('1132345678','BR','national')='551132345678';
 assert commercial_private.registration_phone_key('551132345678','BR','e164')='551132345678';
 assert commercial_private.registration_phone_key('48990000101','BR','national')='5548990000101';
 assert commercial_private.registration_phone_key('14155552671','','e164') is null;
 assert not has_function_privilege('authenticated','public.convert_lead_to_fiscal_atomic(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text)','execute');
 assert not has_function_privilege('anon','public.prepare_registration_link_atomic(uuid,uuid)','execute');
 insert into public.leads(id,company_id,full_name,phone,stage,updated_at,pre_registration_answers)
 values(leadid,${c},'Synthetic atomic lead','48990000101','contacted',stamp,'{"extra_note":"retained"}');
 begin
  perform public.convert_lead_to_fiscal_atomic(leadid,${other},stamp,'{}','{}','BR','national','5548990000101');raise exception 'Foreign actor was allowed';
 exception when insufficient_privilege then null;end;
 begin
  perform public.convert_lead_to_fiscal_atomic(leadid,${u},stamp-interval '1 second','{}','{}','BR','national','5548990000101');raise exception 'Stale version was allowed';
 exception when sqlstate 'PT409' then null;end;
 v:=public.convert_lead_to_fiscal_atomic(leadid,${u},stamp,'{"objective":"saude"}','{"weight_kg":70,"height_cm":170}','BR','national','5548990000101');
 assert v->>'messageSent'='false';assert (v->>'studentId')::uuid is not null;
 assert (select count(*)=1 from public.student_anamneses where student_id=(v->>'studentId')::uuid and custom_answers->>'extra_note'='retained');
 assert (select count(*)=1 from public.student_anamnesis_history where student_id=(v->>'studentId')::uuid);
 v2:=public.convert_lead_to_fiscal_atomic(leadid,${u},stamp,'{"objective":"must_not_replace"}','{"weight_kg":999}','BR','national','5548990000101');
 assert v->>'token'=v2->>'token';assert v->>'studentId'=v2->>'studentId';
 assert (select weight_kg=70 from public.students where id=(v->>'studentId')::uuid);
 assert (select objective='saude' from public.student_anamneses where student_id=(v->>'studentId')::uuid);
 assert (select count(*)=1 from public.student_funnel_events where event_key='lead_converted:'||leadid::text);
 v2:=public.prepare_registration_link_atomic((v->>'studentId')::uuid,${u});assert v2->>'token'=v->>'token';
 update public.leads set phone='48990000998' where id=leadid;
 begin
  perform public.convert_lead_to_fiscal_atomic(leadid,${u},stamp,'{}','{}','BR','national','5548990000998');raise exception 'Replay identity drift was allowed';
 exception when sqlstate 'PT409' then null;end;
 update public.leads set phone='48990000101' where id=leadid;

 -- Confirmation is tied to the operator-visible phone, not a fresh Edge read.
 insert into public.leads(id,company_id,full_name,phone,stage,updated_at) values(l3,${c},'Synthetic changed phone','48990000999','contacted',stamp);
 begin
  perform public.convert_lead_to_fiscal_atomic(l3,${u},stamp,'{}','{}','BR','national','5548990000102');raise exception 'Changed confirmation was allowed';
 exception when sqlstate 'PT409' then null;end;
 assert (select converted_to_student_id is null from public.leads where id=l3);
 delete from public.leads where id=l3;
 -- Existing active student must retain identity, fiscal status, metrics and health.
 insert into public.students(company_id,full_name,phone,whatsapp,status,weight_kg) values(${c},'Synthetic existing','5548990000102','5548990000102','active',80) returning id into existing;
 insert into public.student_anamneses(student_id,company_id,objective,custom_answers) values(existing,${c},'original','{"keep":true}');
 insert into public.leads(id,company_id,full_name,phone,stage,updated_at) values(lead2,${c},'Synthetic match','48990000102','contacted',stamp);
 v:=public.convert_lead_to_fiscal_atomic(lead2,${u},stamp,'{"objective":"replacement"}','{"weight_kg":999}','BR','national','5548990000102');
 assert (v->>'studentId')::uuid=existing;
 assert (select status='active' and weight_kg=80 from public.students where id=existing);
 assert (select objective='original' and custom_answers->>'keep'='true' from public.student_anamneses where student_id=existing);
 -- Financial stage is authoritative even in a historically inconsistent status row.
 update public.students set status='interested',sales_stage='payment_pending' where id=existing;
 v2:=public.prepare_registration_link_atomic(existing,${u});
 assert (select sales_stage='payment_pending' and status='interested' from public.students where id=existing);
 assert v2->'student'->>'sales_stage'='payment_pending';
 -- Two candidates are never selected arbitrarily.
 insert into public.students(company_id,full_name,phone,status) values(${c},'Synthetic ambiguous','48990000102','interested');
 insert into public.leads(id,company_id,full_name,phone,stage,updated_at) values(l3,${c},'Synthetic ambiguous lead','48990000102','contacted',stamp);
 begin
  perform public.convert_lead_to_fiscal_atomic(l3,${u},stamp,'{}','{}','BR','national','5548990000102');raise exception 'Ambiguous identity was allowed';
 exception when sqlstate 'PT409' then null;end;
 assert (select converted_to_student_id is null from public.leads where id=l3);
end $qa$;
-- Failure at the last write must roll back student/anamnesis/link/lead together.
create function pg_temp.reject_atomic_audit() returns trigger language plpgsql as $$begin if new.event_type='lead_converted' then raise exception 'Synthetic final-step failure' using errcode='P7777';end if;return new;end$$;
create trigger qa_atomic_failure before insert on public.student_funnel_events for each row execute function pg_temp.reject_atomic_audit();
do $qa$
declare rollback_lead uuid:=gen_random_uuid();stamp timestamptz:=now();before_count bigint;
begin
 insert into public.leads(id,company_id,full_name,phone,stage,updated_at) values(rollback_lead,${c},'Synthetic rollback','48990000103','contacted',stamp);
 select count(*) into before_count from public.students where company_id=${c};
 begin
  perform public.convert_lead_to_fiscal_atomic(rollback_lead,${u},stamp,'{}','{}','BR','national','5548990000103');raise exception 'Injected failure did not abort';
 exception when sqlstate 'P7777' then null;end;
 assert (select converted_to_student_id is null and stage='contacted' from public.leads where leads.id=rollback_lead);
 assert (select count(*)=before_count from public.students where company_id=${c});
 assert not exists(select 1 from public.students where company_id=${c} and phone='5548990000103');
end $qa$;
select 'ATOMIC_ACCEPTANCE_PASS';
`;
const installed=rt.value("select to_regprocedure('public.convert_lead_to_fiscal_atomic(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text)') is not null").trim()==='t';
if(installed)throw Error('Fresh pre-migration owned fixture required; signature presence is not source proof');
const result=rt.sql('begin;\n'+migration+'\n'+assertions+'\nrollback;',{allowError:true,phase:'atomic-transaction-rollback-acceptance'});
const evidence={syntheticOnly:true,migrationSha256:sha(migration),accepted:result.status===0&&result.stdout.includes('ATOMIC_ACCEPTANCE_PASS'),states:result.states,noDeploy:true,rolledBack:true};
writeFileSync(path.join(dir,'atomic-acceptance-'+Date.now()+'.json'),JSON.stringify(evidence,null,2),{mode:0o600});
console.log(JSON.stringify(evidence));if(!evidence.accepted)process.exitCode=1;
