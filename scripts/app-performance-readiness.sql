-- Aggregate-only readiness gate for SETT/BN real-user performance telemetry.
-- It intentionally exposes no company id, actor bucket, student, staff member,
-- URL or content. A p75 becomes publishable only after every product segment
-- has enough real samples, actor-days and dates on its intended product surfaces.
-- Student workouts are mobile-first. Trainer WhatsApp supports both compact and
-- wide layouts, so its gate requires evidence from both surface families.
-- This avoids manufacturing traffic in adjacent breakpoints merely to satisfy
-- a raw bucket counter while still failing closed on the supported layouts.

with expected(route_group, metric, expected_viewports, require_compact, require_wide) as (
  values
    ('student_workout'::text, 'shell_ready'::text, array['xs', 'sm']::text[], true, false),
    ('student_workout'::text, 'content_ready'::text, array['xs', 'sm']::text[], true, false),
    ('trainer_whatsapp'::text, 'content_ready'::text, array['xs', 'sm', 'lg', 'xl']::text[], true, true)
), scoped as (
  select sample.*
  from public.app_performance_samples sample
  where sample.company_id = (
    select company.id
    from public.companies company
    where company.slug = 'bn-performance-training'
    limit 1
  )
    and sample.created_at >= now() - interval '30 days'
), aggregated as (
  select
    expected.route_group,
    expected.metric,
    count(*) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    )::integer as samples,
    count(distinct sample.actor_bucket) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    )::integer as actor_days,
    count(distinct sample.created_at::date) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    )::integer as active_dates,
    count(distinct sample.viewport_bucket) filter (
      where sample.viewport_bucket <> 'unknown'
    )::integer as observed_viewport_buckets,
    count(distinct sample.viewport_bucket) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    )::integer as expected_viewport_buckets,
    count(distinct case
      when sample.viewport_bucket in ('xs', 'sm') then 'compact'
      when sample.viewport_bucket in ('lg', 'xl') then 'wide'
    end) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    )::integer as surface_groups,
    count(*) filter (
      where sample.viewport_bucket in ('xs', 'sm')
    )::integer as compact_samples,
    count(distinct sample.actor_bucket) filter (
      where sample.viewport_bucket in ('xs', 'sm')
    )::integer as compact_actor_days,
    count(distinct sample.created_at::date) filter (
      where sample.viewport_bucket in ('xs', 'sm')
    )::integer as compact_active_dates,
    count(*) filter (
      where sample.viewport_bucket in ('lg', 'xl')
    )::integer as wide_samples,
    count(distinct sample.actor_bucket) filter (
      where sample.viewport_bucket in ('lg', 'xl')
    )::integer as wide_actor_days,
    count(distinct sample.created_at::date) filter (
      where sample.viewport_bucket in ('lg', 'xl')
    )::integer as wide_active_dates,
    round(100.0 * count(*) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    ) / nullif(count(*), 0), 1) as expected_viewport_pct,
    count(distinct sample.effective_type) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
        and sample.effective_type <> 'unknown'
    )::integer as reported_network_types,
    round(100.0 * count(*) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
        and sample.effective_type = 'unknown'
    ) / nullif(count(*) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    ), 0), 1) as unknown_network_pct,
    round(percentile_cont(0.50) within group (order by sample.duration_ms) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    ))::integer as p50_ms,
    round(percentile_cont(0.75) within group (order by sample.duration_ms) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    ))::integer as p75_ms,
    round(percentile_cont(0.95) within group (order by sample.duration_ms) filter (
      where sample.viewport_bucket = any(expected.expected_viewports)
    ))::integer as p95_ms
  from expected
  left join scoped sample
    on sample.route_group = expected.route_group
   and sample.metric = expected.metric
  group by expected.route_group, expected.metric, expected.expected_viewports
), readiness as (
  select
    expected.route_group,
    expected.metric,
    coalesce(aggregate.samples, 0) as samples,
    coalesce(aggregate.actor_days, 0) as actor_days,
    coalesce(aggregate.active_dates, 0) as active_dates,
    coalesce(aggregate.observed_viewport_buckets, 0) as observed_viewport_buckets,
    coalesce(aggregate.expected_viewport_buckets, 0) as expected_viewport_buckets,
    coalesce(aggregate.surface_groups, 0) as surface_groups,
    coalesce(aggregate.compact_samples, 0) as compact_samples,
    coalesce(aggregate.compact_actor_days, 0) as compact_actor_days,
    coalesce(aggregate.compact_active_dates, 0) as compact_active_dates,
    coalesce(aggregate.wide_samples, 0) as wide_samples,
    coalesce(aggregate.wide_actor_days, 0) as wide_actor_days,
    coalesce(aggregate.wide_active_dates, 0) as wide_active_dates,
    coalesce(aggregate.expected_viewport_pct, 0) as expected_viewport_pct,
    coalesce(aggregate.reported_network_types, 0) as reported_network_types,
    coalesce(aggregate.unknown_network_pct, 0) as unknown_network_pct,
    aggregate.p50_ms,
    aggregate.p75_ms,
    aggregate.p95_ms,
    coalesce(aggregate.samples, 0) >= 30
      and coalesce(aggregate.actor_days, 0) >= 10
      and coalesce(aggregate.active_dates, 0) >= 3
      and (
        not expected.require_compact
        or (
          coalesce(aggregate.compact_samples, 0) >= 10
          and coalesce(aggregate.compact_actor_days, 0) >= 3
          and coalesce(aggregate.compact_active_dates, 0) >= 2
        )
      )
      and (
        not expected.require_wide
        or (
          coalesce(aggregate.wide_samples, 0) >= 10
          and coalesce(aggregate.wide_actor_days, 0) >= 3
          and coalesce(aggregate.wide_active_dates, 0) >= 2
        )
      ) as segment_ready
  from expected
  left join aggregated aggregate
    on aggregate.route_group = expected.route_group
   and aggregate.metric = expected.metric
)
select
  route_group,
  metric,
  samples,
  actor_days,
  active_dates,
  observed_viewport_buckets,
  expected_viewport_buckets,
  surface_groups,
  compact_samples,
  compact_actor_days,
  compact_active_dates,
  wide_samples,
  wide_actor_days,
  wide_active_dates,
  expected_viewport_pct,
  reported_network_types,
  unknown_network_pct,
  p50_ms,
  p75_ms,
  p95_ms,
  segment_ready,
  bool_and(segment_ready) over () as all_segments_ready
from readiness
order by route_group, metric;
