-- All authenticated mutations must cross save_workout_logs_if_current(), whose
-- SECURITY DEFINER implementation enforces ownership, tenant, shape and CAS.
-- service_role remains available for vetted recovery/backfill operations.

drop policy if exists "Master full access" on public.workout_logs;
drop policy if exists "Company scoped select" on public.workout_logs;
drop policy if exists "Admin company insert" on public.workout_logs;
drop policy if exists "Admin company update" on public.workout_logs;
drop policy if exists "Admin company delete" on public.workout_logs;
drop policy if exists "Student manages own logs" on public.workout_logs;
drop policy if exists "Company staff manage workout logs" on public.workout_logs;

revoke insert, update, delete on public.workout_logs from anon, authenticated;
grant select on public.workout_logs to authenticated;
grant all on public.workout_logs to service_role;

create policy "Students read own workout logs"
on public.workout_logs for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = workout_logs.student_id
      and s.user_id = auth.uid()
  )
);

create policy "Company staff read workout logs"
on public.workout_logs for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = workout_logs.student_id
      and public.is_company_staff(auth.uid(), s.company_id)
  )
);

-- Explicit service grant documents the only permitted direct writer. The role
-- bypasses RLS in Supabase and is never exposed to the browser.
grant execute on function public.save_workout_logs_if_current(jsonb)
  to authenticated, service_role;
