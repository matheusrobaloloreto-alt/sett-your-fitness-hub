-- Manual rollback for the conservative empty-cycle quarantine.
-- Refuses to restore a cycle after the cycle row has been changed.
do $rollback$
declare
  v_repair_key text := 'extra_empty_training_cycles_20260903';
  v_record record;
  v_current_cycle jsonb;
  v_restored_cycle jsonb;
  v_updated integer;
  v_restored integer := 0;
  v_applied_count integer;
  v_rolled_back_count integer;
begin
  select count(*) filter (where audit.state = 'applied'),
    count(*) filter (where audit.state = 'rolled_back')
  into v_applied_count, v_rolled_back_count
  from public.training_cycle_empty_extra_repair_audit audit
  where audit.repair_key = v_repair_key;
  if v_applied_count <> 110 or v_rolled_back_count <> 0 then
    raise exception 'extra_empty_training_cycles_rollback_manifest_mismatch';
  end if;

  lock table public.workouts, public.workout_sessions, public.workout_logs,
    public.cycle_feedback, public.ai_plan_versions, public.ai_strength_plans,
    public.running_plans, public.nutrition_plans, public.prescription_bundles,
    public.prescription_bundle_items in share row exclusive mode;

  for v_record in
    select audit.*
    from public.training_cycle_empty_extra_repair_audit audit
    where audit.repair_key = v_repair_key
      and audit.state = 'applied'
    order by audit.applied_at, audit.id
    for update
  loop
    perform cycle.id from public.training_cycles cycle
    where cycle.id = v_record.cycle_id
    for update;

    select to_jsonb(cycle) into v_current_cycle
    from public.training_cycles cycle where cycle.id = v_record.cycle_id;

    if v_current_cycle is null
      or (v_current_cycle - array[
        'updated_at', 'status', 'superseded_by_cycle_id', 'superseded_at',
        'superseded_by', 'superseded_previous_status', 'superseded_reason'
      ]) is distinct from (v_record.before_cycle - array[
        'updated_at', 'status', 'superseded_by_cycle_id', 'superseded_at',
        'superseded_by', 'superseded_previous_status', 'superseded_reason'
      ])
      or v_current_cycle->>'status' <> 'superseded'
      or v_current_cycle->>'superseded_reason' <> 'extra_empty_cycle_quarantined_after_plan_duration_audit'
      or nullif(v_current_cycle->>'superseded_by_cycle_id', '') is not null
      or nullif(v_current_cycle->>'superseded_by', '') is not null
      or v_current_cycle->>'superseded_previous_status' is distinct from v_record.before_cycle->>'status'
      or not exists (
        select 1 from public.training_cycles cycle
        where cycle.id = v_record.cycle_id
        and not exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id)
        and not exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
        and not exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
        and not exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
        and not exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
        and not exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
        and not exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
        and not exists (
          select 1 from public.prescription_bundle_items item
          where item.entity_type = 'training_cycle'
            and item.entity_id = cycle.id
        )
      ) then
      raise exception 'extra_empty_training_cycles_rollback_blocked_changed_cycle';
    end if;

    update public.training_cycles cycle
    set cycle_number = (v_record.before_cycle->>'cycle_number')::integer,
      start_date = (v_record.before_cycle->>'start_date')::date,
      end_date = (v_record.before_cycle->>'end_date')::date,
      duration_weeks = (v_record.before_cycle->>'duration_weeks')::integer,
      status = v_record.before_cycle->>'status',
      name = v_record.before_cycle->>'name',
      superseded_by_cycle_id = nullif(v_record.before_cycle->>'superseded_by_cycle_id', '')::uuid,
      superseded_at = nullif(v_record.before_cycle->>'superseded_at', '')::timestamptz,
      superseded_by = nullif(v_record.before_cycle->>'superseded_by', '')::uuid,
      superseded_previous_status = nullif(v_record.before_cycle->>'superseded_previous_status', ''),
      superseded_reason = nullif(v_record.before_cycle->>'superseded_reason', '')
    where cycle.id = v_record.cycle_id;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then raise exception 'extra_empty_training_cycles_rollback_update_count_mismatch'; end if;

    select to_jsonb(cycle) into v_restored_cycle
    from public.training_cycles cycle where cycle.id = v_record.cycle_id;
    if (v_restored_cycle - 'updated_at') is distinct from (v_record.before_cycle - 'updated_at') then
      raise exception 'extra_empty_training_cycles_rollback_post_restore_mismatch';
    end if;

    update public.training_cycle_empty_extra_repair_audit audit
    set state = 'rolled_back', rolled_back_at = now()
    where audit.id = v_record.id
      and audit.state = 'applied';
    if not found then raise exception 'extra_empty_training_cycles_rollback_compare_and_swap_failed'; end if;

    v_restored := v_restored + 1;
  end loop;

  select count(*) filter (where audit.state = 'applied'),
    count(*) filter (where audit.state = 'rolled_back')
  into v_applied_count, v_rolled_back_count
  from public.training_cycle_empty_extra_repair_audit audit
  where audit.repair_key = v_repair_key;
  if v_applied_count <> 0 or v_rolled_back_count <> 110 then
    raise exception 'extra_empty_training_cycles_rollback_final_manifest_mismatch';
  end if;

  raise notice 'Restored % quarantined empty cycles', v_restored;
end
$rollback$;
