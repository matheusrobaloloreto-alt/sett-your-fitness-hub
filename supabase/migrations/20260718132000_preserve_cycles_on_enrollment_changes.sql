-- Never erase prescribed cycles or student history when an enrollment date is
-- edited. Empty placeholders may be realigned; materialized cycles force the
-- caller to create a new enrollment/renewal instead.

create or replace function public.generate_training_cycles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_cycle_days integer := 42;
  v_plan_days integer := 42;
  v_cycle_number integer := 1;
  v_cycle_start date;
  v_cycle_end date;
  v_existing_cycle_id uuid;
begin
  if new.training_start_date is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.training_start_date is not distinct from new.training_start_date then
    return new;
  end if;

  v_start := new.training_start_date;

  if new.plan_id is not null then
    select
      coalesce(p.cycle_duration_days, 42),
      coalesce(p.duration_days, p.duration_weeks * 7, 42)
    into v_cycle_days, v_plan_days
    from public.plans p
    where p.id = new.plan_id;
  end if;

  -- A prescrição longitudinal do SETT usa blocos de seis semanas. O fallback
  -- só protege planos legados cujo cadastro ainda não tenha esse valor.
  v_cycle_days := case when coalesce(v_cycle_days, 42) > 0 then coalesce(v_cycle_days, 42) else 42 end;
  v_plan_days := greatest(coalesce(v_plan_days, 42), 1);
  v_end := coalesce(new.end_date, v_start + v_plan_days - 1);
  if v_end < v_start then
    v_end := v_start + v_plan_days - 1;
  end if;

  if tg_op = 'UPDATE' and exists (
    select 1
    from public.training_cycles tc
    where tc.enrollment_id = new.id
      and (
        tc.bundle_id is not null
        or exists (select 1 from public.workouts w where w.cycle_id = tc.id)
        or exists (select 1 from public.prescription_bundles pb where pb.training_cycle_id = tc.id)
        or exists (select 1 from public.ai_strength_plans sp where sp.training_cycle_id = tc.id)
        or exists (select 1 from public.running_plans rp where rp.training_cycle_id = tc.id)
        or exists (select 1 from public.nutrition_plans np where np.training_cycle_id = tc.id)
        or exists (select 1 from public.cycle_feedback cf where cf.cycle_id = tc.id)
        or exists (select 1 from public.ai_plan_versions pv where pv.cycle_id = tc.id)
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'A data inicial não pode ser alterada porque esta matrícula já possui treinos, prescrições ou histórico. Crie uma renovação para preservar os dados do aluno.';
  end if;

  v_cycle_start := v_start;
  while v_cycle_start <= v_end loop
    v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_end);

    select tc.id
    into v_existing_cycle_id
    from public.training_cycles tc
    where tc.enrollment_id = new.id
      and tc.cycle_number = v_cycle_number;

    if v_existing_cycle_id is null then
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
        new.id,
        new.student_id,
        new.company_id,
        v_cycle_number,
        v_cycle_start,
        v_cycle_end,
        greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
        case
          when v_cycle_end < current_date then 'completed'
          when current_date between v_cycle_start and v_cycle_end then 'active'
          else 'pending'
        end,
        format('Ciclo %s', v_cycle_number)
      );
    else
      update public.training_cycles
      set student_id = new.student_id,
          company_id = new.company_id,
          start_date = v_cycle_start,
          end_date = v_cycle_end,
          duration_weeks = greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
          status = case
            when v_cycle_end < current_date then 'completed'
            when current_date between v_cycle_start and v_cycle_end then 'active'
            else 'pending'
          end,
          name = coalesce(name, format('Ciclo %s', v_cycle_number))
      where id = v_existing_cycle_id;
    end if;

    v_cycle_number := v_cycle_number + 1;
    v_cycle_start := v_cycle_end + 1;
    v_existing_cycle_id := null;
  end loop;

  -- Only placeholders are reachable here. A materialized enrollment was
  -- rejected above, so trimming excess empty cycles cannot erase history.
  delete from public.training_cycles tc
  where tc.enrollment_id = new.id
    and tc.cycle_number >= v_cycle_number;

  return new;
end;
$$;
revoke execute on function public.generate_training_cycles() from public, anon, authenticated;
grant execute on function public.generate_training_cycles() to service_role;
