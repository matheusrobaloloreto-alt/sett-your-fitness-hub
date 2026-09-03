-- Manual compare-and-swap rollback for the one repaired delayed delivery.
-- It refuses rollback after any subsequent change or completed workout.
do $rollback$
declare
  v_audit public.training_cycle_delivery_repair_audit%rowtype;
  v_cycle jsonb;
  v_current_enrollment jsonb;
  v_current_cycles jsonb;
  v_current_workouts jsonb;
  v_current_dependencies jsonb;
  v_restored_enrollment jsonb;
  v_restored_cycles jsonb;
  v_restored_workouts jsonb;
  v_restored_dependencies jsonb;
  v_restored integer;
begin
  select * into v_audit from public.training_cycle_delivery_repair_audit audit
  where audit.repair_key = 'delayed_template_delivery_fdbc3a0af2a5_20260903'
    and audit.state = 'applied' for update;
  if v_audit.id is null then raise exception 'rollback_audit_not_found_or_not_applied'; end if;

  perform enrollment.id from public.enrollments enrollment
  where enrollment.id = v_audit.enrollment_id for update;
  perform cycle.id from public.training_cycles cycle
  where cycle.id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
  order by cycle.id for update;
  perform workout.id from public.workouts workout
  where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
  order by workout.id for update;
  lock table public.workout_sessions, public.workout_logs, public.prescription_bundles,
    public.ai_strength_plans, public.running_plans, public.nutrition_plans,
    public.cycle_feedback, public.ai_plan_versions, public.prescription_bundle_items
    in share row exclusive mode;

  if exists (
    select 1 from public.workouts workout
    where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
      and (exists (select 1 from public.workout_sessions session where session.workout_id = workout.id)
        or exists (select 1 from public.workout_logs log where log.workout_id = workout.id))
  ) then raise exception 'rollback_blocked_post_apply_usage'; end if;

  select to_jsonb(enrollment) - 'updated_at' into v_current_enrollment
  from public.enrollments enrollment where enrollment.id = v_audit.enrollment_id;
  select jsonb_agg(to_jsonb(cycle) order by cycle.cycle_number, cycle.created_at) into v_current_cycles
  from public.training_cycles cycle where cycle.id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  select jsonb_agg(to_jsonb(workout) - 'updated_at' order by workout.sort_order, workout.id) into v_current_workouts
  from public.workouts workout
  where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  v_current_dependencies := private.snapshot_training_cycle_dependencies(
    array[v_audit.target_cycle_id, v_audit.superseded_cycle_id]
  );
  if v_current_enrollment is distinct from v_audit.after_enrollment
    or v_current_cycles is distinct from v_audit.after_cycles
    or v_current_workouts is distinct from v_audit.after_workouts
    or v_current_dependencies is distinct from v_audit.after_dependencies then
    raise exception 'rollback_blocked_post_apply_change';
  end if;

  update public.workouts workout set cycle_id = v_audit.superseded_cycle_id
  where workout.id in (
    select (snapshot->>'id')::uuid from jsonb_array_elements(v_audit.before_workouts) snapshot
  ) and workout.cycle_id = v_audit.target_cycle_id;
  get diagnostics v_restored = row_count;
  if v_restored <> jsonb_array_length(v_audit.before_workouts) then
    raise exception 'rollback_workout_restore_count_mismatch';
  end if;

  for v_cycle in select value from jsonb_array_elements(v_audit.before_cycles)
  loop
    update public.training_cycles cycle
    set cycle_number = (v_cycle->>'cycle_number')::integer,
      start_date = (v_cycle->>'start_date')::date,
      end_date = (v_cycle->>'end_date')::date,
      duration_weeks = (v_cycle->>'duration_weeks')::integer,
      status = v_cycle->>'status',
      superseded_by_cycle_id = nullif(v_cycle->>'superseded_by_cycle_id', '')::uuid,
      superseded_at = nullif(v_cycle->>'superseded_at', '')::timestamptz,
      superseded_by = nullif(v_cycle->>'superseded_by', '')::uuid,
      superseded_previous_status = nullif(v_cycle->>'superseded_previous_status', ''),
      superseded_reason = nullif(v_cycle->>'superseded_reason', '')
    where cycle.id = (v_cycle->>'id')::uuid;
  end loop;

  insert into private.training_cycle_rebase_authorizations (transaction_id, enrollment_id)
  values (txid_current(), v_audit.enrollment_id);
  update public.enrollments enrollment
  set start_date = (v_audit.before_enrollment->>'start_date')::date,
    end_date = (v_audit.before_enrollment->>'end_date')::date,
    training_start_date = (v_audit.before_enrollment->>'training_start_date')::date,
    updated_at = now()
  where enrollment.id = v_audit.enrollment_id;
  delete from private.training_cycle_rebase_authorizations authz
  where authz.transaction_id = txid_current() and authz.enrollment_id = v_audit.enrollment_id;

  select to_jsonb(enrollment) - 'updated_at' into v_restored_enrollment
  from public.enrollments enrollment where enrollment.id = v_audit.enrollment_id;
  select jsonb_agg(to_jsonb(cycle) order by cycle.cycle_number, cycle.created_at) into v_restored_cycles
  from public.training_cycles cycle where cycle.id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  select jsonb_agg(to_jsonb(workout) - 'updated_at' order by workout.sort_order, workout.id) into v_restored_workouts
  from public.workouts workout
  where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  v_restored_dependencies := private.snapshot_training_cycle_dependencies(
    array[v_audit.target_cycle_id, v_audit.superseded_cycle_id]
  );
  if v_restored_enrollment is distinct from v_audit.before_enrollment
    or v_restored_cycles is distinct from v_audit.before_cycles
    or v_restored_workouts is distinct from v_audit.before_workouts
    or v_restored_dependencies is distinct from v_audit.before_dependencies then
    raise exception 'rollback_post_restore_verification_failed';
  end if;

  update public.training_cycle_delivery_repair_audit audit
  set state = 'rolled_back', rolled_back_at = now()
  where audit.id = v_audit.id and audit.state = 'applied';
  if not found then raise exception 'rollback_audit_compare_and_swap_failed'; end if;
end
$rollback$;
