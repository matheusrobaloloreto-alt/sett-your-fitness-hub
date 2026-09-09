-- Transactional canary for public.reschedule_training_cycles_from.
--
-- Safe local/staging usage:
--   { cat supabase/migrations/20260909160943_fix_reschedule_training_cycles_chronological.sql; \
--     cat scripts/reschedule-training-cycles-canary.sql; } \
--     | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
--
-- The script creates only synthetic fixtures with fixed UUIDs and rolls
-- everything back. It is not a data repair and must not be adapted to mutate
-- real production rows.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_staff_id uuid := '00000000-0000-4000-8000-00000000a901'::uuid;
  v_intruder_id uuid := '00000000-0000-4000-8000-00000000a902'::uuid;
  v_company_id uuid := '00000000-0000-4000-8000-00000000b901'::uuid;
  v_other_company_id uuid := '00000000-0000-4000-8000-00000000b902'::uuid;
  v_student_id uuid := '00000000-0000-4000-8000-00000000c901'::uuid;
  v_enrollment_id uuid := '00000000-0000-4000-8000-00000000d901'::uuid;
  v_other_student_id uuid := '00000000-0000-4000-8000-00000000c902'::uuid;
  v_other_enrollment_id uuid := '00000000-0000-4000-8000-00000000d902'::uuid;
  v_hist_overlap_1 uuid := '00000000-0000-4000-8000-00000000e901'::uuid;
  v_hist_overlap_2 uuid := '00000000-0000-4000-8000-00000000e902'::uuid;
  v_target_id uuid := '00000000-0000-4000-8000-00000000e903'::uuid;
  v_following_low_number_id uuid := '00000000-0000-4000-8000-00000000e904'::uuid;
  v_prior_high_number_id uuid := '00000000-0000-4000-8000-00000000e905'::uuid;
  v_other_cycle_id uuid := '00000000-0000-4000-8000-00000000e906'::uuid;
  v_affected_overlap_id uuid := '00000000-0000-4000-8000-00000000e907'::uuid;
  v_tie_start_id uuid := '00000000-0000-4000-8000-00000000e908'::uuid;
  v_hist_tie_id uuid := '00000000-0000-4000-8000-00000000e909'::uuid;
  v_workout_id uuid := '00000000-0000-4000-8000-00000000f901'::uuid;
  v_used_workout_id uuid := '00000000-0000-4000-8000-00000000f902'::uuid;
  v_session_id uuid := '00000000-0000-4000-8000-00000000f903'::uuid;
  v_noop_enrollment_updated_at timestamptz;
  v_noop_target_start date;
  v_noop_target_end date;
  v_noop_enrollment_end date;
  v_failed boolean;
begin
  if to_regclass('private.training_cycle_rebase_authorizations') is null then
    raise exception 'reschedule_canary_missing_rebase_authorizations';
  end if;

  if exists (
    select 1 from auth.users where id in (v_staff_id, v_intruder_id)
  ) or exists (
    select 1 from public.companies where id in (v_company_id, v_other_company_id)
  ) or exists (
    select 1 from public.students where id in (v_student_id, v_other_student_id)
  ) or exists (
    select 1 from public.enrollments where id in (v_enrollment_id, v_other_enrollment_id)
  ) or exists (
    select 1 from public.training_cycles where id in (
      v_hist_overlap_1, v_hist_overlap_2, v_target_id, v_following_low_number_id,
      v_prior_high_number_id, v_other_cycle_id, v_affected_overlap_id, v_tie_start_id, v_hist_tie_id
    )
  ) or exists (
    select 1 from public.workouts where id in (v_workout_id, v_used_workout_id)
  ) or exists (
    select 1 from public.workout_sessions where id = v_session_id
  ) then
    raise exception 'reschedule_canary_fixture_id_collision';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_staff_id, 'authenticated', 'authenticated', 'reschedule-staff@example.invalid', now(), now(), now()),
    (v_intruder_id, 'authenticated', 'authenticated', 'reschedule-intruder@example.invalid', now(), now(), now());

  insert into public.user_roles (user_id, role)
  values (v_staff_id, 'admin'::public.app_role), (v_intruder_id, 'admin'::public.app_role);

  insert into public.companies (id, name, slug, owner_id)
  values
    (v_company_id, 'Reschedule Canary', 'reschedule-canary', v_staff_id),
    (v_other_company_id, 'Reschedule Canary Other', 'reschedule-canary-other', v_intruder_id);

  insert into public.company_members (company_id, user_id)
  values (v_company_id, v_staff_id), (v_other_company_id, v_intruder_id);

  insert into public.students (id, company_id, full_name, status, assigned_trainer_id)
  values
    (v_student_id, v_company_id, 'Synthetic Reschedule Student', 'active', null),
    (v_other_student_id, v_other_company_id, 'Synthetic Other Tenant Student', 'active', null);

  insert into public.enrollments (
    id, company_id, student_id, trainer_id, status, start_date, end_date, training_start_date
  )
  values
    (v_enrollment_id, v_company_id, v_student_id, null, 'active', date '2026-01-01', date '2026-05-30', null),
    (v_other_enrollment_id, v_other_company_id, v_other_student_id, null, 'active', date '2026-01-01', date '2026-02-11', null);

  -- The enrollment trigger generates default cycles. These are synthetic rows
  -- inside this transaction; remove them so the canary owns the exact cases.
  delete from public.training_cycles
  where enrollment_id in (v_enrollment_id, v_other_enrollment_id);

  insert into public.training_cycles (
    id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date, status
  )
  values
    -- Historical unchanged overlap: must not block moving later visible cycles.
    (v_hist_overlap_1, v_enrollment_id, v_company_id, v_student_id, 1, date '2026-01-01', date '2026-01-31', 'completed'),
    (v_hist_overlap_2, v_enrollment_id, v_company_id, v_student_id, 2, date '2026-01-20', date '2026-02-18', 'completed'),
    -- Historical unchanged tie: must not block a no-op or a later safe shift.
    (v_hist_tie_id, v_enrollment_id, v_company_id, v_student_id, 4, date '2026-01-01', date '2026-01-10', 'completed'),
    -- cycle_number is intentionally non-chronological. Date order must win.
    -- Deliberately active but prior by date: shifting future cycles must not demote it.
    (v_prior_high_number_id, v_enrollment_id, v_company_id, v_student_id, 99, date '2026-03-01', date '2026-03-31', 'active'),
    (v_target_id, v_enrollment_id, v_company_id, v_student_id, 10, date '2026-04-01', date '2026-04-30', 'pending'),
    (v_following_low_number_id, v_enrollment_id, v_company_id, v_student_id, 3, date '2026-05-01', date '2026-05-30', 'pending'),
    (v_other_cycle_id, v_other_enrollment_id, v_other_company_id, v_other_student_id, 1, date '2026-01-01', date '2026-02-11', 'active');

  select updated_at, end_date
    into v_noop_enrollment_updated_at, v_noop_enrollment_end
    from public.enrollments
   where id = v_enrollment_id;

  select start_date, end_date
    into v_noop_target_start, v_noop_target_end
    from public.training_cycles
   where id = v_target_id;

  perform public.reschedule_training_cycles_from(v_enrollment_id, v_target_id, date '2026-04-01');

  if exists (
    select 1
      from public.enrollments enrollment
     where enrollment.id = v_enrollment_id
       and (enrollment.updated_at is distinct from v_noop_enrollment_updated_at
            or enrollment.end_date is distinct from v_noop_enrollment_end)
  ) or exists (
    select 1
      from public.training_cycles cycle
     where cycle.id = v_target_id
       and (cycle.start_date is distinct from v_noop_target_start
            or cycle.end_date is distinct from v_noop_target_end)
  ) then
    raise exception 'reschedule_canary_noop_mutated_rows';
  end if;

  perform public.reschedule_training_cycles_from(v_enrollment_id, v_target_id, date '2026-04-08');

  if not exists (
    select 1
      from public.training_cycles cycle
     where cycle.id = v_target_id
       and cycle.start_date = date '2026-04-08'
       and cycle.end_date = date '2026-05-07'
  ) or not exists (
    select 1
      from public.training_cycles cycle
     where cycle.id = v_following_low_number_id
       and cycle.start_date = date '2026-05-08'
       and cycle.end_date = date '2026-06-06'
  ) or exists (
    select 1
      from public.training_cycles cycle
     where cycle.id = v_prior_high_number_id
       and (cycle.start_date, cycle.end_date) is distinct from (date '2026-03-01', date '2026-03-31')
  ) or not exists (
    select 1
      from public.training_cycles cycle
     where cycle.id = v_prior_high_number_id
       and cycle.status = 'active'
  ) or not exists (
    select 1
      from public.enrollments enrollment
     where enrollment.id = v_enrollment_id
       and enrollment.end_date = date '2026-06-06'
       and enrollment.training_start_date is null
  ) then
    raise exception 'reschedule_canary_chronological_shift_failed';
  end if;

  if exists (
    select 1
      from private.training_cycle_rebase_authorizations authz
     where authz.enrollment_id = v_enrollment_id
       and authz.transaction_id = txid_current()
  ) then
    raise exception 'reschedule_canary_rebase_authorization_leaked';
  end if;

  v_failed := false;
  begin
    perform public.reschedule_training_cycles_from(v_enrollment_id, v_target_id, date '2026-03-15');
  exception when others then
    if sqlerrm like '%posterior ao termino do ciclo anterior%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'reschedule_canary_backward_crossing_was_accepted';
  end if;

  insert into public.training_cycles (
    id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date, status
  )
  values (v_affected_overlap_id, v_enrollment_id, v_company_id, v_student_id, 12, date '2026-04-20', date '2026-05-02', 'pending');

  v_failed := false;
  begin
    perform public.reschedule_training_cycles_from(v_enrollment_id, v_target_id, date '2026-04-09');
  exception when others then
    if sqlerrm like '%sobrepostos no resultado proposto%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'reschedule_canary_changed_overlap_was_accepted';
  end if;

  delete from public.training_cycles
  where id = v_affected_overlap_id;

  insert into public.training_cycles (
    id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date, status
  )
  values (v_tie_start_id, v_enrollment_id, v_company_id, v_student_id, 11, date '2026-04-08', date '2026-04-20', 'pending');

  v_failed := false;
  begin
    perform public.reschedule_training_cycles_from(v_enrollment_id, v_target_id, date '2026-04-09');
  exception when others then
    if sqlerrm like '%mesma data de inicio%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'reschedule_canary_tie_start_was_accepted';
  end if;

  delete from public.training_cycles
  where id = v_tie_start_id;

  perform set_config('request.jwt.claim.sub', v_intruder_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_intruder_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_failed := false;
  begin
    perform public.reschedule_training_cycles_from(v_enrollment_id, v_target_id, date '2026-04-09');
  exception when others then
    if sqlerrm like '%Sem permissao%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'reschedule_canary_cross_tenant_was_accepted';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.workouts (id, cycle_id, company_id, name, day_of_week, exercises)
  values
    (v_workout_id, v_target_id, v_company_id, 'Synthetic unused workout', 1, '[]'::jsonb),
    (v_used_workout_id, v_following_low_number_id, v_company_id, 'Synthetic used workout', 2, '[]'::jsonb)
  ;

  insert into public.workout_sessions (id, workout_id, student_id, company_id, completed_at)
  values (v_session_id, v_used_workout_id, v_student_id, v_company_id, now());

  v_failed := false;
  begin
    perform public.reschedule_training_cycles_from(v_enrollment_id, v_target_id, date '2026-04-09');
  exception when others then
    if sqlerrm like '%treinos realizados%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'reschedule_canary_usage_block_was_not_enforced';
  end if;
end;
$$;

rollback;

select true as reschedule_training_cycles_canary_passed,
       true as all_changes_rolled_back;
