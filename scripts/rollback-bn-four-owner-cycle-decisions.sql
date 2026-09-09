-- Fail-closed rollback for repair-bn-four-owner-cycle-decisions-apply.sql.
-- It restores both sides of each pair only while every current row still
-- matches the after-image recorded by the repair.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-four-owner-cycle-decisions:20260909', 0));

lock table public.training_cycle_owner_decision_repair_audit in share row exclusive mode;
lock table public.training_cycles in share row exclusive mode;

do $preflight$
declare
  v_count integer;
  v_mismatch integer;
begin
  select count(*) into v_count
  from public.training_cycle_owner_decision_repair_audit
  where repair_key = 'bn_four_owner_cycle_decisions_20260909'
    and state = 'applied';
  if v_count <> 4 then
    raise exception 'bn_owner_decision_rollback_count_mismatch expected=4 actual=%', v_count;
  end if;

  select count(*) into v_mismatch
  from public.training_cycle_owner_decision_repair_audit audit
  join public.training_cycles superseded on superseded.id = audit.superseded_cycle_id
  join public.training_cycles canonical on canonical.id = audit.canonical_cycle_id
  where audit.repair_key = 'bn_four_owner_cycle_decisions_20260909'
    and audit.state = 'applied'
    and (
      encode(extensions.digest(to_jsonb(superseded)::text, 'sha256'), 'hex') is distinct from audit.superseded_after_sha256
      or encode(extensions.digest(to_jsonb(canonical)::text, 'sha256'), 'hex') is distinct from audit.canonical_after_sha256
    );
  if v_mismatch <> 0 then
    raise exception 'bn_owner_decision_rollback_current_hash_mismatch count=%', v_mismatch;
  end if;
end
$preflight$;

update public.training_cycles cycle
set status = audit.superseded_before->>'status',
    start_date = (audit.superseded_before->>'start_date')::date,
    end_date = (audit.superseded_before->>'end_date')::date,
    superseded_by_cycle_id = (audit.superseded_before->>'superseded_by_cycle_id')::uuid,
    superseded_at = (audit.superseded_before->>'superseded_at')::timestamptz,
    superseded_by = (audit.superseded_before->>'superseded_by')::uuid,
    superseded_previous_status = audit.superseded_before->>'superseded_previous_status',
    superseded_reason = audit.superseded_before->>'superseded_reason'
from public.training_cycle_owner_decision_repair_audit audit
where audit.repair_key = 'bn_four_owner_cycle_decisions_20260909'
  and audit.state = 'applied'
  and cycle.id = audit.superseded_cycle_id
  and encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') = audit.superseded_after_sha256;

update public.training_cycles cycle
set start_date = (audit.canonical_before->>'start_date')::date,
    end_date = (audit.canonical_before->>'end_date')::date,
    status = audit.canonical_before->>'status',
    superseded_by_cycle_id = (audit.canonical_before->>'superseded_by_cycle_id')::uuid,
    superseded_at = (audit.canonical_before->>'superseded_at')::timestamptz,
    superseded_by = (audit.canonical_before->>'superseded_by')::uuid,
    superseded_previous_status = audit.canonical_before->>'superseded_previous_status',
    superseded_reason = audit.canonical_before->>'superseded_reason'
from public.training_cycle_owner_decision_repair_audit audit
where audit.repair_key = 'bn_four_owner_cycle_decisions_20260909'
  and audit.state = 'applied'
  and cycle.id = audit.canonical_cycle_id
  and encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex') = audit.canonical_after_sha256;

do $postflight$
declare
  v_restored integer;
begin
  select count(*) into v_restored
  from public.training_cycle_owner_decision_repair_audit audit
  join public.training_cycles superseded on superseded.id = audit.superseded_cycle_id
  join public.training_cycles canonical on canonical.id = audit.canonical_cycle_id
  where audit.repair_key = 'bn_four_owner_cycle_decisions_20260909'
    and audit.state = 'applied'
    and encode(extensions.digest(to_jsonb(superseded)::text, 'sha256'), 'hex') = audit.superseded_before_sha256
    and encode(extensions.digest(to_jsonb(canonical)::text, 'sha256'), 'hex') = audit.canonical_before_sha256;
  if v_restored <> 4 then
    raise exception 'bn_owner_decision_rollback_beforeimage_mismatch expected=4 actual=%', v_restored;
  end if;
end
$postflight$;

update public.training_cycle_owner_decision_repair_audit
set state = 'rolled_back',
    rolled_back_at = now()
where repair_key = 'bn_four_owner_cycle_decisions_20260909'
  and state = 'applied';

select
  'bn_four_owner_cycle_decisions_20260909' as repair_key,
  count(*) as rolled_back_pairs
from public.training_cycle_owner_decision_repair_audit
where repair_key = 'bn_four_owner_cycle_decisions_20260909'
  and state = 'rolled_back';

commit;
