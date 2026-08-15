\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_tenant_count(
  expected_count integer,
  actor_label text
) returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  table_name text;
  actual_count integer;
begin
  foreach table_name in array array[
    'students',
    'student_anamneses',
    'functional_assessments',
    'assessment_frames',
    'running_plans',
    'ai_strength_plans',
    'nutrition_plans',
    'prescription_bundles',
    'student_goals',
    'cycle_feedback',
    'body_measurements',
    'external_activities',
    'workout_feedback',
    'student_checkins',
    'workout_sessions',
    'enrollments'
  ] loop
    execute format('select count(*) from public.%I', table_name)
      into actual_count;
    if actual_count <> expected_count then
      raise exception '% expected % visible rows in %, got %',
        actor_label, expected_count, table_name, actual_count;
    end if;
  end loop;
end;
$$;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', 'student-a@example.invalid', '{"role":"authenticated"}', '{"full_name":"Student A"}'),
  ('10000000-0000-0000-0000-000000000002', 'student-b@example.invalid', '{"role":"authenticated"}', '{"full_name":"Student B"}'),
  ('10000000-0000-0000-0000-000000000003', 'student-c@example.invalid', '{"role":"authenticated"}', '{"full_name":"Student C"}'),
  ('10000000-0000-0000-0000-000000000004', 'staff-a@example.invalid', '{"role":"authenticated"}', '{"full_name":"Staff A"}'),
  ('10000000-0000-0000-0000-000000000005', 'staff-b@example.invalid', '{"role":"authenticated"}', '{"full_name":"Staff B"}'),
  ('10000000-0000-0000-0000-000000000006', 'master@example.invalid', '{"role":"authenticated"}', '{"full_name":"Master"}');

insert into public.companies (id, name, slug)
values
  ('a0000000-0000-0000-0000-000000000001', 'Synthetic Tenant A', 'synthetic-a'),
  ('b0000000-0000-0000-0000-000000000001', 'Synthetic Tenant B', 'synthetic-b');

insert into public.user_roles (user_id, role)
values
  ('10000000-0000-0000-0000-000000000001', 'student'),
  ('10000000-0000-0000-0000-000000000002', 'student'),
  ('10000000-0000-0000-0000-000000000003', 'student'),
  ('10000000-0000-0000-0000-000000000004', 'trainer'),
  ('10000000-0000-0000-0000-000000000005', 'trainer'),
  ('10000000-0000-0000-0000-000000000006', 'master');

insert into public.company_members (company_id, user_id)
values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004'),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005');

insert into public.students (id, company_id, user_id, full_name, status)
values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Student A', 'active'),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Student B', 'active'),
  ('b1000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Student C', 'active');

insert into public.enrollments (id, company_id, student_id)
values
  ('ea000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('ea000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  ('eb000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003');

insert into public.student_anamneses (id, company_id, student_id)
values
  ('aa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('aa000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  ('ab000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003');

insert into public.functional_assessments (id, company_id, student_id)
values
  ('fa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('fa000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  ('fb000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003');

insert into public.assessment_frames (id, assessment_id, company_id, frame_index)
values
  ('ca000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1),
  ('ca000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 1),
  ('cb000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 1);

insert into public.prescription_bundles (id, company_id, student_id)
values
  ('ba000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('ba000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  ('bb000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003');

insert into public.running_plans (id, company_id, student_id, anamnese_id, bundle_id, start_date)
values
  ('da000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', current_date),
  ('da000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000002', current_date),
  ('db000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'ab000000-0000-0000-0000-000000000003', 'bb000000-0000-0000-0000-000000000003', current_date);

insert into public.ai_strength_plans (id, company_id, student_id, anamnese_id, bundle_id)
values
  ('5a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001'),
  ('5a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000002'),
  ('5b000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'ab000000-0000-0000-0000-000000000003', 'bb000000-0000-0000-0000-000000000003');

insert into public.nutrition_plans (id, company_id, student_id, anamnese_id, bundle_id, start_date)
values
  ('6a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-000000000001', current_date),
  ('6a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-000000000002', current_date),
  ('6b000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'ab000000-0000-0000-0000-000000000003', 'bb000000-0000-0000-0000-000000000003', current_date);

insert into public.student_goals (id, company_id, student_id, title, target_date)
values
  ('7a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Goal A', current_date + 30),
  ('7a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'Goal B', current_date + 30),
  ('7b000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'Goal C', current_date + 30);

insert into public.cycle_feedback (id, company_id, student_id, enrollment_id, rating)
values
  ('8a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 4),
  ('8a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000002', 4),
  ('8b000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'eb000000-0000-0000-0000-000000000003', 4);

insert into public.body_measurements (id, company_id, student_id, waist)
values
  ('9a000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 80),
  ('9a000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 81),
  ('9b000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 82);

insert into public.external_activities (id, company_id, student_id, activity_type)
values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'run'),
  ('c2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'run'),
  ('c3000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'run');

insert into public.workout_sessions (id, company_id, student_id)
values
  ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002'),
  ('d3000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003');

insert into public.workout_feedback (id, company_id, student_id, workout_session_id, difficulty)
values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 5),
  ('e2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000002', 5),
  ('e3000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'd3000000-0000-0000-0000-000000000003', 5);

insert into public.student_checkins (id, company_id, student_id, checkin_date, sleep_quality, stress, pain)
values
  ('f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date - 3, 4, 2, 1),
  ('f2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', current_date - 3, 4, 2, 1),
  ('f3000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', current_date - 3, 4, 2, 1);

-- Student A: own rows only, including same-company isolation from Student B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_tenant_count(1, 'student A');
do $$
begin
  if exists (select 1 from public.workout_templates) then
    raise exception 'student unexpectedly read workout templates';
  end if;
  perform * from public.get_monthly_leaderboard(
    'a0000000-0000-0000-0000-000000000001', current_date
  );
  begin
    perform * from public.get_monthly_leaderboard(
      'b0000000-0000-0000-0000-000000000001', current_date
    );
    raise exception 'student cross-tenant leaderboard unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Student B: the reciprocal same-company boundary.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_tenant_count(1, 'student B');

-- Staff A sees both students in tenant A and nothing from tenant B.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select pg_temp.assert_tenant_count(2, 'staff A');

-- Staff B sees only tenant B.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select pg_temp.assert_tenant_count(1, 'staff B');

-- Master keeps explicit access to all tenants.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select pg_temp.assert_tenant_count(3, 'master');

-- Direct student self-service updates remain functional, but protected columns
-- and Student B UUID poisoning are rejected.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.students
set weekly_workout_goal = 4, gender = 'male', height_cm = 180
where id = 'a1000000-0000-0000-0000-000000000001';
do $$
begin
  begin
    update public.students
    set company_id = 'b0000000-0000-0000-0000-000000000001'
    where id = 'a1000000-0000-0000-0000-000000000001';
    raise exception 'protected student field update unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.body_measurements (company_id, student_id, waist)
    values ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 90);
    raise exception 'same-company Student B measurement poisoning unexpectedly succeeded';
  exception when insufficient_privilege or check_violation then
    null;
  end;
  begin
    insert into public.cycle_feedback (company_id, student_id, enrollment_id, rating)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      'ea000000-0000-0000-0000-000000000002',
      5
    );
    raise exception 'Student B enrollment poisoning unexpectedly succeeded';
  exception when insufficient_privilege or check_violation then
    null;
  end;
  begin
    insert into public.workout_feedback (company_id, student_id, workout_session_id, difficulty)
    values (
      'a0000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000001',
      'd2000000-0000-0000-0000-000000000002',
      5
    );
    raise exception 'Student B workout-session poisoning unexpectedly succeeded';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end;
$$;

-- Staff A may create valid tenant rows, but cannot bind a tenant-B student to
-- tenant A. The universal trigger also blocks this for master/service callers.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
insert into public.student_goals (company_id, student_id, title, target_date)
values ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'Valid staff goal', current_date + 60);
insert into public.workout_templates (company_id, name, workouts, created_by)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Synthetic template',
  '[]'::jsonb,
  '10000000-0000-0000-0000-000000000004'
);
insert into storage.objects (bucket_id, name, owner)
values (
  'assessment-frames',
  'a0000000-0000-0000-0000-000000000001/fa000000-0000-0000-0000-000000000001/frame.jpg',
  '10000000-0000-0000-0000-000000000004'
);
do $$
begin
  begin
    insert into public.running_plans (company_id, student_id, plan_name)
    values ('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'Poisoned plan');
    raise exception 'cross-tenant staff poisoning unexpectedly succeeded';
  exception when insufficient_privilege or check_violation then
    null;
  end;
  begin
    insert into public.workout_templates (company_id, name, workouts, created_by)
    values (
      'b0000000-0000-0000-0000-000000000001',
      'Cross-tenant template',
      '[]'::jsonb,
      '10000000-0000-0000-0000-000000000004'
    );
    raise exception 'cross-tenant workout template unexpectedly succeeded';
  exception when insufficient_privilege or check_violation then
    null;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'assessment-frames',
      'a0000000-0000-0000-0000-000000000001/fb000000-0000-0000-0000-000000000003/poisoned.jpg',
      '10000000-0000-0000-0000-000000000004'
    );
    raise exception 'assessment-frame UUID poisoning unexpectedly succeeded';
  exception when insufficient_privilege or check_violation then
    null;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'assessment-frames',
      'b0000000-0000-0000-0000-000000000001/fb000000-0000-0000-0000-000000000003/cross-tenant.jpg',
      '10000000-0000-0000-0000-000000000004'
    );
    raise exception 'cross-tenant assessment-frame upload unexpectedly succeeded';
  exception when insufficient_privilege or check_violation then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.prescription_bundles (company_id, student_id)
    values ('a0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003');
    raise exception 'master UUID poisoning unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;

reset role;
rollback;

\echo 'RLS synthetic matrix PASS: student A/B, cross-tenant, staff, master, storage, and UUID poisoning'
