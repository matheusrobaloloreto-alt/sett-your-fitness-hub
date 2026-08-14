-- Allow an explicit Kanban reconciliation from payment to assessment without
-- weakening the payment invariant. The transition is accepted only when an
-- operational enrollment is already marked paid and is recorded in the
-- append-only funnel event trail with the authenticated actor and a reason.

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
  -- Business deadlines follow the company's São Paulo calendar regardless of
  -- the database session timezone or the UTC date at execution time.
  v_due_date date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_days_added integer := 0;
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

  while v_days_added < 5 loop
    v_due_date := v_due_date + 1;
    if extract(isodow from v_due_date) < 6 then
      v_days_added := v_days_added + 1;
    end if;
  end loop;

  update public.students
  set
    status = 'active',
    sales_stage = 'active_onboarding',
    activated_at = coalesce(activated_at, now()),
    assessment_due_at = coalesce(assessment_due_at, v_due_date),
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
    'assessment_due_at', coalesce(v_student.assessment_due_at, v_due_date),
    'audit_recorded', true,
    'message_sent', false
  );
end;
$$;

revoke all on function public.move_student_to_assessment_stage(uuid, text) from public, anon;
grant execute on function public.move_student_to_assessment_stage(uuid, text) to authenticated;

comment on function public.move_student_to_assessment_stage(uuid, text) is
  'Audited staff-only Kanban reconciliation. Requires an operational paid enrollment and never sends WhatsApp automatically.';
