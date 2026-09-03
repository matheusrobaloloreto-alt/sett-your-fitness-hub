-- Manual compare-and-swap rollback for the two exact unique exercise-reference
-- repairs. It restores only the audited JSON slot and preserves unrelated
-- workout edits. Any change to an audited slot blocks the whole transaction.
do $rollback$
declare
  v_repair_key text := 'unique_missing_exercise_refs_20260903';
  v_record record;
  v_current_exercise jsonb;
  v_expected_exercise jsonb;
  v_restored_exercise jsonb;
  v_updated integer;
  v_applied_count integer;
  v_rolled_back_count integer;
begin
  select count(*) filter (where audit.state = 'applied'),
    count(*) filter (where audit.state = 'rolled_back')
  into v_applied_count, v_rolled_back_count
  from public.workout_exercise_ref_repair_audit audit
  where audit.repair_key = v_repair_key;
  if v_applied_count <> 2 or v_rolled_back_count <> 0 then
    raise exception 'exercise_ref_rollback_manifest_mismatch';
  end if;

  lock table public.workout_sessions, public.workout_logs in share row exclusive mode;
  perform audit.id from public.workout_exercise_ref_repair_audit audit
  where audit.repair_key = v_repair_key and audit.state = 'applied'
  order by audit.workout_id, audit.exercise_index for update;
  perform workout.id from public.workouts workout
  where workout.id in (
    select audit.workout_id from public.workout_exercise_ref_repair_audit audit
    where audit.repair_key = v_repair_key and audit.state = 'applied'
  ) order by workout.id for update;

  for v_record in
    select audit.* from public.workout_exercise_ref_repair_audit audit
    where audit.repair_key = v_repair_key and audit.state = 'applied'
    order by audit.workout_id, audit.exercise_index
  loop
    if exists (select 1 from public.workout_sessions session
        where session.workout_id = v_record.workout_id and session.created_at > v_record.applied_at)
      or exists (select 1 from public.workout_logs log
        where log.workout_id = v_record.workout_id and log.created_at > v_record.applied_at) then
      raise exception 'exercise_ref_rollback_blocked_post_apply_usage';
    end if;

    select workout.exercises -> v_record.exercise_index into v_current_exercise
    from public.workouts workout where workout.id = v_record.workout_id;
    v_expected_exercise := jsonb_set(
      v_record.before_exercise, '{exercise_id}', to_jsonb(v_record.new_exercise_id::text), true
    );
    if v_current_exercise is distinct from v_expected_exercise then
      raise exception 'exercise_ref_rollback_blocked_changed_slot';
    end if;

    update public.workouts workout
    set exercises = jsonb_set(
      workout.exercises,
      array[v_record.exercise_index::text],
      v_record.before_exercise,
      false
    )
    where workout.id = v_record.workout_id;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then raise exception 'exercise_ref_rollback_update_count_mismatch'; end if;

    select workout.exercises -> v_record.exercise_index into v_restored_exercise
    from public.workouts workout where workout.id = v_record.workout_id;
    if v_restored_exercise is distinct from v_record.before_exercise then
      raise exception 'exercise_ref_rollback_post_restore_mismatch';
    end if;

    update public.workout_exercise_ref_repair_audit audit
    set state = 'rolled_back', rolled_back_at = now()
    where audit.id = v_record.id and audit.state = 'applied';
    if not found then raise exception 'exercise_ref_rollback_compare_and_swap_failed'; end if;
  end loop;

  select count(*) filter (where audit.state = 'applied'),
    count(*) filter (where audit.state = 'rolled_back')
  into v_applied_count, v_rolled_back_count
  from public.workout_exercise_ref_repair_audit audit
  where audit.repair_key = v_repair_key;
  if v_applied_count <> 0 or v_rolled_back_count <> 2 then
    raise exception 'exercise_ref_rollback_final_manifest_mismatch';
  end if;
end
$rollback$;
