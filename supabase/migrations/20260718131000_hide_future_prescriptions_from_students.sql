-- Staff can prepare the whole contract in advance, but students only receive a
-- block once its start date arrives. Past blocks remain visible as history.

drop policy if exists "Student reads own strength plans" on public.ai_strength_plans;
create policy "Student reads own strength plans"
on public.ai_strength_plans
for select
to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = ai_strength_plans.student_id
      and s.user_id = auth.uid()
  )
  and (
    training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = ai_strength_plans.training_cycle_id
        and (tc.start_date is null or tc.start_date <= current_date)
    )
  )
);
drop policy if exists student_read_running_plans on public.running_plans;
create policy student_read_running_plans
on public.running_plans
for select
to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = running_plans.student_id
      and s.user_id = auth.uid()
  )
  and (start_date is null or start_date <= current_date)
);
drop policy if exists student_read_nutrition_plan on public.nutrition_plans;
create policy student_read_nutrition_plan
on public.nutrition_plans
for select
to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = nutrition_plans.student_id
      and s.user_id = auth.uid()
  )
  and (start_date is null or start_date <= current_date)
);
drop policy if exists students_read_own_cycles on public.training_cycles;
create policy students_read_own_cycles
on public.training_cycles
for select
to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = training_cycles.student_id
      and s.user_id = auth.uid()
  )
  and (start_date is null or start_date <= current_date)
);
drop policy if exists students_read_own_workouts on public.workouts;
create policy students_read_own_workouts
on public.workouts
for select
to authenticated
using (
  exists (
    select 1
    from public.training_cycles tc
    join public.students s on s.id = tc.student_id
    where tc.id = workouts.cycle_id
      and s.user_id = auth.uid()
      and (tc.start_date is null or tc.start_date <= current_date)
  )
);
