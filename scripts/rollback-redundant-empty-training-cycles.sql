-- Manual rollback. Compare-and-swap protects any cycle used after remediation.
begin;

set local lock_timeout = '8s';
set local statement_timeout = '120s';
select pg_advisory_xact_lock(hashtextextended('sett:empty-cycle-supersession:v1', 0));

lock table public.training_cycles in share row exclusive mode;
lock table public.workouts in share row exclusive mode;
lock table public.workout_logs in share row exclusive mode;
lock table public.workout_sessions in share row exclusive mode;
lock table public.cycle_feedback in share row exclusive mode;
lock table public.ai_plan_versions in share row exclusive mode;
lock table public.ai_strength_plans in share row exclusive mode;
lock table public.running_plans in share row exclusive mode;
lock table public.nutrition_plans in share row exclusive mode;
lock table public.prescription_bundles in share row exclusive mode;

do $rollback$
declare
  v_expected constant integer := 18;
  v_applied integer;
  v_changed integer;
  v_used integer;
  v_restored integer;
  v_audit_updated integer;
  v_restore_mismatches integer;
begin
  select count(*) into v_applied
  from public.training_cycle_empty_supersession_audit audit
  where audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
    and audit.state = 'applied';
  if v_applied <> v_expected then
    raise exception 'rollback_manifest_count_mismatch expected=% applied=%', v_expected, v_applied;
  end if;

  select count(*) into v_changed
  from public.training_cycle_empty_supersession_audit audit
  join public.training_cycles cycle on cycle.id = audit.redundant_cycle_id
  where audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
    and audit.state = 'applied'
    and encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') is distinct from audit.post_sha256;
  if v_changed > 0 then raise exception 'rollback_blocked_post_apply_change'; end if;

  select count(*) into v_used
  from public.training_cycle_empty_supersession_audit audit
  where audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
    and audit.state = 'applied'
    and (
      exists (select 1 from public.workouts workout where workout.cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.workout_logs log join public.workouts workout on workout.id = log.workout_id where workout.cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.workout_sessions session join public.workouts workout on workout.id = session.workout_id where workout.cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.ai_plan_versions version where version.cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.running_plans running where running.training_cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = audit.redundant_cycle_id)
      or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = audit.redundant_cycle_id)
    );
  if v_used > 0 then raise exception 'rollback_blocked_post_apply_usage'; end if;

  update public.training_cycles cycle
  set status = audit.before_snapshot->>'status',
      superseded_by_cycle_id = (audit.before_snapshot->>'superseded_by_cycle_id')::uuid,
      superseded_at = (audit.before_snapshot->>'superseded_at')::timestamptz,
      superseded_by = (audit.before_snapshot->>'superseded_by')::uuid,
      superseded_previous_status = audit.before_snapshot->>'superseded_previous_status',
      superseded_reason = audit.before_snapshot->>'superseded_reason'
  from public.training_cycle_empty_supersession_audit audit
  where audit.redundant_cycle_id = cycle.id
    and audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
    and audit.state = 'applied';
  get diagnostics v_restored = row_count;
  if v_restored <> v_expected then
    raise exception 'rollback_restore_count_mismatch expected=% restored=%', v_expected, v_restored;
  end if;

  select count(*) into v_restore_mismatches
  from public.training_cycle_empty_supersession_audit audit
  join public.training_cycles cycle on cycle.id = audit.redundant_cycle_id
  where audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
    and audit.state = 'applied'
    and (
      cycle.status is distinct from audit.before_snapshot->>'status'
      or cycle.superseded_by_cycle_id is distinct from (audit.before_snapshot->>'superseded_by_cycle_id')::uuid
      or cycle.superseded_at is distinct from (audit.before_snapshot->>'superseded_at')::timestamptz
      or cycle.superseded_by is distinct from (audit.before_snapshot->>'superseded_by')::uuid
      or cycle.superseded_previous_status is distinct from audit.before_snapshot->>'superseded_previous_status'
      or cycle.superseded_reason is distinct from audit.before_snapshot->>'superseded_reason'
    );
  if v_restore_mismatches > 0 then
    raise exception 'rollback_restore_snapshot_mismatch count=%', v_restore_mismatches;
  end if;

  update public.training_cycle_empty_supersession_audit audit
  set state = 'rolled_back', rolled_back_at = now()
  where audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
    and audit.state = 'applied';
  get diagnostics v_audit_updated = row_count;
  if v_audit_updated <> v_expected then
    raise exception 'rollback_audit_count_mismatch expected=% updated=%', v_expected, v_audit_updated;
  end if;

  if exists (
    select 1 from public.training_cycle_empty_supersession_audit audit
    where audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
      and audit.state = 'applied'
  ) then
    raise exception 'rollback_postcheck_applied_rows_remain';
  end if;
end
$rollback$;

commit;
