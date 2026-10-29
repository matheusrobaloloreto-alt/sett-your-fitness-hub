-- Forward-only repair for the read DTO after 181000.
-- Earlier schemas may not implement prescription clearing or workout retirement.
-- Missing optional fields read as JSON null; no feature columns or data are created.
-- Keep the same result envelope, scope checks, owner, volatility and ACL.
begin;
do $preflight$
begin
 if to_regprocedure('public.get_prescription_schedule(uuid)') is null then
  raise exception 'schedule_dto_requires_181000' using errcode='42883';
 end if;
end $preflight$;

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
   'superseded_by_cycle_id',to_jsonb(c)->'superseded_by_cycle_id','sequence_number',to_jsonb(c)->'sequence_number','sequence_phase',to_jsonb(c)->'sequence_phase',
   'prescribed_offline_at',to_jsonb(c)->'prescribed_offline_at','prescription_cleared_at',to_jsonb(c)->'prescription_cleared_at',
   'has_usable_workouts',exists(select 1 from public.workouts w where w.cycle_id=c.id and (to_jsonb(w)->>'superseded_at') is null
      and case when jsonb_typeof(w.exercises)='array' then jsonb_array_length(w.exercises)>0 else false end),
   'has_workouts',exists(select 1 from public.workouts w where w.cycle_id=c.id and (to_jsonb(w)->>'superseded_at') is null
      and case when jsonb_typeof(w.exercises)='array' then jsonb_array_length(w.exercises)>0 else false end),
   'has_bundle',exists(select 1 from public.prescription_bundles b where b.training_cycle_id=c.id and b.status<>'failed'),
   'has_history',private.prescription_cycle_has_history(c.id)
 ) order by c.start_date,c.cycle_number,c.id),'[]'::jsonb) into cycles
 from public.training_cycles c where c.enrollment_id=e.id and c.company_id=e.company_id and c.student_id=e.student_id;
 return jsonb_build_object('contract',contract,'cycles',cycles,'business_date',public.current_business_date(),'routine_version','schedule-contract-v1');
end $$;

-- CREATE OR REPLACE retains the existing owner and ACL from 181000 exactly.
-- The preflight prevents accidentally creating a new function with default grants.
commit;
