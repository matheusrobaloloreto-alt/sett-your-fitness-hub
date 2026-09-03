-- Quarantine duplicated/generated empty training cycles that exceed the real
-- plan duration. This is intentionally conservative: it never deletes rows,
-- never moves workouts, and skips any cycle with workouts, logs, sessions,
-- feedback, AI plans, bundles, or version history.

create table if not exists public.training_cycle_empty_extra_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  enrollment_id uuid not null,
  cycle_id uuid not null,
  before_cycle jsonb not null,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (repair_key, cycle_id)
);

alter table public.training_cycle_empty_extra_repair_audit enable row level security;
revoke all on table public.training_cycle_empty_extra_repair_audit from public, anon, authenticated;
grant select, insert, update on table public.training_cycle_empty_extra_repair_audit to service_role;

do $repair$
declare
  v_repair_key text := 'extra_empty_training_cycles_20260903';
  v_applied integer := 0;
  v_expected integer := 0;
begin
  with visible_cycles as (
    select
      enrollment.id as enrollment_id,
      cycle.id as cycle_id,
      row_number() over (
        partition by enrollment.id
        order by cycle.start_date, cycle.end_date, cycle.cycle_number, cycle.created_at, cycle.id
      ) as visible_position,
      ceil(
        coalesce(greatest(plan.duration_days, plan.duration_weeks * 7, 0), 0)
        / greatest(coalesce(plan.cycle_duration_days, 42), 1)::numeric
      )::integer as expected_cycles
    from public.enrollments enrollment
    join public.plans plan on plan.id = enrollment.plan_id
    join public.training_cycles cycle on cycle.enrollment_id = enrollment.id
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
    where enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
  ), candidates as (
    select visible.enrollment_id, visible.cycle_id
    from visible_cycles visible
    where visible.expected_cycles > 0
      and visible.visible_position > visible.expected_cycles
      and not exists (select 1 from public.workouts workout where workout.cycle_id = visible.cycle_id)
      and not exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = visible.cycle_id)
      and not exists (select 1 from public.ai_plan_versions version where version.cycle_id = visible.cycle_id)
      and not exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = visible.cycle_id)
      and not exists (select 1 from public.running_plans running where running.training_cycle_id = visible.cycle_id)
      and not exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = visible.cycle_id)
      and not exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = visible.cycle_id)
      and not exists (
        select 1 from public.prescription_bundle_items item
        where item.entity_type = 'training_cycle'
          and item.entity_id = visible.cycle_id
      )
  ), audited as (
    insert into public.training_cycle_empty_extra_repair_audit (
      repair_key, enrollment_id, cycle_id, before_cycle
    )
    select v_repair_key, candidate.enrollment_id, candidate.cycle_id, to_jsonb(cycle)
    from candidates candidate
    join public.training_cycles cycle on cycle.id = candidate.cycle_id
    on conflict (repair_key, cycle_id) do nothing
    returning cycle_id
  ), updated as (
    update public.training_cycles cycle
    set status = 'superseded',
      superseded_by_cycle_id = null,
      superseded_at = now(),
      superseded_by = null,
      superseded_previous_status = cycle.status,
      superseded_reason = 'extra_empty_cycle_quarantined_after_plan_duration_audit'
    where cycle.id in (select cycle_id from audited)
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
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
    returning cycle.id
  )
  select
    (select count(*) from audited),
    (select count(*) from updated)
  into v_expected, v_applied;

  if v_expected <> v_applied then
    raise exception 'extra_empty_training_cycles_repair_count_mismatch expected=% applied=%', v_expected, v_applied;
  end if;
end
$repair$;
