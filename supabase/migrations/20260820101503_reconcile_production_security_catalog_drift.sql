-- Production carried four legacy student-read policies that never existed in
-- the canonical fresh replay. They were assigned to PUBLIC, so they remained
-- permissive alongside the authenticated tenant policies installed by the
-- terminal hardening migration. Remove the three redundant copies.
drop policy if exists "students_read_own_anamnese"
on public.student_anamneses;

drop policy if exists "students_read_own_logs"
on public.workout_logs;

drop policy if exists "students_read_own_sessions"
on public.workout_sessions;

-- workout_exercises is a production-only legacy normalization table. Keep its
-- student read contract when present, but bind it explicitly to authenticated
-- users and to the workout/cycle/student tenant chain.
do $workout_exercises_policy$
begin
  if to_regclass('public.workout_exercises') is not null then
    execute 'drop policy if exists "students_read_own_workout_exercises" on public.workout_exercises';
    execute 'drop policy if exists "Students read own workout exercises" on public.workout_exercises';
    execute $policy$
      create policy "Students read own workout exercises"
      on public.workout_exercises for select to authenticated
      using (
        exists (
          select 1
          from public.workouts w
          join public.training_cycles tc on tc.id = w.cycle_id
          join public.students s
            on s.id = tc.student_id and s.company_id = tc.company_id
          where w.id = workout_exercises.workout_id
            and s.user_id = auth.uid()
            and (w.company_id is null or w.company_id = tc.company_id)
        )
      )
    $policy$;
  end if;
end;
$workout_exercises_policy$;

-- Legacy production also contains service-role-only functions that are absent
-- from the canonical fresh schema. Freeze every public function's lookup path
-- without changing its body, owner, SECURITY DEFINER bit or ACL. The loop is
-- intentionally idempotent and also protects future replay-only functions.
do $freeze_public_function_search_paths$
declare
  function_row record;
begin
  for function_row in
    select p.oid::regprocedure as signature
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) setting
        where setting like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp',
      function_row.signature
    );
  end loop;
end;
$freeze_public_function_search_paths$;
