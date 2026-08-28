-- Emergency rollback for batch
-- 943ddc3130e12cece0b1d46fefecd9d5fbd84b0ac7b887b2311f2d3a58ab0070.
-- Run manually only after an incident review. Every row is compare-and-swap
-- checked against the restricted before-images written by the apply migration.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(hashtextextended('sett:mfit-cycle-overlap-repair:v1', 0));

lock table
  public.mfit_cycle_overlap_repairs,
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
  public.prescription_bundles
in share row exclusive mode;

do $mfit_lossless_rollback$
declare
  v_batch_sha256 constant text := '943ddc3130e12cece0b1d46fefecd9d5fbd84b0ac7b887b2311f2d3a58ab0070';
  v_expected_repairs constant integer := 15;
  v_expected_workouts constant integer := 56;
  v_expected_exercise_rows constant integer := 465;
  v_repair public.mfit_cycle_overlap_repairs%rowtype;
  v_current_original public.training_cycles%rowtype;
  v_original_before public.training_cycles%rowtype;
  v_imported_before public.training_cycles%rowtype;
  v_expected_original jsonb;
  v_count integer;
  v_affected integer;
begin
  select count(*)::integer into v_count
  from public.mfit_cycle_overlap_repairs
  where batch_sha256 = v_batch_sha256
    and state = 'applied';
  if v_count <> v_expected_repairs then
    raise exception 'mfit_lossless_rollback_batch_mismatch expected=% actual=%', v_expected_repairs, v_count;
  end if;

  if (select coalesce(sum(workout_count), 0) from public.mfit_cycle_overlap_repairs
      where batch_sha256 = v_batch_sha256 and state = 'applied') <> v_expected_workouts
     or (select coalesce(sum(exercise_row_count), 0) from public.mfit_cycle_overlap_repairs
      where batch_sha256 = v_batch_sha256 and state = 'applied') <> v_expected_exercise_rows then
    raise exception 'mfit_lossless_rollback_inventory_mismatch';
  end if;

  -- Validate the complete batch before restoring any row.
  for v_repair in
    select *
    from public.mfit_cycle_overlap_repairs
    where batch_sha256 = v_batch_sha256
      and state = 'applied'
    order by imported_cycle_id
  loop
    if exists (
      select 1 from public.training_cycles where id = v_repair.imported_cycle_id
    ) then
      raise exception 'mfit_lossless_rollback_source_already_exists ref=%', left(md5(v_repair.imported_cycle_id::text), 12);
    end if;

    select * into v_current_original
    from public.training_cycles
    where id = v_repair.original_cycle_id
    for update;
    if not found then
      raise exception 'mfit_lossless_rollback_target_missing ref=%', left(md5(v_repair.original_cycle_id::text), 12);
    end if;

    select * into v_original_before
    from jsonb_populate_record(null::public.training_cycles, v_repair.original_cycle_snapshot);
    select * into v_imported_before
    from jsonb_populate_record(null::public.training_cycles, v_repair.imported_cycle_snapshot);

    if encode(extensions.digest(v_repair.original_cycle_snapshot::text, 'sha256'), 'hex')
         is distinct from v_repair.original_cycle_snapshot_sha256
       or encode(extensions.digest(v_repair.imported_cycle_snapshot::text, 'sha256'), 'hex')
         is distinct from v_repair.imported_cycle_snapshot_sha256 then
      raise exception 'mfit_lossless_rollback_cycle_snapshot_hash_mismatch ref=%', left(md5(v_repair.imported_cycle_id::text), 12);
    end if;

    v_expected_original := to_jsonb(v_original_before) || jsonb_build_object(
      'name', coalesce(v_original_before.name, v_imported_before.name),
      'objective', coalesce(v_original_before.objective, v_imported_before.objective),
      'duration_weeks', coalesce(v_original_before.duration_weeks, v_imported_before.duration_weeks),
      'workouts', coalesce(v_original_before.workouts, v_imported_before.workouts),
      'notes', coalesce(v_original_before.notes, v_imported_before.notes),
      'anamnese_id', coalesce(v_original_before.anamnese_id, v_imported_before.anamnese_id),
      'bundle_id', coalesce(v_original_before.bundle_id, v_imported_before.bundle_id),
      'delivery_status', coalesce(v_original_before.delivery_status, v_imported_before.delivery_status),
      'prescribed_offline_at', coalesce(v_original_before.prescribed_offline_at, v_imported_before.prescribed_offline_at),
      'prescribed_offline_by', coalesce(v_original_before.prescribed_offline_by, v_imported_before.prescribed_offline_by),
      'prescribed_offline_note', coalesce(v_original_before.prescribed_offline_note, v_imported_before.prescribed_offline_note)
    );

    if to_jsonb(v_current_original) is distinct from v_expected_original then
      raise exception 'mfit_lossless_rollback_target_changed ref=%', left(md5(v_repair.original_cycle_id::text), 12);
    end if;

    select count(*)::integer into v_count
    from public.workouts as workout
    where workout.cycle_id = v_repair.original_cycle_id
      and workout.id = any(v_repair.workout_ids);
    if v_count <> v_repair.workout_count
       or (select count(*) from public.workouts where cycle_id = v_repair.original_cycle_id) <> v_repair.workout_count then
      raise exception 'mfit_lossless_rollback_workout_set_changed ref=%', left(md5(v_repair.original_cycle_id::text), 12);
    end if;

    select count(*)::integer into v_count
    from jsonb_array_elements(v_repair.workout_snapshots) as snapshot
    left join public.workouts as workout on workout.id = (snapshot->>'id')::uuid
    where workout.id is null
       or workout.cycle_id is distinct from v_repair.original_cycle_id
       or (to_jsonb(workout) - 'cycle_id' - 'updated_at')
          is distinct from (snapshot - 'cycle_id' - 'updated_at');
    if v_count <> 0 then
      raise exception 'mfit_lossless_rollback_workout_content_changed ref=%', left(md5(v_repair.original_cycle_id::text), 12);
    end if;

    if encode(extensions.digest(
      (select string_agg(snapshot::text, E'\n' order by (snapshot->>'id')::uuid)
       from jsonb_array_elements(v_repair.workout_snapshots) as snapshot),
      'sha256'
    ), 'hex') is distinct from v_repair.workout_snapshots_sha256 then
      raise exception 'mfit_lossless_rollback_workout_snapshot_hash_mismatch ref=%', left(md5(v_repair.imported_cycle_id::text), 12);
    end if;

    if exists (select 1 from public.workout_logs where workout_id = any(v_repair.workout_ids))
       or exists (select 1 from public.workout_sessions where workout_id = any(v_repair.workout_ids))
       or exists (select 1 from public.cycle_feedback where cycle_id = v_repair.original_cycle_id)
       or exists (select 1 from public.ai_plan_versions where cycle_id = v_repair.original_cycle_id)
       or exists (select 1 from public.ai_strength_plans where training_cycle_id = v_repair.original_cycle_id)
       or exists (select 1 from public.running_plans where training_cycle_id = v_repair.original_cycle_id)
       or exists (select 1 from public.nutrition_plans where training_cycle_id = v_repair.original_cycle_id)
       or exists (select 1 from public.prescription_bundles where training_cycle_id = v_repair.original_cycle_id) then
      raise exception 'mfit_lossless_rollback_new_history_or_reference ref=%', left(md5(v_repair.original_cycle_id::text), 12);
    end if;

    select count(*)::integer into v_count
    from public.workout_exercises
    where workout_id = any(v_repair.workout_ids);
    if v_count <> v_repair.exercise_row_count then
      raise exception 'mfit_lossless_rollback_exercise_rows_changed ref=%', left(md5(v_repair.original_cycle_id::text), 12);
    end if;
  end loop;

  insert into public.training_cycles
  select snapshot.*
  from public.mfit_cycle_overlap_repairs as repair
  cross join lateral jsonb_populate_record(
    null::public.training_cycles,
    repair.imported_cycle_snapshot
  ) as snapshot
  where repair.batch_sha256 = v_batch_sha256
    and repair.state = 'applied';

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_repairs then
    raise exception 'mfit_lossless_rollback_source_restore_mismatch expected=% actual=%', v_expected_repairs, v_affected;
  end if;

  update public.workouts as workout
  set
    cycle_id = (snapshot.value->>'cycle_id')::uuid,
    updated_at = (snapshot.value->>'updated_at')::timestamptz
  from public.mfit_cycle_overlap_repairs as repair
  cross join lateral jsonb_array_elements(repair.workout_snapshots) as snapshot(value)
  where repair.batch_sha256 = v_batch_sha256
    and repair.state = 'applied'
    and workout.id = (snapshot.value->>'id')::uuid
    and workout.cycle_id = repair.original_cycle_id;

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_workouts then
    raise exception 'mfit_lossless_rollback_workout_restore_mismatch expected=% actual=%', v_expected_workouts, v_affected;
  end if;

  update public.training_cycles as current
  set
    enrollment_id = snapshot.enrollment_id,
    cycle_number = snapshot.cycle_number,
    start_date = snapshot.start_date,
    end_date = snapshot.end_date,
    status = snapshot.status,
    created_at = snapshot.created_at,
    company_id = snapshot.company_id,
    name = snapshot.name,
    objective = snapshot.objective,
    duration_weeks = snapshot.duration_weeks,
    workouts = snapshot.workouts,
    notes = snapshot.notes,
    student_id = snapshot.student_id,
    anamnese_id = snapshot.anamnese_id,
    bundle_id = snapshot.bundle_id,
    delivery_status = snapshot.delivery_status,
    prescribed_offline_at = snapshot.prescribed_offline_at,
    prescribed_offline_by = snapshot.prescribed_offline_by,
    prescribed_offline_note = snapshot.prescribed_offline_note
  from public.mfit_cycle_overlap_repairs as repair
  cross join lateral jsonb_populate_record(
    null::public.training_cycles,
    repair.original_cycle_snapshot
  ) as snapshot
  where repair.batch_sha256 = v_batch_sha256
    and repair.state = 'applied'
    and current.id = repair.original_cycle_id;

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_repairs then
    raise exception 'mfit_lossless_rollback_target_restore_mismatch expected=% actual=%', v_expected_repairs, v_affected;
  end if;

  update public.mfit_cycle_overlap_repairs
  set state = 'rolled_back', rolled_back_at = now()
  where batch_sha256 = v_batch_sha256
    and state = 'applied';

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected_repairs then
    raise exception 'mfit_lossless_rollback_audit_state_mismatch expected=% actual=%', v_expected_repairs, v_affected;
  end if;

  select count(*)::integer into v_count
  from public.training_cycles as cycle
  join public.mfit_cycle_overlap_repairs as repair on repair.imported_cycle_id = cycle.id
  where repair.batch_sha256 = v_batch_sha256;
  if v_count <> v_expected_repairs then
    raise exception 'mfit_lossless_rollback_post_source_count_mismatch expected=% actual=%', v_expected_repairs, v_count;
  end if;

  select count(*)::integer into v_count
  from public.workouts as workout
  join public.mfit_cycle_overlap_repairs as repair
    on workout.id = any(repair.workout_ids)
   and workout.cycle_id = repair.imported_cycle_id
  where repair.batch_sha256 = v_batch_sha256;
  if v_count <> v_expected_workouts then
    raise exception 'mfit_lossless_rollback_post_workout_count_mismatch expected=% actual=%', v_expected_workouts, v_count;
  end if;
end
$mfit_lossless_rollback$;

commit;
