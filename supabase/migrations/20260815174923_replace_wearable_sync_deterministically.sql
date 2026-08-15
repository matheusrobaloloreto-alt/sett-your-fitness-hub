-- Recreate the complete RPC instead of carrying forward any remote function
-- definition. This makes the migration deterministic even if a staging target
-- has body drift, and refuses to coexist with an unreviewed overload.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'commit_wearable_sync'
      and p.oid <> 'public.commit_wearable_sync(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamptz)'::regprocedure
  ) then
    raise exception 'unexpected commit_wearable_sync overload; refusing deterministic replacement';
  end if;
end;
$$;

create or replace function public.commit_wearable_sync(
  p_device_id uuid,
  p_student_id uuid,
  p_actor_user_id uuid,
  p_expected_company_id uuid,
  p_holder uuid,
  p_metrics jsonb,
  p_workouts jsonb,
  p_watermarks jsonb,
  p_completed_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.wearable_devices%rowtype;
  v_lease public.wearable_leases%rowtype;
  v_student_company_id uuid;
  v_student_user_id uuid;
  v_student_status text;
  v_imported integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_device_id::text, 0));
  select * into v_lease
  from public.wearable_leases
  where device_id = p_device_id and purpose = 'sync'
  for update;
  perform 1
  from public.wearable_devices d
  join public.students s on s.id = d.student_id
  where d.id = p_device_id and d.student_id = p_student_id
  for update of d, s;
  select d.* into v_device
  from public.wearable_devices d
  where d.id = p_device_id and d.student_id = p_student_id
  for update;
  select s.company_id, s.user_id, s.status
    into v_student_company_id, v_student_user_id, v_student_status
  from public.students s
  where s.id = v_device.student_id
  for update;
  if v_lease.device_id is null
     or v_lease.purpose is distinct from 'sync'
     or v_lease.holder is distinct from p_holder
     or v_lease.locked_until <= clock_timestamp() then
    raise exception 'sync_lease_lost';
  end if;
  if v_device.id is null
     or not v_device.is_active
     or v_device.connection_status <> 'syncing' then
    raise exception 'sync_device_not_active';
  end if;
  if v_student_user_id is distinct from p_actor_user_id
     or coalesce(v_student_status, '') <> 'active'
     or v_student_company_id is distinct from p_expected_company_id
     or v_device.company_id is distinct from v_student_company_id then
    raise exception 'sync_tenant_changed';
  end if;

  insert into public.wearable_data (
    student_id, company_id, device_id, date, recorded_at,
    timezone_offset_minutes, metric, value, unit, score_state, source,
    external_id, metadata, updated_at
  )
  select v_device.student_id, v_student_company_id, v_device.id,
    r.date::date, nullif(r.recorded_at, '')::timestamptz,
    r.timezone_offset_minutes, r.metric, r.value, r.unit, r.score_state,
    r.source, r.external_id, coalesce(r.metadata, '{}'::jsonb), now()
  from jsonb_to_recordset(coalesce(p_metrics, '[]'::jsonb)) as r(
    date text, recorded_at text, timezone_offset_minutes integer, metric text,
    value numeric, unit text, score_state text, source text,
    external_id text, metadata jsonb
  )
  on conflict (device_id, date, metric) do update set
    student_id = excluded.student_id,
    company_id = excluded.company_id,
    recorded_at = excluded.recorded_at,
    timezone_offset_minutes = excluded.timezone_offset_minutes,
    value = excluded.value, unit = excluded.unit,
    score_state = excluded.score_state, source = excluded.source,
    external_id = excluded.external_id, metadata = excluded.metadata,
    updated_at = now();
  v_imported := v_imported + jsonb_array_length(coalesce(p_metrics, '[]'::jsonb));

  insert into public.wearable_workouts (
    student_id, company_id, device_id, started_at, ended_at, local_date,
    timezone_offset_minutes, activity_type, duration_min, distance_km,
    calories, avg_heart_rate, max_heart_rate, elevation_gain_m, avg_pace,
    strain, source, external_id, metadata, updated_at
  )
  select v_device.student_id, v_student_company_id, v_device.id,
    r.started_at::timestamptz, nullif(r.ended_at, '')::timestamptz,
    r.local_date::date, r.timezone_offset_minutes, r.activity_type,
    r.duration_min, r.distance_km, r.calories, r.avg_heart_rate,
    r.max_heart_rate, r.elevation_gain_m, r.avg_pace, r.strain,
    r.source, r.external_id, coalesce(r.metadata, '{}'::jsonb), now()
  from jsonb_to_recordset(coalesce(p_workouts, '[]'::jsonb)) as r(
    started_at text, ended_at text, local_date text,
    timezone_offset_minutes integer, activity_type text, duration_min integer,
    distance_km numeric, calories numeric, avg_heart_rate numeric,
    max_heart_rate numeric, elevation_gain_m numeric, avg_pace text,
    strain numeric, source text, external_id text, metadata jsonb
  )
  on conflict (device_id, external_id) do update set
    student_id = excluded.student_id, company_id = excluded.company_id,
    started_at = excluded.started_at, ended_at = excluded.ended_at,
    local_date = excluded.local_date,
    timezone_offset_minutes = excluded.timezone_offset_minutes,
    activity_type = excluded.activity_type, duration_min = excluded.duration_min,
    distance_km = excluded.distance_km, calories = excluded.calories,
    avg_heart_rate = excluded.avg_heart_rate,
    max_heart_rate = excluded.max_heart_rate,
    elevation_gain_m = excluded.elevation_gain_m,
    avg_pace = excluded.avg_pace, strain = excluded.strain,
    source = excluded.source, metadata = excluded.metadata, updated_at = now();
  v_imported := v_imported + jsonb_array_length(coalesce(p_workouts, '[]'::jsonb));

  insert into public.wearable_sync_cursors (
    device_id, resource, watermark, last_success_at, updated_at
  )
  select v_device.id, item.key,
    nullif(item.value, '')::timestamptz, p_completed_at, now()
  from jsonb_each_text(coalesce(p_watermarks, '{}'::jsonb)) item
  on conflict (device_id, resource) do update set
    watermark = excluded.watermark, last_success_at = excluded.last_success_at,
    updated_at = now();

  update public.wearable_devices
  set connection_status = 'connected', last_sync_at = p_completed_at,
      last_sync_status = 'success', last_error = null,
      last_error_code = null, updated_at = now()
  where id = v_device.id;
  return v_imported;
end;
$$;

revoke all on function public.commit_wearable_sync(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.commit_wearable_sync(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz
) to service_role;
