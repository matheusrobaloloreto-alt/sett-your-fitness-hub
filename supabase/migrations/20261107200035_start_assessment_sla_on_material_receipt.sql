-- Keep the existing RPC signatures during rollout. Receipt-backed dates are
-- stored separately from the legacy payment-derived date.
begin;

create or replace function public.apply_paid_payment_lifecycle(_student_id uuid,
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
  v_carried_over_cycle_id uuid;
  v_first_activation boolean;
  v_plan_days integer;
  v_cycle_days integer;
begin
  if _student_id is null or _company_id is null or _plan_id is null
    or nullif(btrim(_asaas_payment_id), '') is null or _business_date is null then
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
    and coalesce(v_student.status, '') not in ('active', 'awaiting_renewal')
    and not exists (
      select 1 from public.enrollments previous
      where previous.student_id = _student_id and previous.company_id = _company_id
        and lower(coalesce(previous.payment_status, '')) = 'paid'
    );

  update public.students
  set status = 'active',
      sales_stage = case when v_first_activation or v_student.sales_stage = 'active_onboarding'
        then 'active_onboarding' else 'active' end,
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = _student_id and company_id = _company_id;

  if v_enrollment.id is null then
    v_enrollment_id := gen_random_uuid();
    if not v_first_activation then
      v_carried_over_cycle_id := private.select_completed_enrollment_carryover(
        _student_id, _company_id, v_enrollment_id
      );
    end if;
    insert into public.enrollments (
      id, student_id, plan_id, trainer_id, start_date, end_date, training_start_date,
      cycle_duration_days, payment_status, payment_date, status, company_id, carried_over_cycle_id
    ) values (
      v_enrollment_id, _student_id, _plan_id, v_student.assigned_trainer_id, _business_date,
      _business_date + v_plan_days - 1, case when not v_first_activation
        and private.has_trusted_prior_training(_student_id, _company_id, v_enrollment_id) then _business_date end,
      v_cycle_days, 'paid', _business_date, 'active', _company_id, v_carried_over_cycle_id
    );
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

revoke all on function public.apply_paid_payment_lifecycle(uuid, uuid, uuid, text, date, date)
  from public, anon, authenticated;
grant execute on function public.apply_paid_payment_lifecycle(uuid, uuid, uuid, text, date, date) to service_role;

create or replace function public.move_student_to_assessment_stage(
  _student_id uuid,
  _reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_enrollment_id uuid;
  v_actor uuid := auth.uid();
  v_assessment_due date;
  v_reason text := nullif(btrim(coalesce(_reason, '')), '');
begin
  if v_actor is null then
    raise exception 'Sessão expirada.' using errcode = '42501';
  end if;

  select * into v_student
  from public.students
  where id = _student_id
  for update;

  if not found then
    raise exception 'Aluno não encontrado.' using errcode = 'P0002';
  end if;

  if not (
    public.has_role(v_actor, 'master'::public.app_role)
    or (
      public.is_company_staff(v_actor, v_student.company_id)
      and (
        public.has_role(v_actor, 'admin'::public.app_role)
        or public.has_role(v_actor, 'coordinator'::public.app_role)
      )
    )
  ) then
    raise exception 'Somente administradores ou coordenadores podem reconciliar um pagamento manualmente.'
      using errcode = '42501';
  end if;

  if v_student.sales_stage is distinct from 'payment_pending' then
    raise exception 'O aluno precisa estar na etapa Pagamento para esta transição.'
      using errcode = '22023';
  end if;

  if v_reason is null or char_length(v_reason) < 8 then
    raise exception 'Informe como o pagamento foi conferido (mínimo de 8 caracteres).'
      using errcode = '22023';
  end if;

  select e.id into v_enrollment_id
  from public.enrollments e
  where e.student_id = v_student.id
    and e.company_id = v_student.company_id
    and e.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and e.payment_status = 'paid'
  order by e.created_at desc
  limit 1;

  if v_enrollment_id is null then
    raise exception 'Pagamento ainda sem comprovação operacional. Sincronize o Asaas ou marque a matrícula correta como paga antes de avançar.'
      using errcode = '23514';
  end if;

  perform private.defer_initial_enrollment_schedule(v_enrollment_id);

  select assessment_due_on into v_assessment_due
  from public.assessment_material_receipts
  where student_id = v_student.id and company_id = v_student.company_id;

  update public.students
  set
    status = 'active',
    sales_stage = 'active_onboarding',
    activated_at = coalesce(activated_at, now()),
    updated_at = now()
  where id = v_student.id;

  insert into public.student_funnel_events (
    student_id,
    company_id,
    event_type,
    event_key,
    status,
    payload,
    processed_at
  ) values (
    v_student.id,
    v_student.company_id,
    'manual_payment_reconciliation',
    'manual_payment_reconciliation:' || gen_random_uuid()::text,
    'completed',
    jsonb_build_object(
      'actor_id', v_actor,
      'reason', left(v_reason, 500),
      'from_stage', v_student.sales_stage,
      'to_stage', 'active_onboarding',
      'paid_enrollment_id', v_enrollment_id
    ),
    now()
  );

  return jsonb_build_object(
    'student_id', v_student.id,
    'sales_stage', 'active_onboarding',
    'assessment_due_at', v_assessment_due,
    'audit_recorded', true,
    'message_sent', false
  );
end;
$$;

revoke all on function public.move_student_to_assessment_stage(uuid, text) from public, anon;
grant execute on function public.move_student_to_assessment_stage(uuid, text) to authenticated;

create function public.activate_student_enrollment_manually(
  _company_id uuid, _student_id uuid, _plan_id uuid, _start_date date, _reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := btrim(coalesce(_reason, ''));
  v_student public.students%rowtype;
  v_activation record;
begin
  if v_actor is null or not public.can_manage_staff_student(_company_id, _student_id)
    or not (
      public.has_role(v_actor, 'admin'::public.app_role)
      or public.has_role(v_actor, 'coordinator'::public.app_role)
      or public.has_role(v_actor, 'master'::public.app_role)
    ) then
    raise exception 'Somente administradores e coordenadores podem ativar a matrícula manualmente.' using errcode = '42501';
  end if;

  if _start_date is null or not isfinite(_start_date) or char_length(v_reason) not between 8 and 500 then
    raise exception 'Informe a data de início da matrícula e o motivo da ativação manual.' using errcode = '22023';
  end if;

  select * into v_student from public.students
  where id = _student_id and company_id = _company_id for update;
  if not found or v_student.status is distinct from 'pending'
    or coalesce(v_student.sales_stage, 'payment_pending') <> 'payment_pending' then
    raise exception 'O cadastro mudou. Confira a etapa de pagamento antes de ativar.' using errcode = 'PT409';
  end if;

  perform 1 from public.plans
  where id = _plan_id and company_id = _company_id and is_active
    and coalesce(plan_kind, 'standard') <> 'influencer'
  for share;
  if not found then
    raise exception 'Selecione um plano ativo desta empresa.' using errcode = '22023';
  end if;

  select * into strict v_activation from public.replace_student_enrollment(
    _student_id, _company_id, _plan_id, null, _start_date, false
  );
  if v_activation.first_activation is not true then
    raise exception 'Este aluno já tem histórico de matrícula. Use a opção de renovação.' using errcode = 'PT409';
  end if;

  update public.students set selected_plan_id = _plan_id
  where id = _student_id and company_id = _company_id;

  -- Grant coverage using the existing enrollment contract, without recording a payment date.
  update public.enrollments set payment_date = null
  where id = v_activation.enrollment_id and student_id = _student_id and company_id = _company_id;

  insert into public.student_funnel_events (student_id, company_id, event_type, event_key, status, payload, processed_at)
  values (_student_id, _company_id, 'manual_payment_reconciliation',
    'manual_enrollment_activation:' || v_activation.enrollment_id, 'completed',
    jsonb_build_object('actor_id', v_actor, 'reason', v_reason, 'source', 'manual_activation',
      'enrollment_id', v_activation.enrollment_id), now());

  return v_activation.enrollment_id;
end;
$$;

revoke all on function public.activate_student_enrollment_manually(uuid, uuid, uuid, date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_student_enrollment_manually(uuid, uuid, uuid, date, text) to authenticated;

commit;
