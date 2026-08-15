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
-- Several extended modules existed only in the production schema when this
-- hardening shipped. Apply their policies when the relation is present without
-- making those drift-only tables prerequisites for a canonical fresh replay.
do $$
begin
  if to_regclass('public.body_compositions') is not null then
    execute 'drop policy if exists "Admin read body_compositions" on public.body_compositions';
    execute 'drop policy if exists "staff_body_comp" on public.body_compositions';
    execute 'drop policy if exists "Company staff manage body compositions" on public.body_compositions';
    execute 'create policy "Company staff manage body compositions" on public.body_compositions for all to authenticated using (public.is_company_staff(auth.uid(), company_id)) with check (public.is_company_staff(auth.uid(), company_id))';
  end if;
  if to_regclass('public.injury_reports') is not null then
    execute 'drop policy if exists "Admin read injury_reports" on public.injury_reports';
    execute 'drop policy if exists "staff_injury_reports" on public.injury_reports';
    execute 'drop policy if exists "Company staff manage injury reports" on public.injury_reports';
    execute 'create policy "Company staff manage injury reports" on public.injury_reports for all to authenticated using (public.is_company_staff(auth.uid(), company_id)) with check (public.is_company_staff(auth.uid(), company_id))';
  end if;
  if to_regclass('public.meal_logs') is not null then
    execute 'drop policy if exists "staff_meal_logs" on public.meal_logs';
    execute 'drop policy if exists "Company staff manage meal logs" on public.meal_logs';
    execute 'create policy "Company staff manage meal logs" on public.meal_logs for all to authenticated using (public.is_student_company_staff(auth.uid(), student_id)) with check (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
  if to_regclass('public.mobility_sessions') is not null then
    execute 'drop policy if exists "staff_read_sessions" on public.mobility_sessions';
    execute 'drop policy if exists "Company staff read mobility sessions" on public.mobility_sessions';
    execute 'create policy "Company staff read mobility sessions" on public.mobility_sessions for select to authenticated using (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
  if to_regclass('public.points_transactions') is not null then
    execute 'drop policy if exists "staff_read_transactions" on public.points_transactions';
    execute 'drop policy if exists "Company staff read points transactions" on public.points_transactions';
    execute 'create policy "Company staff read points transactions" on public.points_transactions for select to authenticated using (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
  if to_regclass('public.student_badges') is not null then
    execute 'drop policy if exists "staff_grant_badges" on public.student_badges';
    execute 'drop policy if exists "staff_read_student_badges" on public.student_badges';
    execute 'drop policy if exists "Company staff grant student badges" on public.student_badges';
    execute 'drop policy if exists "Company staff read student badges" on public.student_badges';
    execute 'create policy "Company staff grant student badges" on public.student_badges for insert to authenticated with check (public.is_student_company_staff(auth.uid(), student_id))';
    execute 'create policy "Company staff read student badges" on public.student_badges for select to authenticated using (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
  if to_regclass('public.training_streaks') is not null then
    execute 'drop policy if exists "staff_read_streaks" on public.training_streaks';
    execute 'drop policy if exists "Company staff read training streaks" on public.training_streaks';
    execute 'create policy "Company staff read training streaks" on public.training_streaks for select to authenticated using (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
end;
$$;
-- Wearable tables were introduced in a later migration. Keep fresh-schema replay
-- safe while preserving this hardening for databases where they already exist.
do $$
begin
  if to_regclass('public.wearable_data') is not null then
    execute 'drop policy if exists "staff_read_wearable_data" on public.wearable_data';
    execute 'drop policy if exists "Company staff read wearable data" on public.wearable_data';
    execute 'create policy "Company staff read wearable data" on public.wearable_data for select to authenticated using (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
  if to_regclass('public.wearable_devices') is not null then
    execute 'drop policy if exists "staff_read_devices" on public.wearable_devices';
    execute 'drop policy if exists "Company staff read wearable devices" on public.wearable_devices';
    execute 'create policy "Company staff read wearable devices" on public.wearable_devices for select to authenticated using (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
  if to_regclass('public.wearable_workouts') is not null then
    execute 'drop policy if exists "staff_read_wearable_workouts" on public.wearable_workouts';
    execute 'drop policy if exists "Company staff read wearable workouts" on public.wearable_workouts';
    execute 'create policy "Company staff read wearable workouts" on public.wearable_workouts for select to authenticated using (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
end;
$$;
do $$
begin
  if to_regclass('public.workout_adjustments') is not null then
    execute 'drop policy if exists "staff_adjustments" on public.workout_adjustments';
    execute 'drop policy if exists "Company staff manage workout adjustments" on public.workout_adjustments';
    execute 'create policy "Company staff manage workout adjustments" on public.workout_adjustments for all to authenticated using (public.is_student_company_staff(auth.uid(), student_id)) with check (public.is_student_company_staff(auth.uid(), student_id))';
  end if;
end;
$$;
