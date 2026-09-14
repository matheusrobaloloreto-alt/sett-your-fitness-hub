-- Rollback for repair-bn-beatriz-aldylayne-cycle-overlaps-apply.sql.
-- Restores only rows whose current after_sha256 still matches the recorded
-- applied image. If anything changed after the repair, this fails closed.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-beatriz-aldylayne-cycle-repair:20260909', 0));

lock table public.training_cycle_targeted_overlap_repair_audit in share row exclusive mode;
lock table public.training_cycles in share row exclusive mode;

do $pre_gate$
declare
  v_count integer;
  v_mismatch integer;
begin
  select count(*) into v_count
  from public.training_cycle_targeted_overlap_repair_audit
  where repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
    and state = 'applied';

  if v_count <> 4 then
    raise exception 'bn_targeted_cycle_rollback_count_mismatch expected=4 actual=%', v_count;
  end if;

  select count(*) into v_mismatch
  from public.training_cycle_targeted_overlap_repair_audit audit
  join public.training_cycles cycle on cycle.id = audit.cycle_id
  where audit.repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
    and audit.state = 'applied'
    and encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') is distinct from audit.after_sha256;

  if v_mismatch <> 0 then
    raise exception 'bn_targeted_cycle_rollback_current_hash_mismatch count=%', v_mismatch;
  end if;
end
$pre_gate$;

update public.training_cycles cycle
set start_date = (audit.before_cycle->>'start_date')::date,
    end_date = (audit.before_cycle->>'end_date')::date,
    status = audit.before_cycle->>'status',
    superseded_by_cycle_id = (audit.before_cycle->>'superseded_by_cycle_id')::uuid,
    superseded_at = (audit.before_cycle->>'superseded_at')::timestamptz,
    superseded_by = (audit.before_cycle->>'superseded_by')::uuid,
    superseded_previous_status = audit.before_cycle->>'superseded_previous_status',
    superseded_reason = audit.before_cycle->>'superseded_reason'
from public.training_cycle_targeted_overlap_repair_audit audit
where audit.repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
  and audit.state = 'applied'
  and audit.cycle_id = cycle.id
  and encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') = audit.after_sha256;

do $post_gate$
declare
  v_restored integer;
begin
  select count(*) into v_restored
  from public.training_cycle_targeted_overlap_repair_audit audit
  join public.training_cycles cycle on cycle.id = audit.cycle_id
  where audit.repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
    and audit.state = 'applied'
    and encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') = audit.before_sha256;

  if v_restored <> 4 then
    raise exception 'bn_targeted_cycle_rollback_beforeimage_mismatch expected=4 actual=%', v_restored;
  end if;
end
$post_gate$;

update public.training_cycle_targeted_overlap_repair_audit
set state = 'rolled_back',
    rolled_back_at = now()
where repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
  and state = 'applied';

select
  'bn_beatriz_aldylayne_cycles_20260909' as repair_key,
  count(*) as rolled_back_cycles
from public.training_cycle_targeted_overlap_repair_audit
where repair_key = 'bn_beatriz_aldylayne_cycles_20260909'
  and state = 'rolled_back';

commit;
