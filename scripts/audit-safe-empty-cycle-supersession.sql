-- Read-only dry-run for cycles that can be removed from active scheduling
-- without deleting any row or moving any workout/history.

with visible_cycles as (
  select cycle.*
  from public.training_cycles cycle
  where cycle.status is distinct from 'superseded'
    and cycle.superseded_by_cycle_id is null
),
cycle_usage as (
  select
    cycle.id,
    exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id) as has_workouts,
    (
      exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
      or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
      or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
      or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
      or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
      or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
    ) as has_other_history,
    (
      cycle.prescribed_offline_at is not null
      or cycle.prescribed_offline_by is not null
      or nullif(btrim(coalesce(cycle.prescribed_offline_note, '')), '') is not null
      or cycle.anamnese_id is not null
      or cycle.bundle_id is not null
      or nullif(btrim(coalesce(cycle.objective, '')), '') is not null
      or nullif(btrim(coalesce(cycle.notes, '')), '') is not null
      or case
        when jsonb_typeof(coalesce(cycle.workouts, '[]'::jsonb)) = 'array'
          then jsonb_array_length(coalesce(cycle.workouts, '[]'::jsonb)) > 0
        else coalesce(cycle.workouts, 'null'::jsonb) <> 'null'::jsonb
      end
      or lower(coalesce(cycle.delivery_status, '')) in ('sent', 'viewed', 'delivered', 'published')
    ) as has_cycle_signal
  from visible_cycles cycle
),
safe_redundant as (
  select
    redundant.id as redundant_cycle_id,
    redundant.enrollment_id,
    redundant.cycle_number as redundant_cycle_number,
    redundant.start_date as redundant_start,
    redundant.end_date as redundant_end,
    redundant.status as redundant_status,
    redundant.created_at as redundant_created_at
  from visible_cycles redundant
  join cycle_usage redundant_usage on redundant_usage.id = redundant.id
  where not redundant_usage.has_workouts
    and not redundant_usage.has_other_history
    and not redundant_usage.has_cycle_signal
    -- Every calendar day is already represented by a higher-priority cycle.
    -- A materialized cycle always wins; otherwise the oldest empty placeholder
    -- wins. This prevents two empty duplicates from superseding each other.
    and not exists (
      select 1
      from generate_series(redundant.start_date, redundant.end_date, interval '1 day') day
      where not exists (
        select 1
        from visible_cycles canonical
        join cycle_usage canonical_usage on canonical_usage.id = canonical.id
        where canonical.enrollment_id = redundant.enrollment_id
          and canonical.id <> redundant.id
          and day::date between canonical.start_date and canonical.end_date
          and (
            canonical_usage.has_workouts
            or canonical_usage.has_other_history
            or canonical.created_at < redundant.created_at
            or (canonical.created_at = redundant.created_at and canonical.id < redundant.id)
          )
      )
    )
)
select
  'safe_empty_overlap' as result_type,
  substr(md5(pair.enrollment_id::text), 1, 12) as enrollment_ref,
  count(*)::integer as redundant_cycle_count,
  min(pair.redundant_start) as first_redundant_start,
  max(pair.redundant_end) as last_redundant_end,
  min(pair.redundant_created_at)::date as first_created_date,
  max(pair.redundant_created_at)::date as last_created_date,
  count(*) filter (where pair.redundant_status = 'active')::integer as active_redundant_cycles,
  count(*) filter (
    where pair.redundant_created_at::date = date '2026-08-31'
  )::integer as created_on_aug_31
from safe_redundant pair
group by pair.enrollment_id
order by redundant_cycle_count desc, enrollment_ref;
