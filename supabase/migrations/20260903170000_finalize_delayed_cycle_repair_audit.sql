-- Production compatibility follow-up for 20260903140740.
-- The original deterministic repair was applied before dependency snapshots
-- were added to its audit row. Add them without touching plan/cycle/workout
-- data, and fail closed if the repaired state no longer matches its audit.

alter table public.training_cycle_delivery_repair_audit
  add column if not exists before_dependencies jsonb,
  add column if not exists after_dependencies jsonb;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.snapshot_training_cycle_dependencies(p_cycle_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'workout_sessions', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.workout_sessions row_value join public.workouts workout on workout.id = row_value.workout_id
      where workout.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'workout_logs', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.workout_logs row_value join public.workouts workout on workout.id = row_value.workout_id
      where workout.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'prescription_bundles', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.prescription_bundles row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'ai_strength_plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.ai_strength_plans row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'running_plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.running_plans row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'nutrition_plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.nutrition_plans row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'cycle_feedback', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.cycle_feedback row_value where row_value.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'ai_plan_versions', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.ai_plan_versions row_value where row_value.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'prescription_bundle_items', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.prescription_bundle_items row_value
      where row_value.entity_type = 'training_cycle' and row_value.entity_id = any(p_cycle_ids)), '[]'::jsonb)
  );
$function$;
revoke all on function private.snapshot_training_cycle_dependencies(uuid[]) from public, anon, authenticated;

do $backfill_existing_audit$
declare
  v_audit public.training_cycle_delivery_repair_audit%rowtype;
  v_current_enrollment jsonb;
  v_current_cycles jsonb;
  v_current_workouts jsonb;
  v_current_dependencies jsonb;
  v_post_apply_dependencies integer;
  v_workout_usage integer;
begin
  select audit.* into v_audit
  from public.training_cycle_delivery_repair_audit audit
  where audit.repair_key = 'delayed_template_delivery_fdbc3a0af2a5_20260903'
    and audit.state = 'applied'
    and (audit.before_dependencies is null or audit.after_dependencies is null)
  for update;
  if v_audit.id is null then return; end if;

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

  select to_jsonb(enrollment) - 'updated_at' into v_current_enrollment
  from public.enrollments enrollment where enrollment.id = v_audit.enrollment_id;
  select jsonb_agg(to_jsonb(cycle) order by cycle.cycle_number, cycle.created_at)
  into v_current_cycles from public.training_cycles cycle
  where cycle.id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  select jsonb_agg(to_jsonb(workout) - 'updated_at' order by workout.sort_order, workout.id)
  into v_current_workouts from public.workouts workout
  where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  v_current_dependencies := private.snapshot_training_cycle_dependencies(
    array[v_audit.target_cycle_id, v_audit.superseded_cycle_id]
  );

  select
    (select count(*) from public.workout_sessions session join public.workouts workout
      on workout.id = session.workout_id
      where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id))
    + (select count(*) from public.workout_logs log join public.workouts workout
      on workout.id = log.workout_id
      where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id))
  into v_workout_usage;
  select
    (select count(*) from public.prescription_bundles row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.ai_strength_plans row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.running_plans row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.nutrition_plans row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.cycle_feedback row_value
      where row_value.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.ai_plan_versions row_value
      where row_value.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.prescription_bundle_items row_value
      where row_value.entity_type = 'training_cycle'
        and row_value.entity_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
  into v_post_apply_dependencies;

  if v_current_enrollment is distinct from v_audit.after_enrollment
    or v_current_cycles is distinct from v_audit.after_cycles
    or v_current_workouts is distinct from v_audit.after_workouts
    or v_workout_usage <> 0
    or v_post_apply_dependencies <> 0 then
    raise exception 'delayed_template_delivery_dependency_backfill_blocked';
  end if;

  update public.training_cycle_delivery_repair_audit audit
  set before_dependencies = v_current_dependencies,
    after_dependencies = v_current_dependencies,
    after_sha256 = encode(extensions.digest(
      concat_ws('|', v_current_enrollment::text, v_current_cycles::text,
        v_current_workouts::text, v_current_dependencies::text), 'sha256'), 'hex')
  where audit.id = v_audit.id
    and audit.state = 'applied'
    and (audit.before_dependencies is null or audit.after_dependencies is null);
  if not found then raise exception 'delayed_template_delivery_dependency_backfill_compare_and_swap_failed'; end if;
end
$backfill_existing_audit$;
