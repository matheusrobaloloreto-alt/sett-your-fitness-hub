-- Restore the wearable-device privilege boundary if a later grant or schema
-- reconciliation reintroduced table-wide access. Credentials belong only in
-- wearable_credentials as encrypted envelopes handled by the service role.

begin;

alter table public.wearable_devices enable row level security;

revoke all on public.wearable_devices from public, anon, authenticated;

grant select (
  id,
  student_id,
  company_id,
  provider,
  device_name,
  external_user_id,
  is_active,
  connection_status,
  granted_scopes,
  required_scopes,
  last_sync_at,
  last_sync_status,
  last_error_code,
  last_error,
  revocation_status,
  revocation_retry_after,
  credential_delete_after,
  revoked_at,
  created_at,
  updated_at
)
on public.wearable_devices to authenticated;

grant all on public.wearable_devices to service_role;

-- The table has one browser-facing purpose: tenant-scoped status reads. Remove
-- any policy introduced by drift before recreating that single contract.
do $wearable_device_policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'wearable_devices'
  loop
    execute format(
      'drop policy if exists %I on public.wearable_devices',
      v_policy.policyname
    );
  end loop;
end
$wearable_device_policies$;

create policy "wearable devices tenant read"
on public.wearable_devices
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    where s.id = student_id
      and s.user_id = auth.uid()
  )
  or public.is_student_company_staff(auth.uid(), student_id)
  or public.has_role(auth.uid(), 'master')
);

-- Fresh databases never create these legacy columns. Existing databases may
-- still have them, so fail closed and require them to remain NULL until a
-- later cleanup can remove the columns entirely.
do $wearable_legacy_tokens$
declare
  v_non_null bigint;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wearable_devices'
      and column_name = 'access_token'
  ) then
    execute 'revoke select (access_token), insert (access_token), update (access_token) on public.wearable_devices from public, anon, authenticated';
    execute 'select count(*) from public.wearable_devices where access_token is not null'
      into v_non_null;
    if v_non_null <> 0 then
      raise exception 'wearable_legacy_access_token_not_empty';
    end if;

    execute 'alter table public.wearable_devices drop constraint if exists wearable_devices_legacy_access_token_null';
    execute 'alter table public.wearable_devices add constraint wearable_devices_legacy_access_token_null check (access_token is null) not valid';
    execute 'alter table public.wearable_devices validate constraint wearable_devices_legacy_access_token_null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wearable_devices'
      and column_name = 'refresh_token'
  ) then
    execute 'revoke select (refresh_token), insert (refresh_token), update (refresh_token) on public.wearable_devices from public, anon, authenticated';
    execute 'select count(*) from public.wearable_devices where refresh_token is not null'
      into v_non_null;
    if v_non_null <> 0 then
      raise exception 'wearable_legacy_refresh_token_not_empty';
    end if;

    execute 'alter table public.wearable_devices drop constraint if exists wearable_devices_legacy_refresh_token_null';
    execute 'alter table public.wearable_devices add constraint wearable_devices_legacy_refresh_token_null check (refresh_token is null) not valid';
    execute 'alter table public.wearable_devices validate constraint wearable_devices_legacy_refresh_token_null';
  end if;
end
$wearable_legacy_tokens$;

commit;
