-- Emergency rollback for the exact semantic supersession batch. It restores
-- visibility only if the preserved MFIT workouts still have no real usage or
-- downstream plan references. Any post-apply use aborts the entire rollback.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(hashtextextended('sett:mfit-semantic-supersession:v1', 0));

lock table
  public.training_cycles,
  public.workouts,
  public.workout_logs,
  public.workout_sessions,
  public.cycle_feedback,
  public.ai_plan_versions,
  public.ai_strength_plans,
  public.running_plans,
  public.nutrition_plans,
  public.prescription_bundles,
  public.training_cycle_supersession_audit
in share row exclusive mode;

do $rollback_gate$
declare
  v_rows integer;
  v_unsafe integer;
begin
  select count(*) into v_rows
  from public.training_cycle_supersession_audit audit
  where audit.batch_sha256 = 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247'
    and audit.state = 'applied';

  if v_rows <> 3 then
    raise exception 'mfit_semantic_rollback_expected_3_applied_rows actual=%', v_rows;
  end if;

  select count(*) into v_unsafe
  from public.training_cycle_supersession_audit audit
  where audit.batch_sha256 = 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247'
    and audit.state = 'applied'
    and (
      exists (select 1 from public.workout_logs l where l.workout_id = any(audit.workout_ids))
      or exists (select 1 from public.workout_sessions s where s.workout_id = any(audit.workout_ids))
      or exists (select 1 from public.cycle_feedback f where f.cycle_id = audit.superseded_cycle_id)
      or exists (select 1 from public.ai_plan_versions p where p.cycle_id = audit.superseded_cycle_id)
      or exists (select 1 from public.ai_strength_plans p where p.training_cycle_id = audit.superseded_cycle_id)
      or exists (select 1 from public.running_plans p where p.training_cycle_id = audit.superseded_cycle_id)
      or exists (select 1 from public.nutrition_plans p where p.training_cycle_id = audit.superseded_cycle_id)
      or exists (select 1 from public.prescription_bundles p where p.training_cycle_id = audit.superseded_cycle_id)
    );

  if v_unsafe <> 0 then
    raise exception 'mfit_semantic_rollback_blocked_post_apply_usage rows=%', v_unsafe;
  end if;
end
$rollback_gate$;

update public.training_cycles cycle
set
  status = cycle.superseded_previous_status,
  superseded_by_cycle_id = null,
  superseded_at = null,
  superseded_by = null,
  superseded_previous_status = null,
  superseded_reason = null
from public.training_cycle_supersession_audit audit
where audit.batch_sha256 = 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247'
  and audit.state = 'applied'
  and cycle.id = audit.superseded_cycle_id
  and cycle.status = 'superseded'
  and cycle.superseded_by_cycle_id = audit.canonical_cycle_id;

update public.training_cycle_supersession_audit audit
set state = 'rolled_back', rolled_back_at = now()
where audit.batch_sha256 = 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247'
  and audit.state = 'applied';

do $rollback_post_gate$
declare
  v_restored integer;
begin
  select count(*) into v_restored
  from public.training_cycle_supersession_audit audit
  join public.training_cycles cycle on cycle.id = audit.superseded_cycle_id
  where audit.batch_sha256 = 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247'
    and audit.state = 'rolled_back'
    and cycle.status = audit.superseded_snapshot ->> 'status'
    and cycle.superseded_by_cycle_id is null;

  if v_restored <> 3 then
    raise exception 'mfit_semantic_rollback_postcheck_failed restored=%', v_restored;
  end if;
end
$rollback_post_gate$;

commit;
