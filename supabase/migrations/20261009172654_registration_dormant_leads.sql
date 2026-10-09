-- Reuse lost as the dormant Leads bucket; keep profiles and operational status intact.
-- The student lock is shared with enrollment creation/activation guards.
create or replace function public.set_registration_lead_stage(
  _company_id uuid,
  _entity_type text,
  _record_id uuid,
  _expected_stage text,
  _target_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student public.students%rowtype;
  v_lead public.leads%rowtype;
  v_current_stage text;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Autenticação obrigatória.';
  end if;
  if _company_id is null or _record_id is null
     or _entity_type is null or _entity_type not in ('student', 'lead')
     or _target_stage is null or _target_stage not in ('lost', 'contacted')
     or _expected_stage is null or _expected_stage not in (
       'interested', 'contacted', 'fiscal_registration_pending', 'payment_pending', 'lost'
     ) then
    raise exception using errcode = '22023', message = 'Transição de lead inválida.';
  end if;
  if _target_stage = 'contacted' and _expected_stage <> 'lost' then
    raise exception using errcode = '23514', message = 'Retome o contato a partir de Leads.';
  end if;

  if _entity_type = 'student' then
    if not coalesce(public.can_manage_staff_student(_company_id, _record_id), false) then
      raise exception using errcode = '42501', message = 'Sem permissão para alterar este perfil.';
    end if;
    select * into v_student from public.students
    where id = _record_id and company_id = _company_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Perfil não encontrado.';
    end if;

    if coalesce(v_student.status, '') in ('active', 'awaiting_training', 'awaiting_renewal', 'trial')
       or coalesce(v_student.sales_stage, '') in ('active', 'active_onboarding')
       or exists (
         select 1 from public.enrollments e
         where e.student_id = v_student.id and e.company_id = _company_id
           and e.status in ('active', 'awaiting_training', 'awaiting_renewal', 'trial')
       ) then
      raise exception using errcode = '23514',
        message = 'Aluno em acompanhamento não pode ser transformado em lead. Revise a matrícula no perfil.';
    end if;

    v_current_stage := case
      when v_student.sales_stage in (
        'interested', 'contacted', 'fiscal_registration_pending', 'payment_pending', 'lost'
      ) then v_student.sales_stage
      when v_student.status = 'inactive' then 'lost'
      when v_student.status = 'pending' then 'payment_pending'
      else 'interested'
    end;
    if v_current_stage <> _expected_stage then
      raise exception using errcode = '40001', message = 'A etapa mudou. Atualize a esteira antes de continuar.';
    end if;

    update public.students
    set sales_stage = _target_stage, updated_at = now()
    where id = v_student.id and company_id = _company_id;
  else
    if not coalesce(
      public.is_company_staff(auth.uid(), _company_id)
      or public.has_role(auth.uid(), 'master'::public.app_role), false
    ) then
      raise exception using errcode = '42501', message = 'Sem permissão para alterar este lead.';
    end if;
    select * into v_lead from public.leads
    where id = _record_id and company_id = _company_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Lead não encontrado.';
    end if;
    if v_lead.converted_to_student_id is not null then
      raise exception using errcode = '23514', message = 'Este pré-cadastro já possui um perfil. Atualize a esteira.';
    end if;
    v_current_stage := case
      when v_lead.stage = 'fiscal_registration' then 'fiscal_registration_pending'
      else coalesce(v_lead.stage, 'interested')
    end;
    if v_current_stage <> _expected_stage then
      raise exception using errcode = '40001', message = 'A etapa mudou. Atualize a esteira antes de continuar.';
    end if;

    update public.leads
    set stage = _target_stage, updated_at = now()
    where id = v_lead.id and company_id = _company_id;
  end if;

  return jsonb_build_object('id', _record_id, 'stage', _target_stage);
end;
$$;

revoke all on function public.set_registration_lead_stage(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.set_registration_lead_stage(uuid, text, uuid, text, text) to authenticated;

comment on function public.set_registration_lead_stage(uuid, text, uuid, text, text) is
  'Moves a registration to dormant Leads or resumes contact without deleting data, changing enrollment/status, or sending messages.';
