-- Captured production definition before the chronological rescheduling repair.
-- This restores the old historical-overlap restriction; it does not change data.
CREATE OR REPLACE FUNCTION public.reschedule_training_cycles_from(p_enrollment_id uuid, p_cycle_id uuid, p_new_start_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid; v_student_id uuid; v_cycle_number integer; v_current_start date; v_previous_end date;
  v_shift_days integer; v_is_first boolean;
begin
  if p_new_start_date is null then raise exception 'Informe a nova data de inicio'; end if;
  select enrollment.company_id, enrollment.student_id into v_company_id, v_student_id from public.enrollments enrollment
  where enrollment.id = p_enrollment_id for update;
  if v_company_id is null then raise exception 'Matricula nao encontrada'; end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
    and not public.can_manage_staff_student(v_company_id, v_student_id) then
    raise exception 'Sem permissao para reagendar os ciclos desta matricula';
  end if;
  perform cycle.id from public.training_cycles cycle where cycle.enrollment_id = p_enrollment_id
  order by cycle.id for update;
  if exists (
    select 1 from public.training_cycles left_cycle join public.training_cycles right_cycle
      on right_cycle.enrollment_id = left_cycle.enrollment_id and right_cycle.id > left_cycle.id
      and right_cycle.status <> 'superseded' and right_cycle.superseded_by_cycle_id is null
      and left_cycle.start_date <= right_cycle.end_date and right_cycle.start_date <= left_cycle.end_date
    where left_cycle.enrollment_id = p_enrollment_id and left_cycle.status <> 'superseded'
      and left_cycle.superseded_by_cycle_id is null
  ) then raise exception 'Existem ciclos sobrepostos. Corrija a duplicidade antes de reagendar.'; end if;
  select cycle.cycle_number, cycle.start_date into v_cycle_number, v_current_start
  from public.training_cycles cycle where cycle.id = p_cycle_id and cycle.enrollment_id = p_enrollment_id
    and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
  if v_cycle_number is null or v_current_start is null then raise exception 'Ciclo nao encontrado nesta matricula'; end if;
  select cycle.end_date into v_previous_end from public.training_cycles cycle
  where cycle.enrollment_id = p_enrollment_id and cycle.cycle_number < v_cycle_number
    and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null
  order by cycle.cycle_number desc limit 1;
  if v_previous_end is not null and p_new_start_date <= v_previous_end then
    raise exception 'A nova data deve ser posterior ao termino do ciclo anterior (%)', to_char(v_previous_end, 'DD/MM/YYYY');
  end if;
  if exists (
    select 1 from public.training_cycles cycle join public.workouts workout on workout.cycle_id = cycle.id
    where cycle.enrollment_id = p_enrollment_id and cycle.cycle_number >= v_cycle_number
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null
      and (exists (select 1 from public.workout_sessions session where session.workout_id = workout.id)
        or exists (select 1 from public.workout_logs log where log.workout_id = workout.id))
  ) then raise exception 'A data não pode ser alterada porque já existem treinos realizados neste ciclo.'; end if;
  v_shift_days := p_new_start_date - v_current_start;
  select not exists (select 1 from public.training_cycles cycle
    where cycle.enrollment_id = p_enrollment_id and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null and cycle.cycle_number < v_cycle_number) into v_is_first;
  if v_shift_days <> 0 then
    update public.training_cycles cycle set status = 'pending'
    where cycle.enrollment_id = p_enrollment_id and cycle.status = 'active'
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
    update public.training_cycles cycle set start_date = cycle.start_date + v_shift_days,
      end_date = cycle.end_date + v_shift_days,
      status = case when cycle.end_date + v_shift_days < public.current_business_date() then 'completed'
        when public.current_business_date() between cycle.start_date + v_shift_days and cycle.end_date + v_shift_days then 'active' else 'pending' end
    where cycle.enrollment_id = p_enrollment_id and cycle.cycle_number >= v_cycle_number
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
    insert into private.training_cycle_rebase_authorizations (transaction_id, enrollment_id)
    values (txid_current(), p_enrollment_id);
    update public.enrollments enrollment
    set training_start_date = case when v_is_first then p_new_start_date else enrollment.training_start_date end,
      end_date = enrollment.end_date + v_shift_days, updated_at = now()
    where enrollment.id = p_enrollment_id;
    delete from private.training_cycle_rebase_authorizations authz
    where authz.transaction_id = txid_current() and authz.enrollment_id = p_enrollment_id;
  end if;
end;
$function$
