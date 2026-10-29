-- Additive prevention only. No restoration/backfill/quarantine of existing rows.
-- Commercial dates delimit agenda; content and history are never shifted or published here.
begin;
do $preflight$
begin
 if to_regclass('public.enrollments') is null or to_regclass('public.training_cycles') is null
   or to_regclass('public.plans') is null or to_regclass('public.workouts') is null
   or to_regclass('public.prescription_bundles') is null or to_regclass('public.students') is null
   or to_regprocedure('public.current_business_date()') is null
   or to_regprocedure('public.can_manage_staff_student(uuid,uuid)') is null
   or to_regprocedure('public.is_company_staff(uuid,uuid)') is null then
   raise exception 'schedule_migration_dependency_missing' using errcode='42883';
 end if;
end $preflight$;
create schema if not exists private;
alter table public.training_cycles add column if not exists sequence_number integer;
alter table public.training_cycles add column if not exists sequence_phase text;
alter table public.training_cycles add constraint schedule_sequence_number_positive check(sequence_number is null or sequence_number>0);
alter table public.training_cycles add constraint schedule_sequence_phase_known check(sequence_phase is null or sequence_phase in ('base','acumulacao','intensificacao','consolidacao'));

create or replace function private.prescription_schedule_contract(e jsonb, p jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
declare s date; commercial_start date; f date; n integer; d integer;
begin
 commercial_start:=coalesce((e->>'start_date')::date,(e->>'training_start_date')::date);
 s:=greatest(commercial_start,coalesce((e->>'training_start_date')::date,commercial_start));
 d:=coalesce((p->>'duration_days')::integer,(p->>'duration_weeks')::integer*7,42);
 n:=coalesce((p->>'cycle_duration_days')::integer,42);
 f:=coalesce((e->>'end_date')::date,commercial_start+d-1);
 if s is null or f is null or f<s or f-s>36600 or n<1 or n>36600 or d<1 or d>36600 then
   raise exception 'schedule_invalid_contract_dates_or_duration' using errcode='22023';
 end if;
 return jsonb_build_object('enrollment_id',e->'id','company_id',e->'company_id','student_id',e->'student_id',
  'plan_id',e->'plan_id','status',e->'status','contract_start_date',commercial_start,'start_date',s,'end_date',f,'cycle_duration_days',n,
  'training_start_date',e->'training_start_date','updated_at',e->'updated_at',
  'plan_snapshot',jsonb_build_object('duration_days',p->'duration_days','duration_weeks',p->'duration_weeks',
    'cycle_duration_days',p->'cycle_duration_days','updated_at',p->'updated_at'));
end $$;

-- Central evidence predicate, including offline/inline content and every relational
-- reference to a cycle (FKs and conventional cycle columns, including attachments).
create or replace function private.prescription_cycle_has_history(_cycle_id uuid)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c jsonb; r record; found_reference boolean;
begin
 select to_jsonb(tc) into c from public.training_cycles tc where tc.id=_cycle_id;
 if c is null then return true; end if; -- unknown is never proof of emptiness
 if nullif(c->>'prescribed_offline_at','') is not null or nullif(c->>'prescribed_offline_by','') is not null
   or nullif(btrim(coalesce(c->>'prescribed_offline_note','')),'') is not null
   or nullif(c->>'bundle_id','') is not null or nullif(c->>'anamnese_id','') is not null
   or nullif(c->>'prescription_cleared_at','') is not null
   or nullif(btrim(coalesce(c->>'objective','')),'') is not null or nullif(btrim(coalesce(c->>'notes','')),'') is not null
   or coalesce(c->'workouts','null'::jsonb) not in ('null'::jsonb,'[]'::jsonb,'{}'::jsonb)
   or lower(coalesce(c->>'delivery_status','')) in ('sent','viewed','delivered','published') then return true; end if;
 for r in
   select distinct ns.nspname,cl.relname,a.attname
   from pg_attribute a join pg_class cl on cl.oid=a.attrelid join pg_namespace ns on ns.oid=cl.relnamespace
   where ns.nspname='public' and cl.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
     and a.atttypid='uuid'::regtype and (cl.relname<>'training_cycles' or a.attname='superseded_by_cycle_id')
     and (a.attname in ('cycle_id','training_cycle_id') or exists (
       select 1 from pg_constraint fk where fk.contype='f' and fk.conrelid=cl.oid
         and fk.confrelid='public.training_cycles'::regclass and cardinality(fk.conkey)=1 and a.attnum=any(fk.conkey)))
 loop
   execute format('select exists(select 1 from %I.%I where %I=$1)',r.nspname,r.relname,r.attname) into found_reference using _cycle_id;
   if found_reference then return true; end if;
 end loop;
 if to_regclass('public.prescription_bundle_items') is not null then
   execute 'select exists(select 1 from public.prescription_bundle_items where entity_type=''training_cycle'' and entity_id=$1)'
   into found_reference using _cycle_id;
   if found_reference then return true; end if;
 end if;
 return false;
end $$;

create or replace function private.assert_schedule_access(_enrollment_id uuid,_write boolean)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare e public.enrollments; actor uuid:=auth.uid();
begin
 select * into e from public.enrollments where id=_enrollment_id;
 if not found then raise exception 'schedule_enrollment_not_found' using errcode='P0002'; end if;
 if not exists(select 1 from public.students s where s.id=e.student_id and s.company_id=e.company_id) then
   raise exception 'schedule_student_tenant_mismatch' using errcode='42501'; end if;
 if coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
 if actor is null then raise exception 'schedule_auth_required' using errcode='42501'; end if;
 if (_write and public.can_manage_staff_student(e.company_id,e.student_id))
   or (not _write and (public.is_company_staff(actor,e.company_id) or exists(
     select 1 from public.students s where s.id=e.student_id and s.company_id=e.company_id and s.user_id=actor))) then return; end if;
 raise exception 'schedule_access_denied' using errcode='42501';
end $$;

create or replace function public.get_prescription_schedule(_enrollment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare e public.enrollments; p jsonb; contract jsonb; cycles jsonb;
begin
 perform private.assert_schedule_access(_enrollment_id,false);
 select * into e from public.enrollments where id=_enrollment_id;
 select to_jsonb(plan) into p from public.plans plan where plan.id=e.plan_id and plan.company_id=e.company_id;
 if p is null then raise exception 'schedule_plan_tenant_mismatch' using errcode='42501'; end if;
 contract:=private.prescription_schedule_contract(to_jsonb(e),p);
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'enrollment_id',c.enrollment_id,'student_id',c.student_id,'company_id',c.company_id,
   'cycle_number',c.cycle_number,'start_date',c.start_date,'end_date',c.end_date,'status',c.status,
   'superseded_by_cycle_id',c.superseded_by_cycle_id,'sequence_number',c.sequence_number,'sequence_phase',c.sequence_phase,
   'prescribed_offline_at',c.prescribed_offline_at,'prescription_cleared_at',c.prescription_cleared_at,
   'has_usable_workouts',exists(select 1 from public.workouts w where w.cycle_id=c.id and w.superseded_at is null
      and case when jsonb_typeof(w.exercises)='array' then jsonb_array_length(w.exercises)>0 else false end),
   'has_workouts',exists(select 1 from public.workouts w where w.cycle_id=c.id and w.superseded_at is null
      and case when jsonb_typeof(w.exercises)='array' then jsonb_array_length(w.exercises)>0 else false end),
   'has_bundle',exists(select 1 from public.prescription_bundles b where b.training_cycle_id=c.id and b.status<>'failed'),
   'has_history',private.prescription_cycle_has_history(c.id)
 ) order by c.start_date,c.cycle_number,c.id),'[]'::jsonb) into cycles
 from public.training_cycles c where c.enrollment_id=e.id and c.company_id=e.company_id and c.student_id=e.student_id;
 return jsonb_build_object('contract',contract,'cycles',cycles,'business_date',public.current_business_date(),'routine_version','schedule-contract-v1');
end $$;

create table public.prescription_schedule_reconciliations(
 id uuid primary key default gen_random_uuid(), enrollment_id uuid not null, company_id uuid not null,
 actor_id uuid, routine_version text not null default 'schedule-contract-v1', contract jsonb not null,
 before_schedule jsonb not null, after_schedule jsonb not null, created_cycle_ids uuid[] not null,
 created_at timestamptz not null default now()
);
alter table public.prescription_schedule_reconciliations enable row level security;
revoke all on public.prescription_schedule_reconciliations from public,anon,authenticated;
grant select on public.prescription_schedule_reconciliations to service_role;

create or replace function private.reconcile_prescription_schedule(_enrollment_id uuid,_expected_contract jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e public.enrollments; p jsonb; contract jsonb; before_value jsonb; after_value jsonb;
 s date; f date; n integer; slot_start date; slot_end date; cursor_day date; next_start date; covered_until date;
 label_number integer; position_number integer:=1; created_ids uuid[]:='{}'::uuid[]; created_id uuid; audit_id uuid;
begin
 -- The enrollment lock is also acquired by its UPDATE trigger; all paths serialize
 -- on the same row. No global lifecycle/advisory lock or cross-tenant write.
 select * into e from public.enrollments where id=_enrollment_id for update;
 if not found then raise exception 'schedule_enrollment_not_found' using errcode='P0002'; end if;
 select to_jsonb(plan) into p from public.plans plan where plan.id=e.plan_id and plan.company_id=e.company_id for share;
 if p is null then raise exception 'schedule_plan_tenant_mismatch' using errcode='42501'; end if;
 contract:=private.prescription_schedule_contract(to_jsonb(e),p);
 if _expected_contract is not null and _expected_contract is distinct from contract then
   raise exception 'schedule_contract_changed' using errcode='PT409'; end if;
 if e.status not in ('active','awaiting_training','awaiting_renewal') then
   raise exception 'schedule_enrollment_not_operational' using errcode='23514'; end if;
 perform c.id from public.training_cycles c where c.enrollment_id=e.id order by c.id for update;
 if exists(select 1 from public.training_cycles c where c.enrollment_id=e.id
    and (c.company_id is distinct from e.company_id or c.student_id is distinct from e.student_id
      or c.start_date is null or c.end_date is null or c.end_date<c.start_date)) then
   raise exception 'schedule_existing_scope_or_dates_invalid' using errcode='23514'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) into before_value from public.training_cycles c where c.enrollment_id=e.id;
 s:=(contract->>'start_date')::date; f:=(contract->>'end_date')::date; n:=(contract->>'cycle_duration_days')::integer;
 select coalesce(max(c.cycle_number),0) into label_number from public.training_cycles c where c.enrollment_id=e.id;
 slot_start:=s;
 while slot_start<=f loop
   slot_end:=least(slot_start+n-1,f); cursor_day:=slot_start;
   while cursor_day<=slot_end loop
     select max(c.end_date) into covered_until from public.training_cycles c
       where c.enrollment_id=e.id and c.status<>'superseded' and c.superseded_by_cycle_id is null
         and c.start_date<=cursor_day and c.end_date>=cursor_day;
     if covered_until is not null then cursor_day:=least(covered_until,slot_end)+1;
     else
       select min(c.start_date) into next_start from public.training_cycles c
         where c.enrollment_id=e.id and c.status<>'superseded' and c.superseded_by_cycle_id is null
           and c.start_date>cursor_day and c.start_date<=slot_end;
       covered_until:=least(coalesce(next_start-1,slot_end),slot_end);
       label_number:=label_number+1;
       insert into public.training_cycles(enrollment_id,student_id,company_id,cycle_number,start_date,end_date,duration_weeks,status,name,sequence_number,sequence_phase)
       values(e.id,e.student_id,e.company_id,label_number,cursor_day,covered_until,
         greatest(1,ceil((covered_until-cursor_day+1)/7.0)::integer),
         case when covered_until<public.current_business_date() then 'completed' else 'pending' end,
         format('Ciclo %s',label_number),position_number,
         (array['base','acumulacao','intensificacao','consolidacao'])[1+((position_number-1)%4)]) returning id into created_id;
       created_ids:=array_append(created_ids,created_id); cursor_day:=covered_until+1;
     end if;
   end loop;
   slot_start:=slot_end+1; position_number:=position_number+1;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) into after_value from public.training_cycles c where c.enrollment_id=e.id;
 if cardinality(created_ids)>0 then
   insert into public.prescription_schedule_reconciliations(enrollment_id,company_id,actor_id,contract,before_schedule,after_schedule,created_cycle_ids)
   values(e.id,e.company_id,auth.uid(),contract,before_value,after_value,created_ids) returning id into audit_id;
 end if;
 return jsonb_build_object('contract',contract,'created_cycle_ids',to_jsonb(created_ids),'audit_id',audit_id,'routine_version','schedule-contract-v1');
end $$;

create or replace function public.reconcile_prescription_schedule(_enrollment_id uuid,_expected_contract jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 perform private.assert_schedule_access(_enrollment_id,true);
 return private.reconcile_prescription_schedule(_enrollment_id,_expected_contract);
end $$;

-- Keep the legacy two-argument API and exact result shape; date selection replaces
-- status-only selection. _start_date is a legacy hint, not permission to move history.
create or replace function public.sync_prescription_cycles(_student_id uuid,_start_date date default null)
returns table(id uuid,enrollment_id uuid,cycle_number integer,start_date date,end_date date,status text,has_workouts boolean,has_bundle boolean)
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare target uuid; result jsonb;
begin
 select e.id into target from public.enrollments e join public.plans p on p.id=e.plan_id and p.company_id=e.company_id
 where e.student_id=_student_id and e.status in ('active','awaiting_training','awaiting_renewal')
   and coalesce(e.start_date,e.training_start_date)<=public.current_business_date()
   and coalesce(e.end_date,coalesce(e.start_date,e.training_start_date)+coalesce(p.duration_days,p.duration_weeks*7,42)-1)>=public.current_business_date()
 order by case e.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,e.created_at desc,e.id limit 1;
 if target is null then raise exception 'schedule_no_current_enrollment' using errcode='P0002'; end if;
 perform public.reconcile_prescription_schedule(target);
 result:=public.get_prescription_schedule(target);
 return query select c.id,c.enrollment_id,c.cycle_number,c.start_date,c.end_date,c.status,
   coalesce(c.has_workouts,false) or c.prescribed_offline_at is not null,coalesce(c.has_bundle,false)
 from jsonb_to_recordset(result->'cycles') as c(id uuid,enrollment_id uuid,cycle_number integer,start_date date,end_date date,status text,
   has_workouts boolean,has_bundle boolean,prescribed_offline_at timestamptz,superseded_by_cycle_id uuid)
 where c.status<>'superseded' and c.superseded_by_cycle_id is null order by c.start_date,c.cycle_number;
end $$;

create or replace function public.generate_training_cycles()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 -- Respect the established transaction-local authorization for intentional rebases.
 if to_regclass('private.training_cycle_rebase_authorizations') is not null then
   if exists(select 1 from private.training_cycle_rebase_authorizations a where a.transaction_id=txid_current() and a.enrollment_id=new.id) then return new; end if;
 end if;
 if new.status not in ('active','awaiting_training','awaiting_renewal') then return new; end if;
 if tg_op='UPDATE' and old.start_date is not distinct from new.start_date and old.end_date is not distinct from new.end_date
   and old.plan_id is not distinct from new.plan_id and old.training_start_date is not distinct from new.training_start_date
   and old.status is not distinct from new.status then return new; end if;
 if coalesce(new.start_date,new.training_start_date) is null then return new; end if;
 perform private.reconcile_prescription_schedule(new.id);
 return new;
end $$;

create or replace function private.guard_prescription_cycle_quarantine()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e public.enrollments;
begin
 -- A targeted supersession is a separate versioning operation; this guard denies
 -- targetless quarantine. This migration never performs either operation itself.
 if new.status='superseded' and new.superseded_by_cycle_id is null and
   (old.status is distinct from 'superseded' or old.superseded_by_cycle_id is not null) then
   if private.prescription_cycle_has_history(old.id) then
     raise exception 'schedule_quarantine_has_content_or_history' using errcode='23514'; end if;
   select * into e from public.enrollments where id=old.enrollment_id;
   if e.status in ('active','awaiting_training','awaiting_renewal') and e.start_date is not null and e.end_date is not null then
     if exists(select 1 from generate_series(greatest(old.start_date,e.start_date),least(old.end_date,e.end_date),interval '1 day') day
       where not exists(select 1 from public.training_cycles c where c.enrollment_id=old.enrollment_id and c.id<>old.id
         and c.status<>'superseded' and c.superseded_by_cycle_id is null and day::date between c.start_date and c.end_date)) then
       raise exception 'schedule_quarantine_would_open_contract_gap' using errcode='23514'; end if;
   end if;
 end if;
 return new;
end $$;
create trigger guard_prescription_cycle_quarantine before update of status,superseded_by_cycle_id on public.training_cycles
 for each row execute function private.guard_prescription_cycle_quarantine();

revoke all on function private.prescription_schedule_contract(jsonb,jsonb),private.prescription_cycle_has_history(uuid),
 private.assert_schedule_access(uuid,boolean),private.reconcile_prescription_schedule(uuid,jsonb),private.guard_prescription_cycle_quarantine() from public,anon,authenticated;
revoke all on function public.get_prescription_schedule(uuid),public.reconcile_prescription_schedule(uuid,jsonb),public.sync_prescription_cycles(uuid,date),public.generate_training_cycles() from public,anon,authenticated;
grant execute on function public.get_prescription_schedule(uuid),public.reconcile_prescription_schedule(uuid,jsonb),public.sync_prescription_cycles(uuid,date) to authenticated,service_role;
grant execute on function public.generate_training_cycles() to service_role;
commit;
