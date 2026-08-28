-- Aggregate-only readiness gate for SETT/BN real-user performance telemetry.
-- It intentionally exposes no company id, actor bucket, student, staff member,
-- URL or content. A p75 becomes publishable only after every product segment
-- has enough samples, actor-days, active dates and viewport diversity.

with expected(route_group, metric) as (
  values
    ('student_workout'::text, 'shell_ready'::text),
    ('student_workout'::text, 'content_ready'::text),
    ('trainer_whatsapp'::text, 'content_ready'::text)
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
    sample.route_group,
    sample.metric,
    count(*)::integer as samples,
    count(distinct sample.actor_bucket)::integer as actor_days,
    count(distinct sample.created_at::date)::integer as active_dates,
    count(distinct sample.viewport_bucket) filter (
      where sample.viewport_bucket <> 'unknown'
    )::integer as viewport_buckets,
    count(distinct sample.effective_type) filter (
      where sample.effective_type <> 'unknown'
    )::integer as reported_network_types,
    round(100.0 * count(*) filter (
      where sample.effective_type = 'unknown'
    ) / nullif(count(*), 0), 1) as unknown_network_pct,
    round(percentile_cont(0.50) within group (order by sample.duration_ms))::integer as p50_ms,
    round(percentile_cont(0.75) within group (order by sample.duration_ms))::integer as p75_ms,
    round(percentile_cont(0.95) within group (order by sample.duration_ms))::integer as p95_ms
  from scoped sample
  group by sample.route_group, sample.metric
), readiness as (
  select
    expected.route_group,
    expected.metric,
    coalesce(aggregate.samples, 0) as samples,
    coalesce(aggregate.actor_days, 0) as actor_days,
    coalesce(aggregate.active_dates, 0) as active_dates,
    coalesce(aggregate.viewport_buckets, 0) as viewport_buckets,
    coalesce(aggregate.reported_network_types, 0) as reported_network_types,
    coalesce(aggregate.unknown_network_pct, 0) as unknown_network_pct,
    aggregate.p50_ms,
    aggregate.p75_ms,
    aggregate.p95_ms,
    coalesce(aggregate.samples, 0) >= 30
      and coalesce(aggregate.actor_days, 0) >= 10
      and coalesce(aggregate.active_dates, 0) >= 3
      and coalesce(aggregate.viewport_buckets, 0) >= 2 as segment_ready
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
  viewport_buckets,
  reported_network_types,
  unknown_network_pct,
  p50_ms,
  p75_ms,
  p95_ms,
  segment_ready,
  bool_and(segment_ready) over () as all_segments_ready
from readiness
order by route_group, metric;
