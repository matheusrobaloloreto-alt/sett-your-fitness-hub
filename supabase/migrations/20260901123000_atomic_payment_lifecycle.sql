-- Apply the paid student/enrollment lifecycle exactly once per Asaas charge.
-- The function runs in one database transaction, so retries cannot extend the
-- same enrollment twice after a partial failure.

alter table public.payments
  add column if not exists lifecycle_applied_at timestamptz,
  add column if not exists lifecycle_first_activation boolean,
  add column if not exists lifecycle_enrollment_id uuid references public.enrollments(id) on delete set null;

comment on column public.payments.lifecycle_applied_at is
  'Set atomically after the paid student/enrollment lifecycle is fully applied.';
comment on column public.payments.lifecycle_first_activation is
  'Immutable result of the paid lifecycle, used by idempotent onboarding retries.';
comment on column public.payments.lifecycle_enrollment_id is
  'Enrollment created, activated or renewed by this payment lifecycle.';

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
  v_enrollment_id uuid;
  v_first_activation boolean;
  v_plan_days integer;
  v_cycle_days integer;
  v_extension_start date;
  v_new_end date;
  v_cycle_number integer;
  v_cycle_start date;
  v_cycle_end date;
  v_last_cycle_end date;
begin
  if _student_id is null or _company_id is null or _plan_id is null
    or nullif(btrim(_asaas_payment_id), '') is null or _business_date is null
    or _assessment_due_date is null or _assessment_due_date < _business_date then
    raise exception using errcode = '22023', message = 'Parâmetros incompletos para aplicar pagamento.';
  end if;

  select p.*
    into v_payment
  from public.payments p
  where p.asaas_payment_id = _asaas_payment_id
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
    return query select
      v_payment.lifecycle_enrollment_id,
      v_payment.lifecycle_first_activation,
      true;
    return;
  end if;

  select s.*
    into v_student
  from public.students s
  where s.id = _student_id
  for update;
  if not found or v_student.company_id is distinct from _company_id then
    raise exception using errcode = '23514', message = 'Aluno não pertence à empresa do pagamento.';
  end if;

  select pl.*
    into v_plan
  from public.plans pl
  where pl.id = _plan_id
  for share;
  if not found or (v_plan.company_id is not null and v_plan.company_id is distinct from _company_id) then
    raise exception using errcode = '23514', message = 'Plano não pertence à empresa do pagamento.';
  end if;

  v_plan_days := greatest(coalesce(v_plan.duration_days, v_plan.duration_weeks * 7, 90), 1);
  v_cycle_days := greatest(coalesce(v_plan.cycle_duration_days, 42), 1);

  select e.*
    into v_enrollment
  from public.enrollments e
  where e.student_id = _student_id
    and e.company_id = _company_id
    and e.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by
    case e.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    e.created_at desc
  limit 1
  for update;

  v_first_activation := v_student.activated_at is null
    and v_enrollment.id is null
    and coalesce(v_student.status, '') not in ('active', 'awaiting_renewal');

  update public.students
  set status = 'active',
      sales_stage = case when v_first_activation then 'active_onboarding' else 'active' end,
      activated_at = coalesce(activated_at, now()),
      assessment_due_at = case
        when v_first_activation then _assessment_due_date::timestamptz
        else assessment_due_at
      end,
      updated_at = now()
  where id = _student_id
    and company_id = _company_id;

  if v_enrollment.id is null then
    insert into public.enrollments (
      student_id,
      plan_id,
      trainer_id,
      start_date,
      end_date,
      cycle_duration_days,
      payment_status,
      payment_date,
      status,
      company_id
    ) values (
      _student_id,
      _plan_id,
      v_student.assigned_trainer_id,
      _business_date,
      _business_date + v_plan_days - 1,
      v_cycle_days,
      'paid',
      _business_date,
      'active',
      _company_id
    ) returning id into v_enrollment_id;
  elsif coalesce(v_enrollment.payment_status, '') <> 'paid' then
    update public.enrollments
    set plan_id = _plan_id,
        status = 'active',
        payment_status = 'paid',
        payment_date = _business_date,
        updated_at = now()
    where id = v_enrollment.id
      and company_id = _company_id
    returning id into v_enrollment_id;
  else
    v_extension_start := case
      when v_enrollment.end_date is not null and v_enrollment.end_date > _business_date
        then v_enrollment.end_date
      else _business_date
    end;
    v_new_end := v_extension_start + v_plan_days;

    update public.enrollments
    set end_date = v_new_end,
        plan_id = _plan_id,
        status = 'active',
        payment_status = 'paid',
        payment_date = _business_date,
        updated_at = now()
    where id = v_enrollment.id
      and company_id = _company_id
    returning id into v_enrollment_id;

    select coalesce(max(tc.cycle_number), 0), max(tc.end_date)
      into v_cycle_number, v_last_cycle_end
    from public.training_cycles tc
    where tc.enrollment_id = v_enrollment_id;

    v_cycle_number := v_cycle_number + 1;
    v_cycle_start := coalesce(v_last_cycle_end + 1, v_extension_start + 1);
    while v_cycle_start <= v_new_end loop
      v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_new_end);
      insert into public.training_cycles (
        enrollment_id,
        student_id,
        company_id,
        cycle_number,
        start_date,
        end_date,
        duration_weeks,
        status,
        name
      ) values (
        v_enrollment_id,
        _student_id,
        _company_id,
        v_cycle_number,
        v_cycle_start,
        v_cycle_end,
        greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
        case
          when v_cycle_end < _business_date then 'completed'
          when _business_date between v_cycle_start and v_cycle_end then 'active'
          else 'pending'
        end,
        format('Ciclo %s', v_cycle_number)
      );
      v_cycle_number := v_cycle_number + 1;
      v_cycle_start := v_cycle_end + 1;
    end loop;
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
