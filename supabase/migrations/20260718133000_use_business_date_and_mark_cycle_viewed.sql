-- SETT operates in Brazil. UTC changes date at 21:00 in Sao Paulo and must not
-- release tomorrow's prescription early.

create or replace function public.current_business_date()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;
revoke all on function public.current_business_date() from public, anon;
grant execute on function public.current_business_date() to authenticated, service_role;
create or replace function public.advance_training_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.current_business_date();
begin
  update public.training_cycles
  set status = case
    when end_date is not null and end_date < v_today then 'completed'
    when start_date is not null and end_date is not null
      and v_today between start_date and end_date then 'active'
    when start_date is not null and start_date > v_today then 'pending'
    else coalesce(status, 'pending')
  end
  where start_date is not null or end_date is not null;
end;
$$;
revoke all on function public.advance_training_cycles() from public, anon, authenticated;
grant execute on function public.advance_training_cycles() to service_role;
-- Keep the existing lifecycle behavior, but evaluate due dates and contract
-- boundaries in the business timezone.
create or replace function public.process_enrollment_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.current_business_date();
begin
  perform public.advance_training_cycles();

  update public.enrollments e
  set status = 'awaiting_renewal', updated_at = now()
  where e.status = 'active'
    and (
      (e.end_date is not null and e.end_date < v_today)
      or (
        e.training_start_date is not null
        and exists (select 1 from public.training_cycles tc where tc.enrollment_id = e.id)
        and not exists (
          select 1 from public.training_cycles tc
          where tc.enrollment_id = e.id and tc.status in ('active', 'pending')
        )
        and (select max(tc.end_date) from public.training_cycles tc where tc.enrollment_id = e.id) < v_today
      )
    );

  update public.students s
  set status = 'awaiting_renewal', updated_at = now()
  where s.status not in ('inactive', 'awaiting_renewal')
    and not exists (
      select 1 from public.enrollments e
      where e.student_id = s.id and e.status in ('active', 'awaiting_training')
    )
    and exists (
      select 1 from public.enrollments e
      where e.student_id = s.id and e.status = 'awaiting_renewal'
    );

  update public.students s
  set status = 'active', updated_at = now()
  where s.status = 'awaiting_renewal'
    and exists (
      select 1 from public.enrollments e
      where e.student_id = s.id and e.status in ('active', 'awaiting_training')
    );

  update public.payments p
  set status = 'OVERDUE', updated_at = now()
  where p.due_date is not null
    and p.due_date < v_today
    and coalesce(p.status, 'PENDING') not in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'OVERDUE');

  update public.enrollments e
  set payment_status = 'overdue', updated_at = now()
  where coalesce(e.payment_status, 'pending') not in ('paid', 'overdue')
    and exists (
      select 1 from public.payments p
      where p.enrollment_id = e.id and p.status = 'OVERDUE'
    );

  perform public.process_automation_triggers();
end;
$$;
revoke all on function public.process_enrollment_lifecycle() from public, anon, authenticated;
grant execute on function public.process_enrollment_lifecycle() to service_role;
-- Students may acknowledge only a cycle they own and whose start date has
-- already arrived. They never receive general UPDATE access to the table.
create or replace function public.mark_training_cycle_viewed(_cycle_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
begin
  update public.training_cycles tc
  set delivery_status = 'viewed'
  where tc.id = _cycle_id
    and (tc.start_date is null or tc.start_date <= public.current_business_date())
    and exists (
      select 1 from public.students s
      where s.id = tc.student_id and s.user_id = auth.uid()
    )
  returning tc.id into v_cycle_id;

  return v_cycle_id is not null;
end;
$$;
revoke all on function public.mark_training_cycle_viewed(uuid) from public, anon;
grant execute on function public.mark_training_cycle_viewed(uuid) to authenticated, service_role;
drop policy if exists "Student reads own strength plans" on public.ai_strength_plans;
create policy "Student reads own strength plans"
on public.ai_strength_plans for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = ai_strength_plans.student_id and s.user_id = auth.uid()
  )
  and (
    training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = ai_strength_plans.training_cycle_id
        and (tc.start_date is null or tc.start_date <= public.current_business_date())
    )
  )
);
drop policy if exists student_read_running_plans on public.running_plans;
create policy student_read_running_plans
on public.running_plans for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = running_plans.student_id and s.user_id = auth.uid()
  )
  and (start_date is null or start_date <= public.current_business_date())
);
drop policy if exists student_read_nutrition_plan on public.nutrition_plans;
create policy student_read_nutrition_plan
on public.nutrition_plans for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = nutrition_plans.student_id and s.user_id = auth.uid()
  )
  and (start_date is null or start_date <= public.current_business_date())
);
drop policy if exists students_read_own_cycles on public.training_cycles;
create policy students_read_own_cycles
on public.training_cycles for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = training_cycles.student_id and s.user_id = auth.uid()
  )
  and (start_date is null or start_date <= public.current_business_date())
);
drop policy if exists students_read_own_workouts on public.workouts;
create policy students_read_own_workouts
on public.workouts for select to authenticated
using (
  exists (
    select 1
    from public.training_cycles tc
    join public.students s on s.id = tc.student_id
    where tc.id = workouts.cycle_id
      and s.user_id = auth.uid()
      and (tc.start_date is null or tc.start_date <= public.current_business_date())
  )
);
