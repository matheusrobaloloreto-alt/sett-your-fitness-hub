begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:single-enrollment-cycle-overlap:6d6035153239:v1', 0));

create table if not exists public.training_cycle_overlap_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null unique,
  batch_sha256 text not null,
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  before_enrollment jsonb not null,
  before_cycles jsonb not null,
  before_workouts jsonb not null,
  before_cycles_sha256 text not null,
  before_workouts_sha256 text not null,
  after_cycles jsonb,
  after_workouts jsonb,
  after_cycles_sha256 text,
  after_workouts_sha256 text,
  state text not null default 'applied' check (state in ('applied','rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

alter table public.training_cycle_overlap_repair_audit enable row level security;
revoke all on table public.training_cycle_overlap_repair_audit from public, anon, authenticated;
grant select, insert, update on table public.training_cycle_overlap_repair_audit to service_role;

comment on table public.training_cycle_overlap_repair_audit is
  'Restricted before/after images for targeted, reversible training-cycle overlap repairs.';

lock table
  public.enrollments,
  public.training_cycles,
  public.workouts,
  public.workout_exercises,
  public.workout_logs,
  public.workout_sessions,
  public.cycle_feedback,
  public.ai_plan_versions,
  public.ai_strength_plans,
  public.running_plans,
  public.nutrition_plans,
  public.prescription_bundles,
  public.cycle_prescription_clear_events,
  public.workout_archive_events,
  public.intercycle_anamneses,
  public.intercycle_anamnesis_deliveries,
  public.intercycle_anamnesis_invites,
  public.intercycle_anamnesis_waivers,
  public.training_cycle_overlap_repair_audit
in share row exclusive mode;

do $repair$
declare
  v_repair_key constant text := 'single_enrollment_6d6035153239_overlap_20260909_v1';
  v_expected_cycles_sha constant text := '3d14c3b9d8aa42582095ef53ae89ea729889bc7642b183f3b4263a6217592640';
  v_expected_workouts_sha constant text := 'be279df38e2f283b52e401bc6c1e9d0173d5fb3f7a4068c5a897c3ed23308bcc';
  v_enrollment public.enrollments%rowtype;
  v_c2_id uuid;
  v_c6_id uuid;
  v_c3_id uuid;
  v_c7_id uuid;
  v_c4_id uuid;
  v_c8_id uuid;
  v_c9_id uuid;
  v_c10_id uuid;
  v_c11_id uuid;
  v_c12_id uuid;
  v_cycle_ids uuid[];
  v_before_cycles jsonb;
  v_before_workouts jsonb;
  v_cycles_sha text;
  v_workouts_sha text;
  v_other_dependencies integer;
  v_overlap_count integer;
  v_audit_id uuid;
begin
  if exists (
    select 1 from public.training_cycle_overlap_repair_audit
    where repair_key = v_repair_key and state = 'applied'
  ) then
    return;
  end if;

  select enrollment.* into v_enrollment
  from public.enrollments enrollment
  where substr(md5(enrollment.id::text), 1, 12) = '6d6035153239'
    and enrollment.start_date = date '2026-03-10'
    and enrollment.training_start_date = date '2026-03-10'
    and enrollment.end_date = date '2027-02-24'
  for update;
  if not found then raise exception 'overlap_repair_enrollment_manifest_mismatch'; end if;

  select cycle.id into v_c2_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = 'd324fefa6aa2'
    and cycle.cycle_number = 2 and cycle.start_date = date '2026-04-21' and cycle.end_date = date '2026-06-01'
    and cycle.status = 'completed' and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c6_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = '6d88dce60520'
    and cycle.cycle_number = 6 and cycle.start_date = date '2026-04-22' and cycle.end_date = date '2026-06-03'
    and cycle.status = 'completed' and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c3_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = 'b8b3ded1dc5c'
    and cycle.cycle_number = 3 and cycle.start_date = date '2026-06-02' and cycle.end_date = date '2026-07-13'
    and cycle.status = 'completed' and cycle.prescribed_offline_at is not null
    and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c7_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = '05b82f5dce25'
    and cycle.cycle_number = 7 and cycle.start_date = date '2026-07-13' and cycle.end_date = date '2026-08-21'
    and cycle.status = 'completed' and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c4_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = 'f8e826dae887'
    and cycle.cycle_number = 4 and cycle.start_date = date '2026-07-14' and cycle.end_date = date '2026-08-24'
    and cycle.status = 'superseded' and cycle.superseded_reason = 'extra_empty_cycle_quarantined_after_plan_duration_audit'
  for update;

  select cycle.id into v_c8_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = '4f23b51165b5'
    and cycle.cycle_number = 8 and cycle.start_date = date '2026-08-25' and cycle.end_date = date '2026-10-05'
    and cycle.status = 'active' and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c9_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = '246d5d8bef74'
    and cycle.cycle_number = 9 and cycle.start_date = date '2026-10-06' and cycle.end_date = date '2026-11-16'
    and cycle.status = 'pending' and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c10_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = '21eb64532ac0'
    and cycle.cycle_number = 10 and cycle.start_date = date '2026-11-17' and cycle.end_date = date '2026-12-28'
    and cycle.status = 'pending' and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c11_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = '8d7ba97c49f0'
    and cycle.cycle_number = 11 and cycle.start_date = date '2026-12-29' and cycle.end_date = date '2027-02-08'
    and cycle.status = 'pending' and cycle.superseded_by_cycle_id is null for update;
  select cycle.id into v_c12_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and substr(md5(cycle.id::text),1,12) = 'a734938bd3b2'
    and cycle.cycle_number = 12 and cycle.start_date = date '2027-02-09' and cycle.end_date = date '2027-02-24'
    and cycle.status = 'pending' and cycle.superseded_by_cycle_id is null for update;

  if v_c2_id is null or v_c6_id is null or v_c3_id is null or v_c7_id is null or v_c4_id is null
    or v_c8_id is null or v_c9_id is null or v_c10_id is null or v_c11_id is null or v_c12_id is null then
    raise exception 'overlap_repair_cycle_manifest_mismatch';
  end if;
  v_cycle_ids := array[v_c2_id, v_c6_id, v_c3_id, v_c7_id, v_c4_id, v_c8_id, v_c9_id, v_c10_id, v_c11_id, v_c12_id];

  select coalesce(jsonb_agg(to_jsonb(cycle) order by cycle.id), '[]'::jsonb),
    encode(extensions.digest(string_agg(
      (to_jsonb(cycle) - array['student_id','company_id','enrollment_id'])::text,
      E'\n' order by cycle.id
    ), 'sha256'), 'hex')
  into v_before_cycles, v_cycles_sha
  from public.training_cycles cycle where cycle.id = any(v_cycle_ids);

  select coalesce(jsonb_agg(to_jsonb(workout) order by workout.id), '[]'::jsonb),
    encode(extensions.digest(string_agg(
      (to_jsonb(workout) - array['company_id','created_by'])::text,
      E'\n' order by workout.id
    ), 'sha256'), 'hex')
  into v_before_workouts, v_workouts_sha
  from public.workouts workout where workout.cycle_id = any(v_cycle_ids);

  if jsonb_array_length(v_before_cycles) <> 10 or jsonb_array_length(v_before_workouts) <> 9
    or v_cycles_sha is distinct from v_expected_cycles_sha
    or v_workouts_sha is distinct from v_expected_workouts_sha then
    raise exception 'overlap_repair_snapshot_manifest_mismatch';
  end if;

  if (select count(*) from public.workouts workout where workout.cycle_id = v_c2_id) <> 1
    or (select count(*) from public.workout_exercises exercise join public.workouts workout on workout.id = exercise.workout_id where workout.cycle_id = v_c2_id) <> 0
    or (select count(*) from public.workouts workout where workout.cycle_id = v_c3_id) <> 0
    or (select count(*) from public.workouts workout where workout.cycle_id = v_c6_id) <> 4
    or (select count(*) from public.workout_exercises exercise join public.workouts workout on workout.id = exercise.workout_id where workout.cycle_id = v_c6_id) <> 51
    or (select count(*) from public.workouts workout where workout.cycle_id = v_c7_id) <> 4
    or (select count(*) from public.workout_exercises exercise join public.workouts workout on workout.id = exercise.workout_id where workout.cycle_id = v_c7_id) <> 49
    or exists (select 1 from public.workouts workout where workout.cycle_id = any(array[v_c8_id,v_c9_id,v_c10_id,v_c11_id,v_c12_id]))
    or exists (select 1 from public.workout_logs log join public.workouts workout on workout.id = log.workout_id where workout.cycle_id = any(v_cycle_ids))
    or exists (select 1 from public.workout_sessions session join public.workouts workout on workout.id = session.workout_id where workout.cycle_id = any(v_cycle_ids)) then
    raise exception 'overlap_repair_workout_usage_gate_failed';
  end if;

  select
    (select count(*) from public.cycle_feedback x where x.cycle_id = any(v_cycle_ids))
    + (select count(*) from public.ai_plan_versions x where x.cycle_id = any(v_cycle_ids))
    + (select count(*) from public.ai_strength_plans x where x.training_cycle_id = any(v_cycle_ids))
    + (select count(*) from public.running_plans x where x.training_cycle_id = any(v_cycle_ids))
    + (select count(*) from public.nutrition_plans x where x.training_cycle_id = any(v_cycle_ids))
    + (select count(*) from public.prescription_bundles x where x.training_cycle_id = any(v_cycle_ids))
    + (select count(*) from public.cycle_prescription_clear_events x where x.cycle_id = any(v_cycle_ids))
    + (select count(*) from public.workout_archive_events x where x.cycle_id = any(v_cycle_ids))
    + (select count(*) from public.intercycle_anamneses x where x.training_cycle_id = any(v_cycle_ids))
    + (select count(*) from public.intercycle_anamnesis_deliveries x where x.training_cycle_id = any(v_cycle_ids))
    + (select count(*) from public.intercycle_anamnesis_invites x where x.training_cycle_id = any(v_cycle_ids))
    + (select count(*) from public.intercycle_anamnesis_waivers x where x.training_cycle_id = any(v_cycle_ids) or x.prior_cycle_id = any(v_cycle_ids))
  into v_other_dependencies;
  if v_other_dependencies <> 0 then raise exception 'overlap_repair_dependency_gate_failed:%', v_other_dependencies; end if;

  select count(*) into v_overlap_count
  from public.training_cycles left_cycle
  join public.training_cycles right_cycle on right_cycle.enrollment_id = left_cycle.enrollment_id
    and right_cycle.id > left_cycle.id
    and right_cycle.status <> 'superseded' and right_cycle.superseded_by_cycle_id is null
    and left_cycle.start_date <= right_cycle.end_date and right_cycle.start_date <= left_cycle.end_date
  where left_cycle.enrollment_id = v_enrollment.id
    and left_cycle.status <> 'superseded' and left_cycle.superseded_by_cycle_id is null;
  if v_overlap_count <> 3 then raise exception 'overlap_repair_pair_count_mismatch:%', v_overlap_count; end if;

  insert into public.training_cycle_overlap_repair_audit (
    repair_key, batch_sha256, company_id, student_id, enrollment_id,
    before_enrollment, before_cycles, before_workouts, before_cycles_sha256, before_workouts_sha256
  ) values (
    v_repair_key, v_expected_cycles_sha, v_enrollment.company_id, v_enrollment.student_id, v_enrollment.id,
    jsonb_build_object(
      'id', v_enrollment.id,
      'company_id', v_enrollment.company_id,
      'student_id', v_enrollment.student_id,
      'start_date', v_enrollment.start_date,
      'training_start_date', v_enrollment.training_start_date,
      'end_date', v_enrollment.end_date,
      'status', v_enrollment.status
    ),
    v_before_cycles, v_before_workouts, v_cycles_sha, v_workouts_sha
  ) returning id into v_audit_id;

  update public.training_cycles
  set status = 'superseded',
    superseded_by_cycle_id = v_c6_id,
    superseded_at = now(),
    superseded_by = null,
    superseded_previous_status = status,
    superseded_reason = 'empty_placeholder_replaced_by_materialized_mfit_cycle'
  where id = v_c2_id;

  update public.training_cycles
  set start_date = date '2026-06-04',
    end_date = date '2026-07-12'
  where id = v_c3_id;

  update public.training_cycles
  set start_date = case id
      when v_c8_id then date '2026-09-10'
      when v_c9_id then date '2026-10-22'
      when v_c10_id then date '2026-12-03'
      when v_c11_id then date '2027-01-14'
    end,
    end_date = case id
      when v_c8_id then date '2026-10-21'
      when v_c9_id then date '2026-12-02'
      when v_c10_id then date '2027-01-13'
      when v_c11_id then date '2027-02-24'
    end,
    status = 'pending'
  where id = any(array[v_c8_id,v_c9_id,v_c10_id,v_c11_id]);

  update public.training_cycles
  set status = 'superseded',
    superseded_by_cycle_id = v_c11_id,
    superseded_at = now(),
    superseded_by = null,
    superseded_previous_status = status,
    superseded_reason = 'renewal_cycle_overflow_from_stale_cycle_tail'
  where id = v_c12_id;

  select count(*) into v_overlap_count
  from public.training_cycles left_cycle
  join public.training_cycles right_cycle on right_cycle.enrollment_id = left_cycle.enrollment_id
    and right_cycle.id > left_cycle.id
    and right_cycle.status <> 'superseded' and right_cycle.superseded_by_cycle_id is null
    and left_cycle.start_date <= right_cycle.end_date and right_cycle.start_date <= left_cycle.end_date
  where left_cycle.enrollment_id = v_enrollment.id
    and left_cycle.status <> 'superseded' and left_cycle.superseded_by_cycle_id is null;
  if v_overlap_count <> 0 then raise exception 'overlap_repair_postcheck_failed:%', v_overlap_count; end if;

  if not exists (
    select 1
    from public.training_cycles c6
    join public.training_cycles c3 on c3.id = v_c3_id and c3.start_date = c6.end_date + 1
    join public.training_cycles c7 on c7.id = v_c7_id and c7.start_date = c3.end_date + 1
    join public.training_cycles c8 on c8.id = v_c8_id and c8.start_date = date '2026-09-10'
    join public.training_cycles c9 on c9.id = v_c9_id and c9.start_date = c8.end_date + 1
    join public.training_cycles c10 on c10.id = v_c10_id and c10.start_date = c9.end_date + 1
    join public.training_cycles c11 on c11.id = v_c11_id and c11.start_date = c10.end_date + 1 and c11.end_date = v_enrollment.end_date
    where c6.id = v_c6_id
      and c6.cycle_number = 6 and c3.cycle_number = 3 and c7.cycle_number = 7
      and c8.cycle_number = 8 and c9.cycle_number = 9 and c10.cycle_number = 10 and c11.cycle_number = 11
  ) then
    raise exception 'overlap_repair_chronology_postcheck_failed';
  end if;

  select encode(extensions.digest(string_agg(
    (to_jsonb(workout) - array['company_id','created_by'])::text,
    E'\n' order by workout.id
  ), 'sha256'), 'hex')
  into v_workouts_sha from public.workouts workout where workout.cycle_id = any(v_cycle_ids);
  if v_workouts_sha is distinct from v_expected_workouts_sha then raise exception 'overlap_repair_workout_drift'; end if;

  update public.training_cycle_overlap_repair_audit audit
  set after_cycles = (
      select jsonb_agg(to_jsonb(cycle) order by cycle.id)
      from public.training_cycles cycle where cycle.id = any(v_cycle_ids)
    ),
    after_workouts = (
      select jsonb_agg(to_jsonb(workout) order by workout.id)
      from public.workouts workout where workout.cycle_id = any(v_cycle_ids)
    ),
    after_cycles_sha256 = (
      select encode(extensions.digest(string_agg(
        (to_jsonb(cycle) - array['student_id','company_id','enrollment_id'])::text,
        E'\n' order by cycle.id
      ), 'sha256'), 'hex')
      from public.training_cycles cycle where cycle.id = any(v_cycle_ids)
    ),
    after_workouts_sha256 = v_workouts_sha
  where audit.id = v_audit_id;

  if not exists (
    select 1 from public.training_cycle_overlap_repair_audit audit
    where audit.id = v_audit_id and audit.after_cycles_sha256 is not null
      and audit.after_workouts_sha256 = v_expected_workouts_sha and audit.state = 'applied'
  ) then raise exception 'overlap_repair_audit_postcheck_failed'; end if;
end
$repair$;

commit;
