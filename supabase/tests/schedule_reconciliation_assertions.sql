-- All assertions use synthetic IDs in the disposable fixture database.
create function pg_temp.expect_error(statement text, fragment text) returns void language plpgsql as $$
declare message text;
begin
 begin execute statement; exception when others then get stacked diagnostics message=message_text; end;
 if message is null or position(fragment in message)=0 then raise exception 'expected error %, got %',fragment,message; end if;
end $$;
do $$begin
 assert (select count(*) from public.training_cycles where enrollment_id='00000005-0000-4000-8000-000000000001')=9,'actual contract coverage';
 assert (select max(end_date) from public.training_cycles)='2026-12-31'::date,'inclusive last day';
 assert (select min(start_date) from public.training_cycles)='2026-01-01'::date,'historical training start must not consume term';
end $$;
select public.reconcile_prescription_schedule('00000005-0000-4000-8000-000000000001');
do $$begin
 assert jsonb_array_length(public.reconcile_prescription_schedule('00000005-0000-4000-8000-000000000001')->'created_cycle_ids')=0,'idempotency';
 assert (select count(*) from public.workouts)=0,'slots cannot create workouts';
 assert (select count(*) from public.training_cycles where status='active')=0,'slots cannot publish/activate training';
 assert (select bool_and(not (c->>'has_usable_workouts')::boolean) from jsonb_array_elements(public.get_prescription_schedule('00000005-0000-4000-8000-000000000001')->'cycles') c),'delivery must be false';
end $$;
create table schedule_original_snapshot as select id,to_jsonb(c) value from public.training_cycles c;
update public.enrollments set end_date='2027-02-01' where id='00000005-0000-4000-8000-000000000001';
do $$begin assert (select max(end_date) from public.training_cycles)='2027-02-01'::date,'end-only update triggers reconciliation'; end $$;
update public.enrollments set plan_id='00000004-0000-4000-8000-000000000002',start_date='2025-12-01' where id='00000005-0000-4000-8000-000000000001';
do $$begin
 assert (select min(start_date) from public.training_cycles)='2025-12-01'::date,'plan/start update triggers reconciliation';
 assert not exists(select 1 from schedule_original_snapshot s join public.training_cycles c on c.id=s.id where to_jsonb(c) is distinct from s.value),'identities, content, phase and dates preserved';
end $$;
-- A late offline history row with a large number never reduces current term coverage.
insert into public.training_cycles(enrollment_id,company_id,student_id,cycle_number,start_date,end_date,status,prescribed_offline_at)
values('00000005-0000-4000-8000-000000000001','00000002-0000-4000-8000-000000000001','00000003-0000-4000-8000-000000000001',98,'2025-01-01','2025-02-11','completed','2025-01-01');
select public.reconcile_prescription_schedule('00000005-0000-4000-8000-000000000001');
do $$declare patch text; table_name text; column_name text; message text; cycle_id uuid;
begin
 select id into cycle_id from public.training_cycles where cycle_number=1;
 foreach patch in array array['prescribed_offline_at=now()', 'prescribed_offline_by=''00000001-0000-4000-8000-000000000001''',
  'prescribed_offline_note=''Synthetic marker''','workouts=''[{"synthetic":true}]''::jsonb','delivery_status=''published''','notes=''Synthetic context''','prescription_cleared_at=now()'] loop
  message:=null;
  begin
   execute 'update public.training_cycles set '||patch||' where id=$1' using cycle_id;
   update public.training_cycles set status='superseded' where id=cycle_id;
   raise exception 'unexpected quarantine success';
  exception when others then get stacked diagnostics message=message_text;
   assert position('schedule_quarantine_has_content_or_history' in message)>0,message;
  end;
 end loop;
 for table_name,column_name in select * from (values ('workouts','cycle_id'),('cycle_feedback','cycle_id'),('ai_plan_versions','cycle_id'),('ai_strength_plans','training_cycle_id'),('running_plans','training_cycle_id'),('nutrition_plans','training_cycle_id'),('prescription_bundles','training_cycle_id'),('cycle_attachments','cycle_id')) v(t,c) loop
  message:=null;
  begin
   execute format('insert into public.%I(%I) values($1)',table_name,column_name) using cycle_id;
   update public.training_cycles set status='superseded' where id=cycle_id;
   raise exception 'unexpected dependency quarantine success';
  exception when others then get stacked diagnostics message=message_text;
   assert position('schedule_quarantine_has_content_or_history' in message)>0,message;
  end;
 end loop;
end $$;
select pg_temp.expect_error($q$update public.training_cycles set status='superseded' where cycle_number=2$q$,'schedule_quarantine_would_open_contract_gap');
select pg_temp.expect_error($q$select public.reconcile_prescription_schedule('00000005-0000-4000-8000-000000000001','{}')$q$,'schedule_contract_changed');
-- JSON objects in old workout rows are not usable workouts and must not crash readback.
insert into public.workouts(cycle_id,exercises) select id,'{}'::jsonb from public.training_cycles where cycle_number=1;
do $$begin assert not (select (c->>'has_usable_workouts')::boolean from jsonb_array_elements(public.get_prescription_schedule('00000005-0000-4000-8000-000000000001')->'cycles') c where c->>'cycle_number'='1'); end $$;
-- Tenant-scoped read, authenticated role permissions and student-write denial.
set role authenticated;
set test.actor='00000001-0000-4000-8000-000000000003';
select pg_temp.expect_error($q$select public.get_prescription_schedule('00000005-0000-4000-8000-000000000001')$q$,'schedule_access_denied');
set test.actor='00000001-0000-4000-8000-000000000002';
select public.get_prescription_schedule('00000005-0000-4000-8000-000000000001')->'contract'->>'enrollment_id';
select pg_temp.expect_error($q$select public.reconcile_prescription_schedule('00000005-0000-4000-8000-000000000001')$q$,'schedule_access_denied');
reset role;
set test.actor='00000001-0000-4000-8000-000000000001';
select 'SCHEDULE_ASSERTIONS_PASSED';
-- Restore first, then reconcile: restored calendar slots are reused by interval.
insert into public.enrollments(id,student_id,company_id,plan_id,status,start_date,end_date,training_start_date)
values('00000005-0000-4000-8000-000000000002','00000003-0000-4000-8000-000000000001','00000002-0000-4000-8000-000000000001','00000004-0000-4000-8000-000000000001','completed','2026-01-01','2026-12-31','2025-01-01');
insert into public.training_cycles(enrollment_id,company_id,student_id,cycle_number,start_date,end_date,status)
select '00000005-0000-4000-8000-000000000002','00000002-0000-4000-8000-000000000001','00000003-0000-4000-8000-000000000001',20+n,date '2026-01-01'+n*42,least(date '2026-12-31',date '2026-01-01'+n*42+41),'superseded' from generate_series(0,8) n;
insert into public.training_cycles(enrollment_id,company_id,student_id,cycle_number,start_date,end_date,status,prescribed_offline_at)
select '00000005-0000-4000-8000-000000000002','00000002-0000-4000-8000-000000000001','00000003-0000-4000-8000-000000000001',n,date '2025-01-01'+n*42,date '2025-01-01'+n*42+41,'superseded',date '2025-01-01' from generate_series(1,6) n;
update public.training_cycles set status=case when cycle_number<20 then 'completed' else 'pending' end where enrollment_id='00000005-0000-4000-8000-000000000002';
update public.enrollments set status='active' where id='00000005-0000-4000-8000-000000000002';
do $$begin
 assert jsonb_array_length(public.reconcile_prescription_schedule('00000005-0000-4000-8000-000000000002')->'created_cycle_ids')=0,'restored slots must not duplicate';
 assert (select count(*) from public.training_cycles where enrollment_id='00000005-0000-4000-8000-000000000002')=15,'offline history plus restored calendar preserved';
 assert (select count(*) from public.training_cycles where enrollment_id='00000005-0000-4000-8000-000000000002' and prescribed_offline_at is not null)=6,'offline history retained';
end $$;
-- Legacy callers retain their two-argument API but cannot choose an expired active enrollment.
insert into public.enrollments(id,student_id,company_id,plan_id,status,start_date,end_date,training_start_date)
values('00000005-0000-4000-8000-000000000003','00000003-0000-4000-8000-000000000001','00000002-0000-4000-8000-000000000001','00000004-0000-4000-8000-000000000001','active','2024-01-01','2024-02-01','2024-01-01');
do $$begin
 assert not exists(select 1 from public.sync_prescription_cycles('00000003-0000-4000-8000-000000000001',null) where enrollment_id='00000005-0000-4000-8000-000000000003'),'legacy sync must reject stale active dates';
 assert exists(select 1 from public.sync_prescription_cycles('00000003-0000-4000-8000-000000000001',null)),'legacy sync returns actual schedule';
end $$;

-- A canonical target referenced by another cycle is also historical evidence.
do $$declare target_id uuid; message text;
begin
 select id into target_id from public.training_cycles where enrollment_id='00000005-0000-4000-8000-000000000001' and cycle_number=1;
 begin
  update public.training_cycles set superseded_by_cycle_id=target_id where enrollment_id='00000005-0000-4000-8000-000000000001' and cycle_number=2;
  update public.training_cycles set status='superseded' where id=target_id;
  raise exception 'unexpected canonical target quarantine';
 exception when others then
  get stacked diagnostics message=message_text;
  assert position('schedule_quarantine_has_content_or_history' in message)>0,message;
 end;
end $$;

-- Retired workout revisions preserve history but cannot certify current content.
insert into public.workouts(cycle_id,exercises,superseded_at) select id,'[{"exercise_id":"synthetic"}]'::jsonb,now() from public.training_cycles where enrollment_id='00000005-0000-4000-8000-000000000001' and cycle_number=2;
do $$declare row_value jsonb;begin
 select c into row_value from jsonb_array_elements(public.get_prescription_schedule('00000005-0000-4000-8000-000000000001')->'cycles') c where c->>'cycle_number'='2';
 assert not (row_value->>'has_usable_workouts')::boolean,'retired revision is not usable';
 assert not (row_value->>'has_workouts')::boolean,'retired revision is not current';
 assert (row_value->>'has_history')::boolean,'retired revision remains history';
end $$;
-- A future training start within a commercial term must not be advanced to its purchase date.
insert into public.enrollments(id,student_id,company_id,plan_id,status,start_date,end_date,training_start_date)
values('00000005-0000-4000-8000-000000000004','00000003-0000-4000-8000-000000000001','00000002-0000-4000-8000-000000000001','00000004-0000-4000-8000-000000000001','active','2026-01-01','2026-12-31','2026-08-01');
do $$begin
 assert (select min(start_date) from public.training_cycles where enrollment_id='00000005-0000-4000-8000-000000000004')='2026-08-01'::date,'intentional training delay must be preserved';
 assert (select max(end_date) from public.training_cycles where enrollment_id='00000005-0000-4000-8000-000000000004')='2026-12-31'::date,'delay must not extend enrollment';
end $$;
