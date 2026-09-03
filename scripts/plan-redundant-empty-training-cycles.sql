-- Read-only, PII-free manifest for empty cycles whose full calendar range is
-- already covered by higher-priority visible cycles in the same enrollment.

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
  select redundant.*
  from visible_cycles redundant
  join cycle_usage redundant_usage on redundant_usage.id = redundant.id
  where not redundant_usage.has_workouts
    and redundant.status <> 'active'
    and redundant.start_date <= redundant.end_date
    and not redundant_usage.has_other_history
    and not redundant_usage.has_cycle_signal
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
),
manifest as (
  select
    safe.id,
    safe.enrollment_id,
    safe.start_date,
    safe.end_date,
    safe.status,
    safe.created_at,
    encode(extensions.digest((to_jsonb(safe) - array[
      'superseded_by_cycle_id', 'superseded_at', 'superseded_by',
      'superseded_previous_status', 'superseded_reason', 'updated_at'
    ])::text, 'sha256'), 'hex') as before_sha256,
    array(
      select distinct canonical.id
      from visible_cycles canonical
      join cycle_usage canonical_usage on canonical_usage.id = canonical.id
      where canonical.enrollment_id = safe.enrollment_id
        and canonical.id <> safe.id
        and canonical.start_date <= safe.end_date
        and canonical.end_date >= safe.start_date
        and (
          canonical_usage.has_workouts
          or canonical_usage.has_other_history
          or canonical.created_at < safe.created_at
          or (canonical.created_at = safe.created_at and canonical.id < safe.id)
        )
      order by canonical.id
    ) as covering_cycle_ids
  from safe_redundant safe
  where cardinality(array(
    select distinct canonical.id
    from visible_cycles canonical
    join cycle_usage canonical_usage on canonical_usage.id = canonical.id
    where canonical.enrollment_id = safe.enrollment_id
      and canonical.id <> safe.id
      and canonical.start_date <= safe.end_date
      and canonical.end_date >= safe.start_date
      and (
        canonical_usage.has_workouts
        or canonical_usage.has_other_history
        or canonical.created_at < safe.created_at
        or (canonical.created_at = safe.created_at and canonical.id < safe.id)
      )
  )) > 0
)
select
  count(*)::integer as candidate_count,
  count(distinct enrollment_id)::integer as enrollment_count,
  count(*) filter (where status = 'active')::integer as active_count,
  encode(extensions.digest(string_agg(
    concat_ws('|', id::text, enrollment_id::text, start_date::text, end_date::text,
      status, created_at::text, before_sha256, array_to_string(covering_cycle_ids, ',')),
    E'\n' order by id
  ), 'sha256'), 'hex') as manifest_sha256
from manifest;
