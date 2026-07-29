-- Finish tenant scoping for newer student modules that shipped with role-only
-- or malformed staff policies. Student-own policies remain unchanged.

create or replace function public.is_student_company_staff(_user_id uuid, _student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.id = _student_id
      and public.is_company_staff(_user_id, s.company_id)
  );
$$;
revoke all on function public.is_student_company_staff(uuid, uuid) from public;
grant execute on function public.is_student_company_staff(uuid, uuid) to authenticated, service_role;
drop policy if exists "templates_company_all" on public.cycle_templates;
drop policy if exists "Company staff manage cycle templates" on public.cycle_templates;
create policy "Company staff manage cycle templates" on public.cycle_templates
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin read body_compositions" on public.body_compositions;
drop policy if exists "staff_body_comp" on public.body_compositions;
drop policy if exists "Company staff manage body compositions" on public.body_compositions;
create policy "Company staff manage body compositions" on public.body_compositions
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin read injury_reports" on public.injury_reports;
drop policy if exists "staff_injury_reports" on public.injury_reports;
drop policy if exists "Company staff manage injury reports" on public.injury_reports;
create policy "Company staff manage injury reports" on public.injury_reports
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "staff_meal_logs" on public.meal_logs;
drop policy if exists "Company staff manage meal logs" on public.meal_logs;
create policy "Company staff manage meal logs" on public.meal_logs
for all to authenticated
using (public.is_student_company_staff(auth.uid(), student_id))
with check (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_read_sessions" on public.mobility_sessions;
drop policy if exists "Company staff read mobility sessions" on public.mobility_sessions;
create policy "Company staff read mobility sessions" on public.mobility_sessions
for select to authenticated
using (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_read_transactions" on public.points_transactions;
drop policy if exists "Company staff read points transactions" on public.points_transactions;
create policy "Company staff read points transactions" on public.points_transactions
for select to authenticated
using (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_grant_badges" on public.student_badges;
drop policy if exists "staff_read_student_badges" on public.student_badges;
drop policy if exists "Company staff grant student badges" on public.student_badges;
drop policy if exists "Company staff read student badges" on public.student_badges;
create policy "Company staff grant student badges" on public.student_badges
for insert to authenticated
with check (public.is_student_company_staff(auth.uid(), student_id));
create policy "Company staff read student badges" on public.student_badges
for select to authenticated
using (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_read_streaks" on public.training_streaks;
drop policy if exists "Company staff read training streaks" on public.training_streaks;
create policy "Company staff read training streaks" on public.training_streaks
for select to authenticated
using (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_read_wearable_data" on public.wearable_data;
drop policy if exists "Company staff read wearable data" on public.wearable_data;
create policy "Company staff read wearable data" on public.wearable_data
for select to authenticated
using (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_read_devices" on public.wearable_devices;
drop policy if exists "Company staff read wearable devices" on public.wearable_devices;
create policy "Company staff read wearable devices" on public.wearable_devices
for select to authenticated
using (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_read_wearable_workouts" on public.wearable_workouts;
drop policy if exists "Company staff read wearable workouts" on public.wearable_workouts;
create policy "Company staff read wearable workouts" on public.wearable_workouts
for select to authenticated
using (public.is_student_company_staff(auth.uid(), student_id));
drop policy if exists "staff_adjustments" on public.workout_adjustments;
drop policy if exists "Company staff manage workout adjustments" on public.workout_adjustments;
create policy "Company staff manage workout adjustments" on public.workout_adjustments
for all to authenticated
using (public.is_student_company_staff(auth.uid(), student_id))
with check (public.is_student_company_staff(auth.uid(), student_id));
