-- Longitudinal prescription schedule: every enrollment is split into dated
-- 6-week cycles, and every modality can be attached to the same cycle.

alter table public.training_cycles
  add column if not exists duration_weeks integer,
  add column if not exists name text;
alter table public.ai_strength_plans
  add column if not exists training_cycle_id uuid references public.training_cycles(id) on delete set null,
  add column if not exists previous_plan_id uuid references public.ai_strength_plans(id) on delete set null,
  add column if not exists sequence_number integer,
  add column if not exists sequence_phase text;
alter table public.running_plans
  add column if not exists training_cycle_id uuid references public.training_cycles(id) on delete set null,
  add column if not exists previous_plan_id uuid references public.running_plans(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists sequence_number integer,
  add column if not exists sequence_phase text;
alter table public.nutrition_plans
  add column if not exists training_cycle_id uuid references public.training_cycles(id) on delete set null,
  add column if not exists previous_plan_id uuid references public.nutrition_plans(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists sequence_number integer,
  add column if not exists sequence_phase text;
alter table public.prescription_bundles
  add column if not exists training_cycle_id uuid references public.training_cycles(id) on delete set null;
create unique index if not exists training_cycles_enrollment_number_uidx
  on public.training_cycles(enrollment_id, cycle_number)
  where enrollment_id is not null;
create unique index if not exists ai_strength_plans_cycle_uidx
  on public.ai_strength_plans(training_cycle_id)
  where training_cycle_id is not null;
create unique index if not exists running_plans_cycle_sport_uidx
  on public.running_plans(training_cycle_id, coalesce(sport, 'corrida'))
  where training_cycle_id is not null;
create unique index if not exists nutrition_plans_cycle_uidx
  on public.nutrition_plans(training_cycle_id)
  where training_cycle_id is not null;
create index if not exists running_plans_student_dates_idx
  on public.running_plans(student_id, start_date, end_date);
create index if not exists nutrition_plans_student_dates_idx
  on public.nutrition_plans(student_id, start_date, end_date);
-- Date is the source of truth. This also repairs stale statuses without
-- prematurely activating a future block.
create or replace function public.advance_training_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.training_cycles
  set status = case
    when end_date is not null and end_date < current_date then 'completed'
    when start_date is not null and end_date is not null
      and current_date between start_date and end_date then 'active'
    when start_date is not null and start_date > current_date then 'pending'
    else coalesce(status, 'pending')
  end
  where start_date is not null or end_date is not null;
end;
$$;
revoke all on function public.advance_training_cycles() from public, anon, authenticated;
grant execute on function public.advance_training_cycles() to service_role;
-- Creates only missing cycles. Existing cycles/workouts are never deleted or
-- shifted, which keeps published history intact.
create or replace function public.sync_prescription_cycles(
  _student_id uuid,
  _start_date date default null
)
returns table (
  id uuid,
  enrollment_id uuid,
  cycle_number integer,
  start_date date,
  end_date date,
  status text,
  has_workouts boolean,
  has_bundle boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_company_id uuid;
  v_start date;
  v_end date;
  v_cycle_start date;
  v_cycle_end date;
  v_cycle_days integer := 42;
  v_plan_days integer := 42;
  v_cycle_number integer := 1;
begin
  select e.*
  into v_enrollment
  from public.enrollments e
  where e.student_id = _student_id
    and e.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by
    case e.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    e.created_at desc
  limit 1;

  if v_enrollment.id is null then
    raise exception using errcode = 'P0002', message = 'Aluno sem matrícula vigente para agendar prescrições.';
  end if;

  v_company_id := v_enrollment.company_id;
  if not public.is_company_staff(auth.uid(), v_company_id) then
    raise exception using errcode = '42501', message = 'Acesso restrito à equipe da empresa do aluno.';
  end if;

  select
    coalesce(p.cycle_duration_days, 42),
    coalesce(p.duration_days, p.duration_weeks * 7, 42)
  into v_cycle_days, v_plan_days
  from public.plans p
  where p.id = v_enrollment.plan_id;

  v_cycle_days := greatest(coalesce(v_cycle_days, 42), 1);
  v_plan_days := greatest(coalesce(v_plan_days, 42), 1);
  v_start := coalesce(v_enrollment.training_start_date, _start_date, v_enrollment.start_date, current_date);
  v_end := coalesce(v_enrollment.end_date, v_start + v_plan_days - 1);
  if v_end < v_start then
    v_end := v_start + v_plan_days - 1;
  end if;

  if v_enrollment.training_start_date is null then
    update public.enrollments
    set training_start_date = v_start,
        updated_at = now()
    where public.enrollments.id = v_enrollment.id;
  end if;

  v_cycle_start := v_start;
  while v_cycle_start <= v_end loop
    v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_end);

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
      v_enrollment.id,
      _student_id,
      v_company_id,
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
    )
    on conflict (enrollment_id, cycle_number) where enrollment_id is not null
    do update set
      student_id = excluded.student_id,
      company_id = excluded.company_id;

    v_cycle_number := v_cycle_number + 1;
    v_cycle_start := v_cycle_end + 1;
  end loop;

  perform public.advance_training_cycles();

  return query
  select
    tc.id,
    tc.enrollment_id,
    tc.cycle_number,
    tc.start_date,
    tc.end_date,
    tc.status,
    exists(select 1 from public.workouts w where w.cycle_id = tc.id) as has_workouts,
    exists(select 1 from public.prescription_bundles pb where pb.training_cycle_id = tc.id and pb.status <> 'failed') as has_bundle
  from public.training_cycles tc
  where tc.enrollment_id = v_enrollment.id
  order by tc.cycle_number;
end;
$$;
revoke all on function public.sync_prescription_cycles(uuid, date) from public, anon;
grant execute on function public.sync_prescription_cycles(uuid, date) to authenticated, service_role;
