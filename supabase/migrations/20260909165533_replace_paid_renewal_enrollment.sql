begin;

do $preflight$
declare
  required_column record;
begin
  if to_regprocedure('public.current_business_date()') is null
    or to_regprocedure('public.can_manage_staff_student(uuid, uuid)') is null then
    raise exception 'missing_dependency_renewal_replacement_helpers' using errcode = '42883';
  end if;

  if to_regclass('public.enrollments') is null
    or to_regclass('public.students') is null
    or to_regclass('public.plans') is null
    or to_regclass('public.training_cycles') is null
    or to_regclass('public.workouts') is null
    or to_regclass('public.payments') is null then
    raise exception 'missing_dependency_renewal_replacement_tables' using errcode = '42P01';
  end if;

  for required_column in
    select *
    from (
      values
        ('enrollments','id'), ('enrollments','student_id'), ('enrollments','company_id'),
        ('enrollments','plan_id'), ('enrollments','trainer_id'), ('enrollments','start_date'),
        ('enrollments','end_date'), ('enrollments','training_start_date'), ('enrollments','cycle_duration_days'),
        ('enrollments','payment_status'), ('enrollments','payment_date'), ('enrollments','status'),
        ('students','id'), ('students','company_id'), ('students','status'), ('students','sales_stage'),
        ('students','activated_at'), ('students','assessment_due_at'), ('students','assigned_trainer_id'),
        ('plans','id'), ('plans','company_id'), ('plans','duration_days'), ('plans','duration_weeks'),
        ('plans','cycle_duration_days'), ('training_cycles','id'), ('training_cycles','enrollment_id'),
        ('training_cycles','student_id'), ('training_cycles','company_id'), ('training_cycles','start_date'),
        ('training_cycles','end_date'), ('training_cycles','status'), ('training_cycles','superseded_by_cycle_id'),
        ('training_cycles','prescription_cleared_at'), ('workouts','id'), ('workouts','cycle_id'),
        ('workouts','company_id'), ('workouts','exercises'), ('workouts','superseded_at'),
        ('payments','id'), ('payments','student_id'), ('payments','company_id'), ('payments','plan_id'),
        ('payments','asaas_payment_id'), ('payments','enrollment_id'), ('payments','lifecycle_applied_at'),
        ('payments','lifecycle_enrollment_id'), ('payments','lifecycle_first_activation')
    ) as dependency(table_name, column_name)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = required_column.table_name
        and column_name = required_column.column_name
    ) then
      raise exception 'missing_dependency_renewal_replacement_column_%.%',
        required_column.table_name, required_column.column_name
        using errcode = '42703';
    end if;
  end loop;
end
$preflight$;

alter table public.enrollments
  add column if not exists carried_over_cycle_id uuid,
  add column if not exists carried_over_cycle_cleared_at timestamptz;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'enrollments_carried_over_cycle_id_fkey'
      and conrelid = 'public.enrollments'::regclass
  ) then
    alter table public.enrollments
      add constraint enrollments_carried_over_cycle_id_fkey
      foreign key (carried_over_cycle_id)
      references public.training_cycles(id)
      on delete set null;
  end if;
end
$fk$;

create index if not exists enrollments_carried_over_cycle_idx
  on public.enrollments (carried_over_cycle_id)
  where carried_over_cycle_id is not null;

comment on column public.enrollments.carried_over_cycle_id is
  'Old cycle with real unsuperseded workouts used as student fallback until the new enrollment receives a prepared cycle.';
comment on column public.enrollments.carried_over_cycle_cleared_at is
  'Set when staff explicitly suppresses inherited carry-over fallback for this enrollment.';

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
set search_path = public
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
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
      and cycle.prescription_cleared_at is null
      and exists (
        select 1
        from public.workouts workout
        where workout.cycle_id = cycle.id
          and workout.company_id = _company_id
          and workout.superseded_at is null
          and jsonb_typeof(coalesce(workout.exercises, '[]'::jsonb)) = 'array'
          and jsonb_array_length(coalesce(workout.exercises, '[]'::jsonb)) > 0
      )
  );
$$;

revoke all on function public.is_enrollment_carried_over_cycle_eligible(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_enrollment_carried_over_cycle_eligible(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function public.select_enrollment_carryover_cycle(
  _previous_enrollment_id uuid,
  _new_enrollment_id uuid,
  _student_id uuid,
  _company_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.enrollments%rowtype;
  v_cycle_id uuid;
  v_prepared_start date;
  v_latest_started_cycle record;
begin
  if _previous_enrollment_id is null then
    return null;
  end if;

  select enrollment.* into v_previous
  from public.enrollments enrollment
  where enrollment.id = _previous_enrollment_id
    and enrollment.student_id = _student_id
    and enrollment.company_id = _company_id
  for update;

  if not found then
    return null;
  end if;

  select cycle.id, cycle.start_date into v_cycle_id, v_prepared_start
  from public.training_cycles cycle
  where cycle.enrollment_id = _previous_enrollment_id
    and public.is_enrollment_carried_over_cycle_eligible(
      _new_enrollment_id, _student_id, _company_id, cycle.id
    )
  order by
    case
      when public.current_business_date() between cycle.start_date and coalesce(cycle.end_date, cycle.start_date) then 0
      else 1
    end,
    cycle.start_date desc nulls last,
    cycle.created_at desc,
    cycle.id desc
  limit 1;

  select cycle.id, cycle.start_date, cycle.prescription_cleared_at
    into v_latest_started_cycle
  from public.training_cycles cycle
  where cycle.enrollment_id = _previous_enrollment_id
    and cycle.student_id = _student_id
    and cycle.company_id = _company_id
    and cycle.start_date is not null
    and cycle.start_date <= public.current_business_date()
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
    and cycle.prescription_cleared_at is not null
  order by cycle.start_date desc nulls last, cycle.created_at desc, cycle.id desc
  limit 1;

  if v_latest_started_cycle.id is not null
    and (v_prepared_start is null or v_latest_started_cycle.start_date >= v_prepared_start) then
    return null;
  end if;

  if v_cycle_id is not null then
    return v_cycle_id;
  end if;

  if v_previous.carried_over_cycle_cleared_at is not null then
    return null;
  end if;

  if v_previous.carried_over_cycle_id is not null
    and public.is_enrollment_carried_over_cycle_eligible(
      _new_enrollment_id, _student_id, _company_id, v_previous.carried_over_cycle_id
    ) then
    return v_previous.carried_over_cycle_id;
  end if;

  return null;
end;
$$;

revoke all on function public.select_enrollment_carryover_cycle(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.select_enrollment_carryover_cycle(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function public.enforce_enrollment_replacement_and_carryover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_id uuid;
begin
  if new.carried_over_cycle_id is not null
     and (
       tg_op = 'INSERT'
       or old.carried_over_cycle_id is distinct from new.carried_over_cycle_id
       or old.student_id is distinct from new.student_id
       or old.company_id is distinct from new.company_id
     ) then
    if new.student_id is null or new.company_id is null then
      raise exception using errcode = '23514', message = 'Carry-over cycle requires enrollment student and company.';
    end if;
    if not public.is_enrollment_carried_over_cycle_eligible(
      new.id, new.student_id, new.company_id, new.carried_over_cycle_id
    ) then
      raise exception using errcode = '23514', message = 'Carry-over cycle must be an eligible old real-workout cycle for the same student/company.';
    end if;
    new.carried_over_cycle_cleared_at := null;
  end if;

  if tg_op = 'UPDATE'
    and old.carried_over_cycle_id is not null
    and new.carried_over_cycle_id is null
    and new.carried_over_cycle_cleared_at is null then
    new.carried_over_cycle_cleared_at := now();
  end if;

  if tg_op = 'INSERT'
     and lower(coalesce(new.status, '')) in ('active', 'awaiting_training', 'awaiting_renewal')
     and lower(coalesce(new.payment_status, '')) = 'paid' then
    perform 1
    from public.students student
    where student.id = new.student_id
      and student.company_id = new.company_id
    for update;

    select enrollment.id into v_previous_id
    from public.enrollments enrollment
    where enrollment.id is distinct from new.id
      and enrollment.student_id = new.student_id
      and enrollment.company_id = new.company_id
      and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
      and lower(coalesce(enrollment.payment_status, '')) = 'paid'
    order by
      case enrollment.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
      enrollment.created_at desc,
      enrollment.id desc
    limit 1
    for update;

    if v_previous_id is not null then
      if new.carried_over_cycle_id is null and new.carried_over_cycle_cleared_at is null then
        new.carried_over_cycle_id := public.select_enrollment_carryover_cycle(
          v_previous_id, new.id, new.student_id, new.company_id
        );
      end if;

      update public.enrollments enrollment
      set status = 'completed',
          updated_at = now()
      where enrollment.id = v_previous_id
        and enrollment.company_id = new.company_id
        and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_enrollment_replacement_and_carryover()
  from public, anon, authenticated;

drop trigger if exists zz_enforce_enrollment_carried_over_cycle on public.enrollments;
drop trigger if exists zz_enforce_enrollment_replacement_and_carryover on public.enrollments;
create trigger zz_enforce_enrollment_replacement_and_carryover
before insert or update of student_id, company_id, status, payment_status, carried_over_cycle_id, carried_over_cycle_cleared_at
on public.enrollments
for each row execute function public.enforce_enrollment_replacement_and_carryover();

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

  v_plan_days := greatest(coalesce(v_plan.duration_days, v_plan.duration_weeks * 7, 90), 1);
  v_cycle_days := greatest(coalesce(v_plan.cycle_duration_days, 42), 1);

  if not coalesce(_clear_carried_over_cycle, false) then
    v_carried_over_cycle_id := public.select_enrollment_carryover_cycle(
      v_current.id, v_new_enrollment_id, _student_id, _company_id
    );
  end if;

  update public.students
  set status = 'active',
      sales_stage = 'active',
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
    _start_date, _start_date + v_plan_days - 1, _start_date, v_cycle_days,
    'paid', coalesce(_payment_date, _start_date), 'active',
    v_carried_over_cycle_id,
    case when coalesce(_clear_carried_over_cycle, false) then now() else null end
  );

  return query select v_new_enrollment_id, v_current.id, v_carried_over_cycle_id;
end;
$$;

revoke all on function public.replace_paid_student_enrollment_internal(uuid, uuid, uuid, uuid, date, date, boolean)
  from public, anon, authenticated;
grant execute on function public.replace_paid_student_enrollment_internal(uuid, uuid, uuid, uuid, date, date, boolean)
  to service_role;

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
  v_new_id uuid;
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

  update public.students
  set status = 'active',
      sales_stage = 'active',
      activated_at = coalesce(activated_at, now()),
      assigned_trainer_id = coalesce(_trainer_id, assigned_trainer_id),
      updated_at = now()
  where id = _student_id and company_id = _company_id;

  insert into public.enrollments (
    student_id, company_id, plan_id, trainer_id, start_date, end_date,
    training_start_date, cycle_duration_days, payment_status, payment_date, status,
    carried_over_cycle_cleared_at
  ) values (
    _student_id, _company_id, _plan_id, coalesce(_trainer_id, v_student.assigned_trainer_id),
    _start_date, _start_date + v_plan_days - 1, _start_date, v_cycle_days,
    'paid', _start_date, 'active',
    case when coalesce(_clear_carried_over_cycle, false) then now() else null end
  ) returning id into v_new_id;

  return query select v_new_id, null::uuid, null::uuid, true;
end;
$$;

revoke all on function public.replace_student_enrollment(uuid, uuid, uuid, uuid, date, boolean)
  from public, anon;
grant execute on function public.replace_student_enrollment(uuid, uuid, uuid, uuid, date, boolean)
  to authenticated, service_role;

comment on function public.replace_student_enrollment(uuid, uuid, uuid, uuid, date, boolean) is
  'Authenticated staff enrollment creation/replacement without billing effects. Paid renewals replace the open paid enrollment; first manual starts create a full training window.';

create or replace function public.apply_paid_payment_lifecycle(
  _student_id uuid,
  _company_id uuid,
  _plan_id uuid,
  _asaas_payment_id text,
  _business_date date,
  _assessment_due_date date
)
returns table (
  enrollment_id uuid,
  first_activation boolean,
  already_applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_student public.students%rowtype;
  v_plan public.plans%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_replacement record;
  v_enrollment_id uuid;
  v_first_activation boolean;
  v_plan_days integer;
  v_cycle_days integer;
begin
  if _student_id is null or _company_id is null or _plan_id is null
    or nullif(btrim(_asaas_payment_id), '') is null or _business_date is null
    or _assessment_due_date is null or _assessment_due_date < _business_date then
    raise exception using errcode = '22023', message = 'Parâmetros incompletos para aplicar pagamento.';
  end if;

  select payment.* into v_payment
  from public.payments payment
  where payment.asaas_payment_id = _asaas_payment_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Pagamento local não encontrado para aplicar lifecycle.';
  end if;
  if v_payment.student_id is distinct from _student_id
    or v_payment.company_id is distinct from _company_id
    or v_payment.plan_id is distinct from _plan_id then
    raise exception using errcode = '23514', message = 'Pagamento, aluno, empresa e plano não pertencem ao mesmo checkout.';
  end if;

  if v_payment.lifecycle_applied_at is not null then
    if v_payment.lifecycle_enrollment_id is null or v_payment.lifecycle_first_activation is null then
      raise exception using errcode = '23514', message = 'Lifecycle marcado sem snapshot local completo.';
    end if;
    return query select v_payment.lifecycle_enrollment_id, v_payment.lifecycle_first_activation, true;
    return;
  end if;

  select student.* into v_student
  from public.students student
  where student.id = _student_id
  for update;
  if not found or v_student.company_id is distinct from _company_id then
    raise exception using errcode = '23514', message = 'Aluno não pertence à empresa do pagamento.';
  end if;

  select plan.* into v_plan
  from public.plans plan
  where plan.id = _plan_id
  for share;
  if not found or (v_plan.company_id is not null and v_plan.company_id is distinct from _company_id) then
    raise exception using errcode = '23514', message = 'Plano não pertence à empresa do pagamento.';
  end if;

  v_plan_days := greatest(coalesce(v_plan.duration_days, v_plan.duration_weeks * 7, 90), 1);
  v_cycle_days := greatest(coalesce(v_plan.cycle_duration_days, 42), 1);

  select enrollment.* into v_enrollment
  from public.enrollments enrollment
  where enrollment.student_id = _student_id
    and enrollment.company_id = _company_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by
    case enrollment.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    enrollment.created_at desc,
    enrollment.id desc
  limit 1
  for update;

  v_first_activation := v_student.activated_at is null
    and v_enrollment.id is null
    and coalesce(v_student.status, '') not in ('active', 'awaiting_renewal');

  update public.students
  set status = 'active',
      sales_stage = case when v_first_activation then 'active_onboarding' else 'active' end,
      activated_at = coalesce(activated_at, now()),
      assessment_due_at = case when v_first_activation then _assessment_due_date::timestamptz else assessment_due_at end,
      updated_at = now()
  where id = _student_id and company_id = _company_id;

  if v_enrollment.id is null then
    insert into public.enrollments (
      student_id, plan_id, trainer_id, start_date, end_date,
      cycle_duration_days, payment_status, payment_date, status, company_id
    ) values (
      _student_id, _plan_id, v_student.assigned_trainer_id, _business_date,
      _business_date + v_plan_days - 1, v_cycle_days, 'paid', _business_date, 'active', _company_id
    ) returning id into v_enrollment_id;
  elsif lower(coalesce(v_enrollment.payment_status, '')) <> 'paid' then
    update public.enrollments enrollment
    set plan_id = _plan_id,
        status = 'active',
        payment_status = 'paid',
        payment_date = _business_date,
        updated_at = now()
    where enrollment.id = v_enrollment.id and enrollment.company_id = _company_id
    returning enrollment.id into v_enrollment_id;
  else
    select * into v_replacement
    from public.replace_paid_student_enrollment_internal(
      _student_id, _company_id, _plan_id, null::uuid, _business_date, _business_date, false
    );
    v_enrollment_id := v_replacement.enrollment_id;
  end if;

  if v_enrollment_id is null then
    raise exception using errcode = '23514', message = 'Pagamento confirmado sem matrícula local aplicada.';
  end if;

  update public.payments
  set enrollment_id = v_enrollment_id,
      lifecycle_enrollment_id = v_enrollment_id,
      lifecycle_first_activation = v_first_activation,
      lifecycle_applied_at = now(),
      updated_at = now()
  where id = v_payment.id;

  return query select v_enrollment_id, v_first_activation, false;
end;
$$;

revoke execute on function public.apply_paid_payment_lifecycle(uuid, uuid, uuid, text, date, date)
  from public, anon, authenticated;
grant execute on function public.apply_paid_payment_lifecycle(uuid, uuid, uuid, text, date, date)
  to service_role;

comment on function public.apply_paid_payment_lifecycle(uuid, uuid, uuid, text, date, date) is
  'Applies a paid lifecycle exactly once. Initial paid activation preserves no-auto-cycle semantics; already-paid renewals replace the enrollment period and carry the last real workout cycle as fallback.';

commit;
