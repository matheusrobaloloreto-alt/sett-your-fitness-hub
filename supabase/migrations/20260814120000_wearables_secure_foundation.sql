-- Secure and reproducible foundation for student wearable integrations.
-- Legacy plaintext token columns, if present in an already-running database, are
-- quarantined by column-level grants and never read by the new edge. Their removal
-- is a separate operator-gated step after reauthorization because this migration
-- cannot safely access the server-side KEK.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.wearable_devices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('oura', 'strava', 'polar', 'whoop')),
  device_name text,
  external_user_id text,
  is_active boolean not null default true,
  connection_status text not null default 'connected'
    check (connection_status in ('connected', 'syncing', 'stale', 'error', 'revoked', 'config_required', 'partial_scope')),
  granted_scopes text[] not null default '{}',
  required_scopes text[] not null default '{}',
  last_sync_at timestamptz,
  last_sync_status text,
  last_error_code text,
  last_error text,
  revocation_status text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, provider)
);

alter table public.wearable_devices add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.wearable_devices add column if not exists connection_status text not null default 'connected';
alter table public.wearable_devices add column if not exists granted_scopes text[] not null default '{}';
alter table public.wearable_devices add column if not exists required_scopes text[] not null default '{}';
alter table public.wearable_devices add column if not exists last_error_code text;
alter table public.wearable_devices add column if not exists revocation_status text;
alter table public.wearable_devices add column if not exists revoked_at timestamptz;
update public.wearable_devices d
set company_id = s.company_id
from public.students s
where d.student_id = s.id and d.company_id is null;
alter table public.wearable_devices alter column company_id set not null;

create unique index if not exists wearable_devices_student_provider_uidx
  on public.wearable_devices (student_id, provider);
create index if not exists wearable_devices_company_idx
  on public.wearable_devices (company_id, is_active);

create table if not exists public.wearable_credentials (
  device_id uuid primary key references public.wearable_devices(id) on delete cascade,
  key_id text not null,
  access_token_ciphertext text not null,
  access_token_iv text not null,
  refresh_token_ciphertext text,
  refresh_token_iv text,
  token_expires_at timestamptz,
  token_type text,
  version bigint not null default 1 check (version > 0),
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wearable_consents (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.wearable_devices(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  event_type text not null check (event_type in ('granted', 'scope_changed', 'revoked', 'data_deleted')),
  scopes text[] not null default '{}',
  privacy_version text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists wearable_consents_student_idx
  on public.wearable_consents (student_id, occurred_at desc);

create table if not exists public.wearable_sync_cursors (
  device_id uuid not null references public.wearable_devices(id) on delete cascade,
  resource text not null,
  cursor text,
  watermark timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (device_id, resource)
);

create table if not exists public.wearable_leases (
  device_id uuid not null references public.wearable_devices(id) on delete cascade,
  purpose text not null check (purpose in ('sync', 'refresh')),
  holder uuid not null,
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (device_id, purpose)
);

create table if not exists public.wearable_events (
  provider text not null,
  event_id text not null,
  device_id uuid references public.wearable_devices(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload_hash text not null,
  primary key (provider, event_id)
);

create table if not exists public.wearable_data (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  device_id uuid not null references public.wearable_devices(id) on delete cascade,
  date date not null,
  recorded_at timestamptz,
  timezone_offset_minutes integer,
  metric text not null,
  value numeric,
  unit text,
  score_state text,
  source text not null,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wearable_data add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.wearable_data add column if not exists recorded_at timestamptz;
alter table public.wearable_data add column if not exists timezone_offset_minutes integer;
alter table public.wearable_data add column if not exists score_state text;
alter table public.wearable_data add column if not exists external_id text;
alter table public.wearable_data add column if not exists updated_at timestamptz not null default now();
alter table public.wearable_data alter column value drop not null;
update public.wearable_data w
set company_id = s.company_id
from public.students s
where w.student_id = s.id and w.company_id is null;
alter table public.wearable_data alter column company_id set not null;

create unique index if not exists wearable_data_daily_uidx
  on public.wearable_data (device_id, date, metric);
create unique index if not exists wearable_data_external_uidx
  on public.wearable_data (device_id, metric, external_id)
  where external_id is not null;
create index if not exists wearable_data_student_date_idx
  on public.wearable_data (student_id, date desc);

create table if not exists public.wearable_workouts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  device_id uuid not null references public.wearable_devices(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  local_date date not null,
  timezone_offset_minutes integer,
  activity_type text,
  duration_min integer,
  distance_km numeric,
  calories numeric,
  avg_heart_rate numeric,
  max_heart_rate numeric,
  elevation_gain_m numeric,
  avg_pace text,
  strain numeric,
  source text not null,
  external_id text not null,
  linked_workout_session_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, external_id)
);

alter table public.wearable_workouts add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.wearable_workouts add column if not exists local_date date;
alter table public.wearable_workouts add column if not exists timezone_offset_minutes integer;
alter table public.wearable_workouts add column if not exists strain numeric;
alter table public.wearable_workouts add column if not exists updated_at timestamptz not null default now();
update public.wearable_workouts w
set company_id = s.company_id,
    local_date = coalesce(w.local_date, (w.started_at at time zone 'UTC')::date)
from public.students s
where w.student_id = s.id and (w.company_id is null or w.local_date is null);
alter table public.wearable_workouts alter column company_id set not null;
alter table public.wearable_workouts alter column local_date set not null;

create unique index if not exists wearable_workouts_device_external_uidx
  on public.wearable_workouts (device_id, external_id);
create index if not exists wearable_workouts_student_started_idx
  on public.wearable_workouts (student_id, started_at desc);

alter table public.wearable_oauth_states add column if not exists actor_user_id uuid references auth.users(id) on delete cascade;
alter table public.wearable_oauth_states add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.wearable_oauth_states add column if not exists requested_scopes text[] not null default '{}';

-- Never trust denormalized tenant identifiers supplied by service code. The
-- authoritative relationship is student -> company and device -> student/company.
create or replace function public.enforce_wearable_tenant_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_student_id uuid;
  expected_company_id uuid;
  expected_provider text;
  expected_user_id uuid;
begin
  if tg_table_name in ('wearable_devices', 'wearable_oauth_states') then
    select s.company_id, s.user_id into expected_company_id, expected_user_id
    from public.students s where s.id = new.student_id;
    if expected_company_id is null then raise exception 'wearable_student_company_missing'; end if;
    if new.company_id is not null and new.company_id <> expected_company_id then
      raise exception 'wearable_company_mismatch';
    end if;
    new.company_id := expected_company_id;
    if tg_table_name = 'wearable_oauth_states' then
      if expected_user_id is null or new.actor_user_id is null or new.actor_user_id <> expected_user_id then
        raise exception 'wearable_actor_mismatch';
      end if;
    end if;
    return new;
  end if;

  select d.student_id, d.company_id, d.provider
    into expected_student_id, expected_company_id, expected_provider
  from public.wearable_devices d where d.id = new.device_id;
  if expected_student_id is null then raise exception 'wearable_device_missing'; end if;
  if new.student_id is not null and new.student_id <> expected_student_id then
    raise exception 'wearable_student_mismatch';
  end if;
  if new.company_id is not null and new.company_id <> expected_company_id then
    raise exception 'wearable_company_mismatch';
  end if;
  new.student_id := expected_student_id;
  new.company_id := expected_company_id;
  if tg_table_name = 'wearable_consents' then
    if new.provider is not null and new.provider <> expected_provider then
      raise exception 'wearable_provider_mismatch';
    end if;
    new.provider := expected_provider;
  end if;
  return new;
end;
$$;

drop trigger if exists wearable_devices_tenant_integrity on public.wearable_devices;
create trigger wearable_devices_tenant_integrity before insert or update of student_id, company_id
on public.wearable_devices for each row execute function public.enforce_wearable_tenant_integrity();
drop trigger if exists wearable_oauth_states_tenant_integrity on public.wearable_oauth_states;
create trigger wearable_oauth_states_tenant_integrity before insert or update of student_id, company_id, actor_user_id
on public.wearable_oauth_states for each row execute function public.enforce_wearable_tenant_integrity();
drop trigger if exists wearable_data_tenant_integrity on public.wearable_data;
create trigger wearable_data_tenant_integrity before insert or update of device_id, student_id, company_id
on public.wearable_data for each row execute function public.enforce_wearable_tenant_integrity();
drop trigger if exists wearable_workouts_tenant_integrity on public.wearable_workouts;
create trigger wearable_workouts_tenant_integrity before insert or update of device_id, student_id, company_id
on public.wearable_workouts for each row execute function public.enforce_wearable_tenant_integrity();
drop trigger if exists wearable_consents_tenant_integrity on public.wearable_consents;
create trigger wearable_consents_tenant_integrity before insert or update of device_id, student_id, company_id, provider
on public.wearable_consents for each row execute function public.enforce_wearable_tenant_integrity();

alter table public.wearable_devices enable row level security;
alter table public.wearable_credentials enable row level security;
alter table public.wearable_consents enable row level security;
alter table public.wearable_sync_cursors enable row level security;
alter table public.wearable_leases enable row level security;
alter table public.wearable_events enable row level security;
alter table public.wearable_data enable row level security;
alter table public.wearable_workouts enable row level security;

revoke all on public.wearable_credentials from public, anon, authenticated;
revoke all on public.wearable_sync_cursors from public, anon, authenticated;
revoke all on public.wearable_leases from public, anon, authenticated;
revoke all on public.wearable_events from public, anon, authenticated;
grant all on public.wearable_credentials, public.wearable_sync_cursors, public.wearable_leases, public.wearable_events to service_role;

revoke all on public.wearable_devices, public.wearable_consents, public.wearable_data, public.wearable_workouts from anon, authenticated;
-- Column grant deliberately excludes any legacy plaintext token columns that may
-- still exist in a live database pending operator-gated reauthorization.
grant select (id, student_id, company_id, provider, device_name, external_user_id, is_active,
  connection_status, granted_scopes, required_scopes, last_sync_at, last_sync_status,
  last_error_code, last_error, revocation_status, revoked_at, created_at, updated_at)
on public.wearable_devices to authenticated;
grant select on public.wearable_consents, public.wearable_data, public.wearable_workouts to authenticated;
grant all on public.wearable_devices, public.wearable_consents, public.wearable_data, public.wearable_workouts to service_role;

drop policy if exists "wearable devices tenant read" on public.wearable_devices;
create policy "wearable devices tenant read" on public.wearable_devices
for select to authenticated using (
  exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
  or public.is_company_staff(auth.uid(), company_id)
  or public.has_role(auth.uid(), 'master')
);

drop policy if exists "wearable consents tenant read" on public.wearable_consents;
create policy "wearable consents tenant read" on public.wearable_consents
for select to authenticated using (
  exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
  or public.is_company_staff(auth.uid(), company_id)
  or public.has_role(auth.uid(), 'master')
);

drop policy if exists "wearable data tenant read" on public.wearable_data;
create policy "wearable data tenant read" on public.wearable_data
for select to authenticated using (
  exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
  or public.is_company_staff(auth.uid(), company_id)
  or public.has_role(auth.uid(), 'master')
);

drop policy if exists "wearable workouts tenant read" on public.wearable_workouts;
create policy "wearable workouts tenant read" on public.wearable_workouts
for select to authenticated using (
  exists (select 1 from public.students s where s.id = student_id and s.user_id = auth.uid())
  or public.is_company_staff(auth.uid(), company_id)
  or public.has_role(auth.uid(), 'master')
);

-- Consume exactly once. The DELETE makes expiry and replay handling atomic.
create or replace function public.consume_wearable_oauth_state(p_state text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with consumed as (
    delete from public.wearable_oauth_states
    where state = p_state and consumed_at is null and expires_at > now()
    returning student_id, actor_user_id, company_id, provider, requested_scopes, return_url, created_at
  )
  select to_jsonb(consumed) from consumed;
$$;

revoke all on function public.consume_wearable_oauth_state(text) from public, anon, authenticated;
grant execute on function public.consume_wearable_oauth_state(text) to service_role;

-- One atomic lease is shared by refresh and sync. Expired leases can be reclaimed.
create or replace function public.acquire_wearable_lease(
  p_device_id uuid,
  p_purpose text,
  p_holder uuid,
  p_ttl_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer := 0;
begin
  if p_purpose not in ('sync', 'refresh') or p_ttl_seconds < 5 or p_ttl_seconds > 300 then
    return false;
  end if;
  insert into public.wearable_leases(device_id, purpose, holder, locked_until)
  values (p_device_id, p_purpose, p_holder, now() + make_interval(secs => p_ttl_seconds))
  on conflict (device_id, purpose) do update
    set holder = excluded.holder, locked_until = excluded.locked_until, created_at = now()
    where public.wearable_leases.locked_until <= now()
       or public.wearable_leases.holder = excluded.holder;
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.acquire_wearable_lease(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.acquire_wearable_lease(uuid, text, uuid, integer) to service_role;

create or replace function public.release_wearable_lease(p_device_id uuid, p_purpose text, p_holder uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.wearable_leases
  where device_id = p_device_id and purpose = p_purpose and holder = p_holder;
$$;

revoke all on function public.release_wearable_lease(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.release_wearable_lease(uuid, text, uuid) to service_role;
