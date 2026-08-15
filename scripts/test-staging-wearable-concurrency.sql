\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values (
  '20000000-0000-0000-0000-000000000001',
  'wearable-staging@example.invalid',
  '{"role":"authenticated"}',
  '{"full_name":"Wearable Staging"}'
);

insert into public.companies (id, name, slug)
values (
  'c0000000-0000-0000-0000-000000000001',
  'Synthetic Wearable Tenant',
  'synthetic-wearable'
);

insert into public.students (id, company_id, user_id, full_name, status)
values (
  'c1000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Wearable Staging',
  'active'
);

insert into public.wearable_oauth_states (
  state, student_id, actor_user_id, company_id, provider,
  requested_scopes, return_url, expires_at
)
values (
  'synthetic-state-once',
  'c1000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'oura',
  array['daily'],
  'https://example.invalid/aluno',
  now() + interval '10 minutes'
);

do $$
declare
  first_consume jsonb;
  replay_consume jsonb;
begin
  first_consume := public.consume_wearable_oauth_state('synthetic-state-once');
  replay_consume := public.consume_wearable_oauth_state('synthetic-state-once');
  if first_consume is null then
    raise exception 'valid OAuth state was not consumed';
  end if;
  if replay_consume is not null then
    raise exception 'OAuth state replay unexpectedly succeeded';
  end if;
end;
$$;

insert into public.wearable_oauth_states (
  state, student_id, actor_user_id, company_id, provider,
  requested_scopes, return_url, expires_at
)
values (
  'synthetic-state-expired',
  'c1000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'oura',
  array['daily'],
  'https://example.invalid/aluno',
  now() - interval '1 second'
);

do $$
begin
  if public.consume_wearable_oauth_state('synthetic-state-expired') is not null then
    raise exception 'expired OAuth state unexpectedly succeeded';
  end if;
end;
$$;

select public.commit_wearable_connection(
  'c2000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'oura',
  'synthetic-provider-user',
  array['daily'],
  array['daily'],
  'synthetic-key',
  'synthetic-access-ciphertext',
  'synthetic-access-iv',
  null,
  null,
  now() + interval '1 hour',
  'Bearer',
  'wearables-v1-test'
);

do $$
declare
  holder_one constant uuid := 'c3000000-0000-0000-0000-000000000001';
  holder_two constant uuid := 'c3000000-0000-0000-0000-000000000002';
  device constant uuid := 'c2000000-0000-0000-0000-000000000001';
begin
  if not public.acquire_wearable_lease(device, 'sync', holder_one, 60) then
    raise exception 'initial sync lease was not acquired';
  end if;
  if public.acquire_wearable_lease(device, 'sync', holder_two, 60) then
    raise exception 'concurrent sync lease unexpectedly succeeded';
  end if;
  if public.acquire_wearable_lease(device, 'maintenance', holder_two, 60) then
    raise exception 'maintenance lease overlapped active sync';
  end if;

  begin
    perform public.commit_wearable_connection(
      device,
      'c1000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001',
      'oura',
      'synthetic-provider-user',
      array['daily'],
      array['daily'],
      'synthetic-key',
      'synthetic-access-ciphertext',
      'synthetic-access-iv',
      null,
      null,
      now() + interval '1 hour',
      'Bearer',
      'wearables-v1-test'
    );
    raise exception 'OAuth callback overlapped active sync';
  exception when others then
    if sqlerrm <> 'device_busy' then
      raise;
    end if;
  end;

  update public.wearable_leases
  set locked_until = clock_timestamp() - interval '1 second'
  where device_id = device and purpose = 'sync';

  if not public.acquire_wearable_lease(device, 'sync', holder_two, 60) then
    raise exception 'expired sync lease was not reclaimed';
  end if;

  begin
    perform public.begin_wearable_sync(
      device,
      'c1000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      holder_one
    );
    raise exception 'old holder retained a reclaimed lease';
  exception when others then
    if sqlerrm <> 'sync_lease_lost' then
      raise;
    end if;
  end;

  perform public.begin_wearable_sync(
    device,
    'c1000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    holder_two
  );

  if public.commit_wearable_sync(
    device,
    'c1000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    holder_two,
    '[]'::jsonb,
    '[]'::jsonb,
    '{"daily":"2026-08-15T00:00:00Z"}'::jsonb,
    now()
  ) <> 0 then
    raise exception 'empty synthetic sync imported rows';
  end if;

  if not exists (
    select 1
    from public.wearable_sync_cursors cursor_row
    where cursor_row.device_id = device
      and cursor_row.resource = 'daily'
      and cursor_row.watermark = '2026-08-15T00:00:00Z'::timestamptz
  ) then
    raise exception 'provider watermark was not cast and persisted exactly';
  end if;

  if public.acquire_wearable_lease(device, 'maintenance', holder_one, 60) then
    raise exception 'maintenance lease overlapped unreleased sync';
  end if;

  perform public.release_wearable_lease(device, 'sync', holder_two);
  if not public.acquire_wearable_lease(device, 'maintenance', holder_one, 60) then
    raise exception 'maintenance lease was not acquired after sync release';
  end if;

  begin
    perform public.commit_wearable_connection(
      device,
      'c1000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001',
      'oura',
      'synthetic-provider-user',
      array['daily'],
      array['daily'],
      'synthetic-key',
      'synthetic-access-ciphertext',
      'synthetic-access-iv',
      null,
      null,
      now() + interval '1 hour',
      'Bearer',
      'wearables-v1-test'
    );
    raise exception 'OAuth callback overlapped maintenance';
  exception when others then
    if sqlerrm <> 'device_busy' then
      raise;
    end if;
  end;

  perform public.release_wearable_lease(device, 'maintenance', holder_one);
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.acquire_wearable_lease(
      'c2000000-0000-0000-0000-000000000001',
      'sync',
      'c3000000-0000-0000-0000-000000000003',
      60
    );
    raise exception 'authenticated browser executed privileged lease RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
rollback;

\echo 'Wearable concurrency PASS: one-time state, expiry, lease reclaim, callback exclusion, and RPC ACL'
