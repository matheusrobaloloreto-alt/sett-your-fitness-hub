-- Gate future first starts without reclassifying existing enrollment or cycle rows.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

alter table public.enrollments
  add column requires_explicit_training_start boolean not null default false;

comment on column public.enrollments.requires_explicit_training_start is
  'Database-managed. A marked enrollment cannot gain new cycles until training_start_date is explicitly set. Existing rows are not classified by this migration.';

create function private.set_initial_enrollment_training_start_gate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.requires_explicit_training_start := coalesce(new.status, '') in ('active', 'awaiting_training', 'awaiting_renewal');
  elsif new.requires_explicit_training_start is distinct from old.requires_explicit_training_start
    and not pg_has_role(current_user, (select relowner from pg_class where oid = tg_relid), 'USAGE') then
    raise exception 'schedule_training_start_gate_is_database_managed' using errcode = '42501';
  elsif old.requires_explicit_training_start then
    new.requires_explicit_training_start := true;
  elsif new.training_start_date is not null
    and new.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and (old.training_start_date is null
      or coalesce(old.status, '') not in ('active', 'awaiting_training', 'awaiting_renewal')) then
    new.requires_explicit_training_start := true;
  elsif new.training_start_date is null
    and new.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and (old.status is distinct from new.status
      and coalesce(old.status, '') not in ('active', 'awaiting_training', 'awaiting_renewal')
      or lower(coalesce(old.payment_status, '')) <> 'paid'
      and lower(coalesce(new.payment_status, '')) = 'paid')
    and not exists (select 1 from public.training_cycles where enrollment_id = new.id) then
    new.requires_explicit_training_start := true;
  end if;
  return new;
end $$;

create trigger set_initial_enrollment_training_start_gate
before insert or update of status, payment_status, training_start_date, requires_explicit_training_start on public.enrollments
for each row execute function private.set_initial_enrollment_training_start_gate();

-- A date recorded under this gate or a real, already-started prescription
-- (digital or explicitly documented offline) is evidence for a returning
-- student. Commercial rows and empty slots are not.
create function private.has_trusted_prior_training(_student_id uuid, _company_id uuid, _enrollment_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.student_id = _student_id and e.company_id = _company_id
      and e.id is distinct from _enrollment_id
      and e.requires_explicit_training_start
      and e.status in ('active', 'awaiting_training', 'awaiting_renewal', 'completed', 'inactive')
      and e.training_start_date between e.start_date and e.end_date
      and e.training_start_date <= public.current_business_date()
  ) or exists (
    select 1 from public.training_cycles c
    join public.enrollments e on e.id = c.enrollment_id
      and e.student_id = c.student_id and e.company_id = c.company_id
    where c.student_id = _student_id and c.company_id = _company_id
      and (public.is_enrollment_carried_over_cycle_eligible(null::uuid, _student_id, _company_id, c.id)
        or (c.prescribed_offline_at is not null and c.start_date <= public.current_business_date()
          and c.status in ('active', 'completed', 'pending')
          and c.superseded_at is null and c.superseded_by_cycle_id is null and c.prescription_cleared_at is null))
  );
$$;

create function private.guard_initial_training_start_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_operational_start boolean := false;
begin
  if new.training_start_date is null
    or coalesce(new.status, '') not in ('active', 'awaiting_training', 'awaiting_renewal') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    existing_operational_start := old.training_start_date is not null
      and coalesce(old.status, '') in ('active', 'awaiting_training', 'awaiting_renewal')
      and old.company_id is not distinct from new.company_id
      and old.student_id is not distinct from new.student_id;

    -- A status-only restoration of a term with documented training is not a
    -- first start. Keep its original dates, including legacy pre-term dates.
    if new.status = 'active' and old.status in ('inactive', 'completed')
      and old.training_start_date is not distinct from new.training_start_date
      and old.start_date is not distinct from new.start_date
      and old.end_date is not distinct from new.end_date
      and old.plan_id is not distinct from new.plan_id
      and old.company_id is not distinct from new.company_id
      and old.student_id is not distinct from new.student_id
      and exists (
        select 1 from public.training_cycles c
        where c.enrollment_id = new.id and c.company_id = new.company_id and c.student_id = new.student_id
          and c.status in ('active', 'completed', 'pending')
          and c.superseded_at is null and c.superseded_by_cycle_id is null
          and c.prescription_cleared_at is null and c.start_date <= public.current_business_date()
          and (c.prescribed_offline_at is not null
            or public.is_enrollment_carried_over_cycle_eligible(null::uuid, new.student_id, new.company_id, c.id))
      ) then
      return new;
    end if;
  end if;

  if new.training_start_date < new.start_date then
    -- Leave an unchanged legacy training date alone unless the commercial
    -- start moves later. Every newly entered early date is rejected.
    if not existing_operational_start or new.training_start_date is distinct from old.training_start_date
      or old.start_date is null or new.start_date > old.start_date then
      raise exception 'schedule_training_start_before_commercial_start' using errcode = '23514';
    end if;
  end if;

  if existing_operational_start
    or private.has_trusted_prior_training(new.student_id, new.company_id, new.id) then
    return new;
  end if;

  if new.trainer_id is null then
    raise exception 'schedule_training_start_requires_trainer' using errcode = '23514';
  end if;

  -- Keep the assessment valid until the enrollment update commits.
  perform 1 from public.functional_assessments a
  where a.company_id = new.company_id and a.student_id = new.student_id and a.status = 'completed'
  limit 1 for share;
  if not found then
    raise exception 'schedule_training_start_requires_completed_assessment' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger guard_initial_training_start_readiness
before insert or update of status, training_start_date, start_date, company_id, student_id on public.enrollments
for each row execute function private.guard_initial_training_start_readiness();

-- Called by the trusted manual payment-to-assessment flow with its selected paid enrollment.
-- Preserve existing training dates and any enrollment that already has cycle history.
create function private.defer_initial_enrollment_schedule(_enrollment_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  enrollment public.enrollments;
begin
  select * into enrollment from public.enrollments where id = _enrollment_id for update;
  if not found or enrollment.requires_explicit_training_start or enrollment.training_start_date is not null
    or lower(coalesce(enrollment.payment_status, '')) <> 'paid'
    or coalesce(enrollment.status, '') not in ('active', 'awaiting_training', 'awaiting_renewal')
    or exists (select 1 from public.training_cycles where enrollment_id = enrollment.id) then
    return;
  end if;

  update public.enrollments set requires_explicit_training_start = true where id = enrollment.id;
end $$;

-- Fence direct publication/import inserts as well as the scheduling RPCs. Lock
-- the parent enrollment so an explicit date and a cycle write serialize.
create function private.guard_cycle_requires_training_start()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  awaiting_training_start boolean;
begin
  if tg_op = 'UPDATE' and new.enrollment_id is not distinct from old.enrollment_id then return new; end if;

  select e.requires_explicit_training_start and e.training_start_date is null
  into awaiting_training_start
  from public.enrollments e where e.id = new.enrollment_id for share;
  if awaiting_training_start is true then
    raise exception 'schedule_awaiting_training_start' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger guard_cycle_requires_training_start
before insert or update of enrollment_id on public.training_cycles
for each row execute function private.guard_cycle_requires_training_start();

revoke all on function private.set_initial_enrollment_training_start_gate(), private.guard_initial_training_start_readiness(),
  private.has_trusted_prior_training(uuid, uuid, uuid), private.defer_initial_enrollment_schedule(uuid),
  private.guard_cycle_requires_training_start()
  from public, anon, authenticated, service_role;

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
 if e.requires_explicit_training_start and e.training_start_date is null then
   return jsonb_build_object('contract',contract,'created_cycle_ids','[]'::jsonb,'audit_id',null,
     'routine_version','schedule-contract-v1','schedule_state','awaiting_training_start');
 end if;
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
 if new.requires_explicit_training_start and new.training_start_date is null then return new; end if;
 if coalesce(new.start_date,new.training_start_date) is null then return new; end if;
 perform private.reconcile_prescription_schedule(new.id);
 return new;
end $$;

create or replace function public.replace_paid_student_enrollment_internal(
  _student_id uuid,
  _company_id uuid,
  _plan_id uuid,
  _trainer_id uuid,
  _start_date date,
  _payment_date date,
  _clear_carried_over_cycle boolean
)
returns table (
  enrollment_id uuid,
  previous_enrollment_id uuid,
  carried_over_cycle_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_plan public.plans%rowtype;
  v_current public.enrollments%rowtype;
  v_new_enrollment_id uuid := gen_random_uuid();
  v_carried_over_cycle_id uuid;
  v_awaiting_training_start boolean;
  v_plan_days integer;
  v_cycle_days integer;
begin
  if _student_id is null or _company_id is null or _plan_id is null or _start_date is null then
    raise exception using errcode = '22023', message = 'Parâmetros incompletos para substituir matrícula paga.';
  end if;

  select student.* into v_student
  from public.students student
  where student.id = _student_id
  for update;
  if not found or v_student.company_id is distinct from _company_id then
    raise exception using errcode = '23514', message = 'Aluno não pertence à empresa informada.';
  end if;

  select plan.* into v_plan
  from public.plans plan
  where plan.id = _plan_id
  for share;
  if not found or (v_plan.company_id is not null and v_plan.company_id is distinct from _company_id) then
    raise exception using errcode = '23514', message = 'Plano não pertence à empresa informada.';
  end if;

  select enrollment.* into v_current
  from public.enrollments enrollment
  where enrollment.student_id = _student_id
    and enrollment.company_id = _company_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and lower(coalesce(enrollment.payment_status, '')) = 'paid'
  order by
    case enrollment.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    enrollment.created_at desc,
    enrollment.id desc
  limit 1
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Nenhuma matrícula paga aberta encontrada para substituir.';
  end if;

  v_awaiting_training_start := v_current.requires_explicit_training_start and v_current.training_start_date is null;
  v_plan_days := greatest(coalesce(v_plan.duration_days, v_plan.duration_weeks * 7, 90), 1);
  v_cycle_days := greatest(coalesce(v_plan.cycle_duration_days, 42), 1);

  if not coalesce(_clear_carried_over_cycle, false) then
    v_carried_over_cycle_id := public.select_enrollment_carryover_cycle(
      v_current.id, v_new_enrollment_id, _student_id, _company_id
    );
  end if;

  update public.students
  set status = 'active',
      sales_stage = case when v_awaiting_training_start then 'active_onboarding' else 'active' end,
      activated_at = coalesce(activated_at, now()),
      assigned_trainer_id = coalesce(_trainer_id, assigned_trainer_id),
      updated_at = now()
  where id = _student_id
    and company_id = _company_id;

  update public.enrollments enrollment
  set status = 'completed',
      updated_at = now()
  where enrollment.id = v_current.id
    and enrollment.company_id = _company_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal');

  insert into public.enrollments (
    id, student_id, company_id, plan_id, trainer_id, start_date, end_date,
    training_start_date, cycle_duration_days, payment_status, payment_date, status,
    carried_over_cycle_id, carried_over_cycle_cleared_at
  ) values (
    v_new_enrollment_id, _student_id, _company_id, _plan_id,
    coalesce(_trainer_id, v_current.trainer_id, v_student.assigned_trainer_id),
    _start_date, _start_date + v_plan_days - 1,
    case when not v_awaiting_training_start
      and private.has_trusted_prior_training(_student_id, _company_id, v_new_enrollment_id) then _start_date end,
    v_cycle_days,
    'paid', coalesce(_payment_date, _start_date), 'active',
    v_carried_over_cycle_id,
    case when coalesce(_clear_carried_over_cycle, false) then now() else null end
  );

  return query select v_new_enrollment_id, v_current.id, v_carried_over_cycle_id;
end;
$$;

-- Match what the student portal can actually read from a verified owned cycle.
create or replace function public.is_enrollment_carried_over_cycle_eligible(
  _enrollment_id uuid,
  _student_id uuid,
  _company_id uuid,
  _cycle_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.training_cycles cycle
    where cycle.id = _cycle_id
      and cycle.student_id = _student_id
      and cycle.company_id = _company_id
      and cycle.enrollment_id is distinct from _enrollment_id
      and cycle.start_date is not null
      and cycle.start_date <= public.current_business_date()
      and cycle.status in ('active', 'completed', 'pending')
      and cycle.superseded_at is null
      and cycle.superseded_by_cycle_id is null
      and cycle.prescription_cleared_at is null
      and exists (
        select 1
        from public.workouts workout
        where workout.cycle_id = cycle.id
          and (workout.company_id = _company_id or workout.company_id is null)
          and workout.superseded_at is null
          and workout.superseded_by_revision_id is null
          and workout.student_profile_archive_event_id is null
          and case when jsonb_typeof(workout.exercises) = 'array'
            then jsonb_array_length(workout.exercises) > 0 else false end
      )
  );
$$;

revoke all on function public.is_enrollment_carried_over_cycle_eligible(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_enrollment_carried_over_cycle_eligible(uuid, uuid, uuid, uuid)
  to service_role;

-- A renewal can arrive after the former enrollment has already been closed.
-- Consult only the most recent completed paid term so a later removal cannot
-- revive a workout from an older term.
create function private.select_completed_enrollment_carryover(
  _student_id uuid, _company_id uuid, _new_enrollment_id uuid
)
returns uuid
language sql
set search_path = ''
as $$
  select public.select_enrollment_carryover_cycle(
    (
      select e.id from public.enrollments e
      where e.student_id = _student_id and e.company_id = _company_id
        and e.status = 'completed' and lower(coalesce(e.payment_status, '')) = 'paid'
        and e.start_date <= public.current_business_date()
      order by e.end_date desc nulls last, e.created_at desc, e.id desc
      limit 1
    ),
    _new_enrollment_id, _student_id, _company_id
  );
$$;

revoke all on function private.select_completed_enrollment_carryover(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.replace_student_enrollment(
  _student_id uuid,
  _company_id uuid,
  _plan_id uuid,
  _trainer_id uuid,
  _start_date date,
  _clear_carried_over_cycle boolean default false
)
returns table (
  enrollment_id uuid,
  previous_enrollment_id uuid,
  carried_over_cycle_id uuid,
  first_activation boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_plan public.plans%rowtype;
  v_current_paid_id uuid;
  v_any_open_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_carried_over_cycle_id uuid;
  v_has_enrollment_history boolean;
  v_first_activation boolean;
  v_plan_days integer;
  v_cycle_days integer;
begin
  if auth.uid() is null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '28000', message = 'Autenticação obrigatória.';
  end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
    and not public.can_manage_staff_student(_company_id, _student_id) then
    raise exception using errcode = '42501', message = 'Sem permissão para substituir matrícula deste aluno.';
  end if;

  perform 1
  from public.students student
  where student.id = _student_id
    and student.company_id = _company_id
  for update;

  select enrollment.id into v_current_paid_id
  from public.enrollments enrollment
  where enrollment.student_id = _student_id
    and enrollment.company_id = _company_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and lower(coalesce(enrollment.payment_status, '')) = 'paid'
  order by
    case enrollment.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    enrollment.created_at desc,
    enrollment.id desc
  limit 1;

  if v_current_paid_id is not null then
    return query
    select result.enrollment_id, result.previous_enrollment_id, result.carried_over_cycle_id, false
    from public.replace_paid_student_enrollment_internal(
      _student_id, _company_id, _plan_id, _trainer_id, _start_date, _start_date,
      coalesce(_clear_carried_over_cycle, false)
    ) as result;
    return;
  end if;

  select enrollment.id into v_any_open_id
  from public.enrollments enrollment
  where enrollment.student_id = _student_id
    and enrollment.company_id = _company_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
  limit 1;
  if v_any_open_id is not null then
    raise exception using errcode = '23514',
      message = 'Matrícula aberta não paga requer conciliação manual antes de criar nova matrícula.';
  end if;

  select student.* into v_student
  from public.students student
  where student.id = _student_id
  for update;
  if not found or v_student.company_id is distinct from _company_id then
    raise exception using errcode = '23514', message = 'Aluno não pertence à empresa informada.';
  end if;

  select plan.* into v_plan
  from public.plans plan
  where plan.id = _plan_id
  for share;
  if not found or (v_plan.company_id is not null and v_plan.company_id is distinct from _company_id) then
    raise exception using errcode = '23514', message = 'Plano não pertence à empresa informada.';
  end if;

  v_plan_days := greatest(coalesce(v_plan.duration_days, v_plan.duration_weeks * 7, 90), 1);
  v_cycle_days := greatest(coalesce(v_plan.cycle_duration_days, 42), 1);

  select exists (
    select 1 from public.enrollments e
    where e.student_id = _student_id and e.company_id = _company_id
    union all
    select 1 from public.training_cycles c
    where c.student_id = _student_id and c.company_id = _company_id
  ) into v_has_enrollment_history;
  v_first_activation := v_student.activated_at is null and not v_has_enrollment_history;

  update public.students
  set status = 'active',
      sales_stage = case when v_first_activation then 'active_onboarding' else 'active' end,
      activated_at = coalesce(activated_at, now()),
      assigned_trainer_id = coalesce(_trainer_id, assigned_trainer_id),
      updated_at = now()
  where id = _student_id and company_id = _company_id;

  if not coalesce(_clear_carried_over_cycle, false) then
    v_carried_over_cycle_id := private.select_completed_enrollment_carryover(_student_id, _company_id, v_new_id);
  end if;

  insert into public.enrollments (
    id, student_id, company_id, plan_id, trainer_id, start_date, end_date,
    training_start_date, cycle_duration_days, payment_status, payment_date, status,
    carried_over_cycle_id, carried_over_cycle_cleared_at
  ) values (
    v_new_id, _student_id, _company_id, _plan_id, coalesce(_trainer_id, v_student.assigned_trainer_id),
    _start_date, _start_date + v_plan_days - 1,
    case when v_has_enrollment_history
      and private.has_trusted_prior_training(_student_id, _company_id, v_new_id) then _start_date end,
    v_cycle_days,
    'paid', _start_date, 'active', v_carried_over_cycle_id,
    case when coalesce(_clear_carried_over_cycle, false) then now() else null end
  );

  return query select v_new_id, null::uuid, v_carried_over_cycle_id, v_first_activation;
end;
$$;

comment on function public.replace_student_enrollment(uuid, uuid, uuid, uuid, date, boolean) is
  'Staff enrollment creation/replacement without billing effects. Initial enrollment uses the selected commercial date and awaits an explicit training start. Renewals preserve carry-over.';

commit;
