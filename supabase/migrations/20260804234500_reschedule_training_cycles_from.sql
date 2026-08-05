-- Reagenda um ciclo e todos os seguintes pelo mesmo deslocamento de dias.
-- A vigencia financeira da matricula permanece intacta; somente o calendario
-- tecnico de treino e ajustado.
create or replace function public.reschedule_training_cycles_from(
  p_enrollment_id uuid,
  p_cycle_id uuid,
  p_new_start_date date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_cycle_number integer;
  v_current_start date;
  v_previous_end date;
  v_shift_days integer;
begin
  if p_new_start_date is null then
    raise exception 'Informe a nova data de inicio';
  end if;

  select e.company_id
    into v_company_id
    from public.enrollments e
   where e.id = p_enrollment_id;

  if v_company_id is null then
    raise exception 'Matricula nao encontrada';
  end if;

  if not (
    public.has_role(auth.uid(), 'master'::public.app_role)
    or exists (
      select 1
        from public.company_members cm
       where cm.user_id = auth.uid()
         and cm.company_id = v_company_id
    )
  ) then
    raise exception 'Sem permissao para reagendar os ciclos desta matricula';
  end if;

  -- Serializa reagendamentos concorrentes da mesma matricula.
  perform 1
    from public.training_cycles tc
   where tc.enrollment_id = p_enrollment_id
   order by tc.cycle_number
   for update;

  select tc.cycle_number, tc.start_date
    into v_cycle_number, v_current_start
    from public.training_cycles tc
   where tc.id = p_cycle_id
     and tc.enrollment_id = p_enrollment_id;

  if v_cycle_number is null or v_current_start is null then
    raise exception 'Ciclo nao encontrado nesta matricula';
  end if;

  select tc.end_date
    into v_previous_end
    from public.training_cycles tc
   where tc.enrollment_id = p_enrollment_id
     and tc.cycle_number < v_cycle_number
   order by tc.cycle_number desc
   limit 1;

  if v_previous_end is not null and p_new_start_date <= v_previous_end then
    raise exception 'A nova data deve ser posterior ao termino do ciclo anterior (%)',
      to_char(v_previous_end, 'DD/MM/YYYY');
  end if;

  v_shift_days := p_new_start_date - v_current_start;

  if v_shift_days <> 0 then
    update public.training_cycles tc
       set start_date = tc.start_date + v_shift_days,
           end_date = tc.end_date + v_shift_days
     where tc.enrollment_id = p_enrollment_id
       and tc.cycle_number >= v_cycle_number;
  end if;

  if v_cycle_number = 1 then
    update public.enrollments e
       set training_start_date = p_new_start_date
     where e.id = p_enrollment_id;
  end if;
end;
$function$;

revoke all on function public.reschedule_training_cycles_from(uuid, uuid, date)
  from public, anon;
grant execute on function public.reschedule_training_cycles_from(uuid, uuid, date)
  to authenticated;

comment on function public.reschedule_training_cycles_from(uuid, uuid, date) is
  'Moves the selected training cycle and every following cycle by the same day offset without changing enrollment contract dates.';
