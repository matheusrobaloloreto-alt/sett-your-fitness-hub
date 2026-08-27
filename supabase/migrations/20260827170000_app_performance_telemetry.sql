-- Privacy-preserving real-user performance samples for the two highest-value
-- application surfaces. The browser can append only through a validated RPC;
-- raw rows stay private and staff can retrieve aggregates only for their tenant.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_performance_samples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_group text not null check (route_group in ('student_workout', 'trainer_whatsapp')),
  metric text not null check (metric in ('shell_ready', 'content_ready')),
  duration_ms integer not null check (duration_ms between 0 and 120000),
  navigation_type text not null check (navigation_type in ('navigate', 'reload', 'back_forward', 'prerender', 'unknown')),
  effective_type text not null check (effective_type in ('slow-2g', '2g', '3g', '4g', 'unknown')),
  viewport_bucket text not null check (viewport_bucket in ('xs', 'sm', 'md', 'lg', 'xl', 'unknown')),
  actor_bucket text not null,
  created_at timestamptz not null default now()
);

create index if not exists app_performance_samples_company_route_created_idx
  on public.app_performance_samples (company_id, route_group, metric, created_at desc);
create index if not exists app_performance_samples_actor_created_idx
  on public.app_performance_samples (actor_bucket, created_at desc);

alter table public.app_performance_samples enable row level security;
revoke all on public.app_performance_samples from public, anon, authenticated;
grant all on public.app_performance_samples to service_role;

create or replace function public.record_app_performance_sample(
  p_route_group text,
  p_metric text,
  p_duration_ms integer,
  p_navigation_type text default 'unknown',
  p_effective_type text default 'unknown',
  p_viewport_bucket text default 'unknown',
  p_company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_company_id uuid;
  v_actor_bucket text;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'company context required' using errcode = '22023';
  end if;

  -- The browser supplies the company currently visible in the authenticated
  -- UI, but the server accepts it only after verifying the actor against that
  -- exact tenant. This keeps multi-company staff samples correctly attributed.
  if p_route_group = 'trainer_whatsapp' then
    if not public.is_company_staff(v_actor, p_company_id) then
      raise exception 'staff access required' using errcode = '42501';
    end if;
    v_company_id := p_company_id;
  elsif p_route_group = 'student_workout' then
    if public.is_company_staff(v_actor, p_company_id) or exists (
      select 1
        from public.students s
       where s.user_id = v_actor
         and s.company_id = p_company_id
    ) then
      v_company_id := p_company_id;
    else
      raise exception 'student or staff access required' using errcode = '42501';
    end if;
  else
    raise exception 'invalid performance route' using errcode = '22023';
  end if;

  if v_company_id is null then
    raise exception 'company not found' using errcode = '42501';
  end if;

  if p_metric not in ('shell_ready', 'content_ready')
     or p_duration_ms is null or p_duration_ms not between 0 and 120000
     or coalesce(p_navigation_type, 'unknown') not in ('navigate', 'reload', 'back_forward', 'prerender', 'unknown')
     or coalesce(p_effective_type, 'unknown') not in ('slow-2g', '2g', '3g', '4g', 'unknown')
     or coalesce(p_viewport_bucket, 'unknown') not in ('xs', 'sm', 'md', 'lg', 'xl', 'unknown') then
    raise exception 'invalid performance sample' using errcode = '22023';
  end if;

  v_actor_bucket := encode(
    extensions.digest(v_actor::text || ':' || current_date::text, 'sha256'),
    'hex'
  );

  -- Telemetry is best-effort. Silently discard excess events instead of ever
  -- delaying or breaking the product surface being measured.
  if (
    select count(*)
      from public.app_performance_samples aps
     where aps.actor_bucket = v_actor_bucket
       and aps.created_at >= now() - interval '1 minute'
  ) >= 20 then
    return;
  end if;

  insert into public.app_performance_samples (
    company_id,
    route_group,
    metric,
    duration_ms,
    navigation_type,
    effective_type,
    viewport_bucket,
    actor_bucket
  ) values (
    v_company_id,
    p_route_group,
    p_metric,
    p_duration_ms,
    coalesce(p_navigation_type, 'unknown'),
    coalesce(p_effective_type, 'unknown'),
    coalesce(p_viewport_bucket, 'unknown'),
    v_actor_bucket
  );
end;
$$;

revoke all on function public.record_app_performance_sample(text, text, integer, text, text, text, uuid) from public;
grant execute on function public.record_app_performance_sample(text, text, integer, text, text, text, uuid) to authenticated, service_role;

create or replace function public.get_app_performance_percentiles(
  p_days integer default 7,
  p_company_id uuid default null
)
returns table (
  route_group text,
  metric text,
  samples bigint,
  p50_ms integer,
  p75_ms integer,
  p95_ms integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_company_id uuid;
  v_days integer := greatest(1, least(coalesce(p_days, 7), 30));
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_company_id is null or not public.is_company_staff(v_actor, p_company_id) then
    raise exception 'staff access required' using errcode = '42501';
  end if;
  v_company_id := p_company_id;

  return query
  select
    aps.route_group,
    aps.metric,
    count(*)::bigint,
    round(percentile_cont(0.50) within group (order by aps.duration_ms))::integer,
    round(percentile_cont(0.75) within group (order by aps.duration_ms))::integer,
    round(percentile_cont(0.95) within group (order by aps.duration_ms))::integer
  from public.app_performance_samples aps
  where aps.company_id = v_company_id
    and aps.created_at >= now() - make_interval(days => v_days)
  group by aps.route_group, aps.metric
  order by aps.route_group, aps.metric;
end;
$$;

revoke all on function public.get_app_performance_percentiles(integer, uuid) from public;
grant execute on function public.get_app_performance_percentiles(integer, uuid) to authenticated, service_role;
