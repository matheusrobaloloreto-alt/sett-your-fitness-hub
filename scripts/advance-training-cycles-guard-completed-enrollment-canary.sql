-- Transactional canary for public.advance_training_cycles completed-enrollment guard.
--
-- Safe local/staging usage after applying migrations through
-- 20260909165547_guard_completed_enrollment_cycles.sql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/advance-training-cycles-guard-completed-enrollment-canary.sql
--
-- The script creates only synthetic fixtures with fixed UUIDs and rolls
-- everything back. It is not a data repair and must not mutate real rows.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_today date := public.current_business_date();
  v_staff_id uuid := '00000000-0000-4000-8000-00000000aa31'::uuid;
  v_company_id uuid := '00000000-0000-4000-8000-00000000bb31'::uuid;
  v_student_id uuid := '00000000-0000-4000-8000-00000000cc31'::uuid;
  v_completed_enrollment_id uuid := '00000000-0000-4000-8000-00000000dd31'::uuid;
  v_active_enrollment_id uuid := '00000000-0000-4000-8000-00000000dd32'::uuid;
  v_completed_current_cycle_id uuid := '00000000-0000-4000-8000-00000000ee31'::uuid;
  v_completed_future_cycle_id uuid := '00000000-0000-4000-8000-00000000ee32'::uuid;
  v_active_overdue_cycle_id uuid := '00000000-0000-4000-8000-00000000ee33'::uuid;
  v_active_current_cycle_id uuid := '00000000-0000-4000-8000-00000000ee34'::uuid;
  v_active_future_cycle_id uuid := '00000000-0000-4000-8000-00000000ee35'::uuid;
begin
  if exists (select 1 from auth.users where id = v_staff_id)
    or exists (select 1 from public.companies where id = v_company_id)
    or exists (select 1 from public.students where id = v_student_id)
    or exists (
      select 1 from public.enrollments
      where id in (v_completed_enrollment_id, v_active_enrollment_id)
    )
    or exists (
      select 1 from public.training_cycles
      where id in (
        v_completed_current_cycle_id,
        v_completed_future_cycle_id,
        v_active_overdue_cycle_id,
        v_active_current_cycle_id,
        v_active_future_cycle_id
      )
    ) then
    raise exception 'advance_guard_canary_fixture_id_collision';
  end if;

  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (v_staff_id, 'authenticated', 'authenticated', 'advance-guard-canary@example.invalid', now(), now(), now());

  insert into public.companies (id, name, slug, owner_id)
  values (v_company_id, 'Advance Guard Canary', 'advance-guard-canary', v_staff_id);

  insert into public.students (id, company_id, full_name, status, assigned_trainer_id)
  values (v_student_id, v_company_id, 'Synthetic Advance Guard Student', 'active', null);

  insert into public.enrollments (
    id, company_id, student_id, trainer_id, status, start_date, end_date, training_start_date
  )
  values
    (
      v_completed_enrollment_id,
      v_company_id,
      v_student_id,
      null,
      'completed',
      v_today - 84,
      v_today - 1,
      null
    ),
    (
      v_active_enrollment_id,
      v_company_id,
      v_student_id,
      null,
      'active',
      v_today - 14,
      v_today + 70,
      null
    );

  delete from public.training_cycles
  where enrollment_id in (v_completed_enrollment_id, v_active_enrollment_id);

  insert into public.training_cycles (
    id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date, status
  )
  values
    (
      v_completed_current_cycle_id,
      v_completed_enrollment_id,
      v_company_id,
      v_student_id,
      1,
      v_today - 7,
      v_today + 7,
      'pending'
    ),
    (
      v_completed_future_cycle_id,
      v_completed_enrollment_id,
      v_company_id,
      v_student_id,
      2,
      v_today + 8,
      v_today + 21,
      'pending'
    ),
    (
      v_active_overdue_cycle_id,
      v_active_enrollment_id,
      v_company_id,
      v_student_id,
      1,
      v_today - 28,
      v_today - 15,
      'active'
    ),
    (
      v_active_current_cycle_id,
      v_active_enrollment_id,
      v_company_id,
      v_student_id,
      2,
      v_today - 7,
      v_today + 7,
      'pending'
    ),
    (
      v_active_future_cycle_id,
      v_active_enrollment_id,
      v_company_id,
      v_student_id,
      3,
      v_today + 8,
      v_today + 21,
      'pending'
    );

  perform public.advance_training_cycles();

  if (select status from public.training_cycles where id = v_completed_current_cycle_id) <> 'pending' then
    raise exception 'advance_guard_mutated_completed_current_cycle';
  end if;
  if (select status from public.training_cycles where id = v_completed_future_cycle_id) <> 'pending' then
    raise exception 'advance_guard_mutated_completed_future_cycle';
  end if;
  if (select status from public.training_cycles where id = v_active_overdue_cycle_id) <> 'completed' then
    raise exception 'advance_guard_active_overdue_not_completed';
  end if;
  if (select status from public.training_cycles where id = v_active_current_cycle_id) <> 'active' then
    raise exception 'advance_guard_active_current_not_activated';
  end if;
  if (select status from public.training_cycles where id = v_active_future_cycle_id) <> 'pending' then
    raise exception 'advance_guard_active_future_not_pending';
  end if;
end
$$;

select true as advance_training_cycles_guard_completed_enrollment_canary_passed,
  true as all_changes_rolled_back;

rollback;
