-- Transactional canary for paid/manual enrollment renewal replacement.
--
-- Safe local/staging usage:
--   { cat supabase/migrations/20260909165533_replace_paid_renewal_enrollment.sql; \
--     cat scripts/renewal-replacement-canary.sql; } \
--     | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
--
-- The script creates only synthetic fixtures with fixed UUIDs and rolls
-- everything back. It is not a data repair and must not be adapted to mutate
-- real production rows.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_staff_id uuid := '00000000-0000-4000-8000-00000000aa01'::uuid;
  v_intruder_id uuid := '00000000-0000-4000-8000-00000000aa02'::uuid;
  v_student_user_id uuid := '00000000-0000-4000-8000-00000000aa03'::uuid;
  v_company_id uuid := '00000000-0000-4000-8000-00000000bb01'::uuid;
  v_other_company_id uuid := '00000000-0000-4000-8000-00000000bb02'::uuid;
  v_student_id uuid := '00000000-0000-4000-8000-00000000cc01'::uuid;
  v_other_student_id uuid := '00000000-0000-4000-8000-00000000cc02'::uuid;
  v_plan_id uuid := '00000000-0000-4000-8000-00000000dd01'::uuid;
  v_other_plan_id uuid := '00000000-0000-4000-8000-00000000dd02'::uuid;
  v_old_enrollment_id uuid := '00000000-0000-4000-8000-00000000ee01'::uuid;
  v_other_enrollment_id uuid := '00000000-0000-4000-8000-00000000ee02'::uuid;
  v_old_cycle_id uuid := '00000000-0000-4000-8000-00000000f101'::uuid;
  v_old_future_cycle_id uuid := '00000000-0000-4000-8000-00000000f102'::uuid;
  v_other_cycle_id uuid := '00000000-0000-4000-8000-00000000f103'::uuid;
  v_old_workout_id uuid := '00000000-0000-4000-8000-00000000f201'::uuid;
  v_other_workout_id uuid := '00000000-0000-4000-8000-00000000f202'::uuid;
  v_payment_id uuid := '00000000-0000-4000-8000-00000000f301'::uuid;
  v_bad_enrollment_id uuid := '00000000-0000-4000-8000-00000000f401'::uuid;
  v_payment_enrollment_id uuid;
  v_repeat_payment_enrollment_id uuid;
  v_manual_1_id uuid;
  v_manual_2_id uuid;
  v_manual_3_id uuid;
  v_manual_published_id uuid;
  v_published_cycle_id uuid;
  v_prior_own_cycle_id uuid := gen_random_uuid();
  v_first_student_id uuid := gen_random_uuid();
  v_first_enrollment_id uuid;
  v_first_activation boolean;
  v_first_payment_key text := 'pay_renewal_first_activation_canary_' || gen_random_uuid()::text;
  v_enrollment_count integer;
  v_failed boolean;
begin
  if to_regprocedure('public.apply_paid_payment_lifecycle(uuid, uuid, uuid, text, date, date)') is null
    or to_regprocedure('public.replace_student_enrollment(uuid, uuid, uuid, uuid, date, boolean)') is null
    or to_regprocedure('public.is_enrollment_carried_over_cycle_eligible(uuid, uuid, uuid, uuid)') is null then
    raise exception 'renewal_canary_missing_renewal_replacement_functions';
  end if;

  if exists (select 1 from auth.users where id in (v_staff_id, v_intruder_id, v_student_user_id))
    or exists (select 1 from public.companies where id in (v_company_id, v_other_company_id))
    or exists (select 1 from public.students where id in (v_student_id, v_other_student_id))
    or exists (select 1 from public.plans where id in (v_plan_id, v_other_plan_id))
    or exists (select 1 from public.enrollments where id in (v_old_enrollment_id, v_other_enrollment_id, v_bad_enrollment_id))
    or exists (select 1 from public.training_cycles where id in (v_old_cycle_id, v_old_future_cycle_id, v_other_cycle_id))
    or exists (select 1 from public.workouts where id in (v_old_workout_id, v_other_workout_id))
    or exists (select 1 from public.payments where id = v_payment_id or asaas_payment_id = 'pay_renewal_replacement_canary') then
    raise exception 'renewal_canary_fixture_id_collision';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_staff_id, 'authenticated', 'authenticated', 'renewal-staff@example.invalid', now(), now(), now()),
    (v_intruder_id, 'authenticated', 'authenticated', 'renewal-intruder@example.invalid', now(), now(), now()),
    (v_student_user_id, 'authenticated', 'authenticated', 'renewal-student@example.invalid', now(), now(), now());

  insert into public.user_roles (user_id, role)
  values (v_staff_id, 'admin'::public.app_role), (v_intruder_id, 'admin'::public.app_role);

  insert into public.companies (id, name, slug, owner_id)
  values
    (v_company_id, 'Renewal Replacement Canary', 'renewal-replacement-canary', v_staff_id),
    (v_other_company_id, 'Renewal Replacement Canary Other', 'renewal-replacement-canary-other', v_intruder_id);

  insert into public.company_members (company_id, user_id)
  values (v_company_id, v_staff_id), (v_other_company_id, v_intruder_id);

  insert into public.plans (
    id, company_id, name, price, duration_days, duration_weeks, cycle_duration_days, plan_kind, is_active
  ) values
    (v_plan_id, v_company_id, 'Synthetic 28d Plan', 100, 28, 4, 14, 'standard', true),
    (v_other_plan_id, v_other_company_id, 'Synthetic Other Plan', 100, 28, 4, 14, 'standard', true);

  insert into public.students (id, company_id, full_name, status, sales_stage, activated_at, assigned_trainer_id)
  values
    (v_student_id, v_company_id, 'Synthetic Renewal Student', 'active', 'active', now(), null),
    (v_other_student_id, v_other_company_id, 'Synthetic Other Renewal Student', 'active', 'active', now(), null);
  update public.students set user_id = v_student_user_id where id = v_student_id;

  insert into public.enrollments (
    id, company_id, student_id, plan_id, trainer_id, status, payment_status,
    start_date, end_date, training_start_date, cycle_duration_days, payment_date
  ) values
    (v_old_enrollment_id, v_company_id, v_student_id, v_plan_id, null, 'active', 'paid',
     date '2026-08-01', date '2027-12-31', date '2026-08-01', 14, date '2026-08-01'),
    (v_other_enrollment_id, v_other_company_id, v_other_student_id, v_other_plan_id, null, 'active', 'paid',
     date '2026-08-01', date '2026-12-31', date '2026-08-01', 14, date '2026-08-01');

  delete from public.training_cycles
  where enrollment_id in (v_old_enrollment_id, v_other_enrollment_id);

  insert into public.training_cycles (
    id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date,
    duration_weeks, status, delivery_status, name
  ) values
    (v_old_cycle_id, v_old_enrollment_id, v_company_id, v_student_id, 1,
     date '2026-09-01', date '2026-09-28', 4, 'active', 'published', 'Old Published Cycle'),
    (v_old_future_cycle_id, v_old_enrollment_id, v_company_id, v_student_id, 2,
     date '2026-09-29', date '2026-10-26', 4, 'pending', 'pending', 'Old Future Empty Cycle'),
    (v_other_cycle_id, v_other_enrollment_id, v_other_company_id, v_other_student_id, 1,
     date '2026-09-01', date '2026-09-28', 4, 'active', 'published', 'Other Tenant Cycle');

  insert into public.workouts (id, cycle_id, company_id, name, day_of_week, exercises, superseded_at)
  values
    (v_old_workout_id, v_old_cycle_id, v_company_id, 'Old active workout', 1,
     '[{"name":"Agachamento","sets":3}]'::jsonb, null),
    (v_other_workout_id, v_other_cycle_id, v_other_company_id, 'Other workout', 1,
     '[{"name":"Remada","sets":3}]'::jsonb, null);

  insert into public.payments (
    id, student_id, company_id, plan_id, amount, value, status, asaas_payment_id,
    payment_method, billing_type, paid_at
  ) values (
    v_payment_id, v_student_id, v_company_id, v_plan_id, 100, 100, 'RECEIVED',
    'pay_renewal_replacement_canary', 'PIX', 'PIX', now()
  );

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff_id::text, 'role', 'service_role')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  select lifecycle.enrollment_id
    into v_payment_enrollment_id
  from public.apply_paid_payment_lifecycle(
    v_student_id,
    v_company_id,
    v_plan_id,
    'pay_renewal_replacement_canary',
    date '2026-09-09',
    date '2026-09-14'
  ) lifecycle;

  if v_payment_enrollment_id is null then
    raise exception 'renewal_canary_payment_lifecycle_missing_enrollment';
  end if;

  if not exists (
    select 1 from public.enrollments old_enrollment
    where old_enrollment.id = v_old_enrollment_id
      and old_enrollment.status = 'completed'
      and old_enrollment.start_date = date '2026-08-01'
      and old_enrollment.end_date = date '2027-12-31'
      and old_enrollment.training_start_date = date '2026-08-01'
  ) then
    raise exception 'renewal_canary_old_enrollment_not_completed_preserved';
  end if;

  if not exists (
    select 1 from public.enrollments new_enrollment
    where new_enrollment.id = v_payment_enrollment_id
      and new_enrollment.status = 'active'
      and new_enrollment.payment_status = 'paid'
      and new_enrollment.start_date = date '2026-09-09'
      and new_enrollment.training_start_date = date '2026-09-09'
      and new_enrollment.end_date = date '2026-10-06'
      and new_enrollment.carried_over_cycle_id = v_old_cycle_id
  ) then
    raise exception 'renewal_canary_new_paid_enrollment_not_replacement_window';
  end if;

  if not exists (
    select 1 from public.training_cycles c1
    join public.training_cycles c2 on c2.enrollment_id = c1.enrollment_id
    where c1.enrollment_id = v_payment_enrollment_id
      and c1.cycle_number = 1
      and c1.start_date = date '2026-09-09'
      and c1.end_date = date '2026-09-22'
      and c1.status = 'active'
      and c2.cycle_number = 2
      and c2.start_date = date '2026-09-23'
      and c2.end_date = date '2026-10-06'
      and c2.status = 'pending'
  ) then
    raise exception 'renewal_canary_new_cycles_not_generated_from_business_date';
  end if;

  if not exists (
    select 1 from public.workouts workout
    where workout.id = v_old_workout_id
      and workout.cycle_id = v_old_cycle_id
      and workout.superseded_at is null
      and jsonb_array_length(workout.exercises) = 1
  ) then
    raise exception 'renewal_canary_old_workout_was_mutated';
  end if;

  select count(*) into v_enrollment_count
  from public.enrollments
  where student_id = v_student_id
    and company_id = v_company_id;

  select lifecycle.enrollment_id
    into v_repeat_payment_enrollment_id
  from public.apply_paid_payment_lifecycle(
    v_student_id,
    v_company_id,
    v_plan_id,
    'pay_renewal_replacement_canary',
    date '2026-09-09',
    date '2026-09-14'
  ) lifecycle
  where lifecycle.already_applied = true;

  if v_repeat_payment_enrollment_id is distinct from v_payment_enrollment_id
    or (select count(*) from public.enrollments where student_id = v_student_id and company_id = v_company_id) <> v_enrollment_count then
    raise exception 'renewal_canary_repeated_payment_was_not_noop';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select result.enrollment_id
    into v_manual_1_id
  from public.replace_student_enrollment(
    v_student_id,
    v_company_id,
    v_plan_id,
    null,
    date '2026-09-09',
    false
  ) result;

  if not exists (
    select 1
    from public.enrollments enrollment
    where enrollment.id = v_manual_1_id
      and enrollment.status = 'active'
      and enrollment.start_date = date '2026-09-09'
      and enrollment.end_date = date '2026-10-06'
      and enrollment.carried_over_cycle_id = v_old_cycle_id
  ) or not exists (
    select 1 from public.enrollments enrollment
    where enrollment.id = v_payment_enrollment_id
      and enrollment.status = 'completed'
      and enrollment.carried_over_cycle_id = v_old_cycle_id
  ) then
    raise exception 'renewal_canary_repeated_manual_renewal_did_not_preserve_carryover';
  end if;

  select id into strict v_published_cycle_id from public.training_cycles
  where enrollment_id = v_manual_1_id and cycle_number = 1;
  insert into public.workouts (cycle_id, company_id, name, exercises)
  values (v_published_cycle_id, v_company_id, 'New published workout',
    '[{"exercise_name":"Agachamento novo","sets":3}]'::jsonb);
  select result.enrollment_id into v_manual_published_id
  from public.replace_student_enrollment(
    v_student_id, v_company_id, v_plan_id, null, date '2026-09-09', false
  ) result;
  if (select carried_over_cycle_id from public.enrollments where id = v_manual_published_id)
    is distinct from v_published_cycle_id then
    raise exception 'renewal_canary_new_publication_must_replace_inherited_workout';
  end if;

  insert into public.training_cycles (id, enrollment_id, company_id, student_id,
    cycle_number, start_date, end_date, status)
  values (v_prior_own_cycle_id, v_manual_published_id, v_company_id, v_student_id,
    3, date '2026-09-08', date '2026-09-08', 'completed');
  insert into public.workouts (cycle_id, company_id, name, exercises)
  values (v_prior_own_cycle_id, v_company_id, 'Earlier own publication',
    '[{"exercise_name":"Remada anterior","sets":3}]'::jsonb);
  update public.training_cycles set prescription_cleared_at = now()
  where enrollment_id = v_manual_published_id and cycle_number = 1;
  if public.select_enrollment_carryover_cycle(
    v_manual_published_id, gen_random_uuid(), v_student_id, v_company_id
  ) is not null then
    raise exception 'renewal_canary_archived_current_cycle_resurrected_inherited_workout';
  end if;

  select result.enrollment_id
    into v_manual_2_id
  from public.replace_student_enrollment(
    v_student_id,
    v_company_id,
    v_plan_id,
    null,
    date '2026-09-09',
    true
  ) result;

  if not exists (
    select 1
    from public.enrollments enrollment
    where enrollment.id = v_manual_2_id
      and enrollment.status = 'active'
      and enrollment.carried_over_cycle_id is null
      and enrollment.carried_over_cycle_cleared_at is not null
  ) then
    raise exception 'renewal_canary_explicit_clear_did_not_suppress_carryover';
  end if;

  if public.select_enrollment_carryover_cycle(
    v_manual_2_id, gen_random_uuid(), v_student_id, v_company_id
  ) is not null then
    raise exception 'renewal_canary_clear_was_not_sticky_before_new_publication';
  end if;
  select id into strict v_published_cycle_id from public.training_cycles
  where enrollment_id = v_manual_2_id and cycle_number = 1;
  insert into public.workouts (cycle_id, company_id, name, exercises)
  values (v_published_cycle_id, v_company_id, 'Published after explicit fallback removal',
    '[{"exercise_name":"Remada nova","sets":3}]'::jsonb);

  select result.enrollment_id
    into v_manual_3_id
  from public.replace_student_enrollment(
    v_student_id,
    v_company_id,
    v_plan_id,
    null,
    date '2026-09-09',
    false
  ) result;

  if not exists (
    select 1
    from public.enrollments enrollment
    where enrollment.id = v_manual_3_id
      and enrollment.status = 'active'
      and enrollment.carried_over_cycle_id = v_published_cycle_id
  ) then
    raise exception 'renewal_canary_clear_permanently_blocked_new_publication';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_intruder_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_intruder_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_failed := false;
  begin
    perform public.replace_student_enrollment(
      v_student_id,
      v_company_id,
      v_plan_id,
      v_intruder_id,
      date '2026-12-30',
      false
    );
  exception when others then
    if sqlstate = '42501' or sqlerrm like '%Sem permissão%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'renewal_canary_cross_tenant_staff_rpc_was_accepted';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_failed := false;
  begin
    insert into public.enrollments (
      id, company_id, student_id, plan_id, trainer_id, status, payment_status,
      start_date, end_date, training_start_date, cycle_duration_days, carried_over_cycle_id
    ) values (
      v_bad_enrollment_id, v_company_id, v_student_id, v_plan_id, null, 'inactive', 'paid',
      date '2027-01-01', date '2027-01-28', date '2027-01-01', 14, v_other_cycle_id
    );
  exception when others then
    if sqlstate = '23514' or sqlerrm like '%Carry-over cycle%' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'renewal_canary_direct_insert_mismatched_carryover_was_accepted';
  end if;

  if (select count(*) from public.enrollments where student_id = v_student_id
    and status in ('active', 'awaiting_training', 'awaiting_renewal')) <> 1 then
    raise exception 'renewal_canary_multiple_operational_enrollments';
  end if;

  if has_function_privilege('authenticated', 'public.apply_paid_payment_lifecycle(uuid,uuid,uuid,text,date,date)', 'execute')
    or has_function_privilege('anon', 'public.replace_student_enrollment(uuid,uuid,uuid,uuid,date,boolean)', 'execute') then
    raise exception 'renewal_canary_privilege_boundary_regressed';
  end if;

  insert into public.students (id, company_id, full_name, status)
  values (v_first_student_id, v_company_id, 'Synthetic First Activation', 'pending');
  insert into public.payments (student_id, company_id, plan_id, amount, value, status, asaas_payment_id)
  values (v_first_student_id, v_company_id, v_plan_id, 100, 100, 'RECEIVED', v_first_payment_key);
  select lifecycle.enrollment_id, lifecycle.first_activation
    into v_first_enrollment_id, v_first_activation
  from public.apply_paid_payment_lifecycle(
    v_first_student_id, v_company_id, v_plan_id, v_first_payment_key,
    date '2026-09-09', date '2026-09-14'
  ) lifecycle;
  if v_first_activation is not true
    or not exists (select 1 from public.enrollments where id = v_first_enrollment_id
      and start_date = date '2026-09-09' and end_date = date '2026-10-06'
      and training_start_date is null)
    or exists (select 1 from public.training_cycles where enrollment_id = v_first_enrollment_id) then
    raise exception 'renewal_canary_first_activation_started_training_prematurely';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_student_user_id::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_student_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('role', 'authenticated', true);
  if not exists (select 1 from public.workouts where id = v_old_workout_id)
    or exists (select 1 from public.workouts where id = v_other_workout_id) then
    raise exception 'renewal_canary_student_history_rls_boundary';
  end if;
  perform set_config('role', 'postgres', true);
end;
$$;

rollback;

select true as renewal_replacement_canary_passed,
       true as all_changes_rolled_back;
