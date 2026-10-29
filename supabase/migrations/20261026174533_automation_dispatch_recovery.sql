-- Local attempt deduplication is not provider exactly-once delivery. Ambiguous
-- requests are quarantined until an operator can reconcile provider evidence.
alter table public.flow_sessions
  add column dispatch_lease_token uuid,
  add column dispatch_lease_until timestamptz;
alter table public.intercycle_anamnesis_deliveries
  add column dispatch_lease_token uuid,
  add column dispatch_lease_until timestamptz;

create table public.automation_dispatch_attempts (
  kind text not null check (kind in ('flow','intercycle')),
  owner_id uuid not null,
  send_key text not null check (length(send_key) between 1 and 200),
  lease_token uuid not null,
  state text not null check (state in ('in_flight','acked')),
  provider_message_id text,
  started_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (kind, owner_id, send_key)
);
alter table public.automation_dispatch_attempts enable row level security;
revoke all on public.automation_dispatch_attempts from public, anon, authenticated;
grant select on public.automation_dispatch_attempts to service_role;

-- Absence of a new ledger entry does not prove that an old retry never sent.
-- Only exact errors raised before provider I/O are eligible for adoption.
create function public.automation_legacy_retry_uncertain(_kind text, _status text,
  _context jsonb, _error text, _lease_token uuid)
returns boolean language sql immutable set search_path = public as $$
  select _lease_token is null and case when _kind='flow' then
    _status='processing' or (_status in ('active','failed')
      and (_status='failed' or coalesce(_context,'{}') ? 'dispatch_retries' or nullif(_context->>'dispatch_error','') is not null)
      and coalesce(_context->>'dispatch_error','') not in (
        'weekly_contact_consent_check_failed','WhatsApp provider not configured',
        'weekly_contact_consent_missing','weekly_contact_queued_recipient_changed',
        'weekly_contact_recipient_missing','weekly_contact_recipient_ambiguous','weekly_contact_recipient_mismatch'))
    else _status='sending' or (_status='failed' and coalesce(_error,'') not in (
      'intercycle_provider_not_configured','intercycle_opt_in_missing',
      'intercycle_enrollment_lookup_failed','intercycle_trusted_phone_missing',
      'intercycle_whatsapp_unavailable','intercycle_invite_unavailable',
      'intercycle_cycle_cancelled_or_rescoped','intercycle_enrollment_completed_or_missing')) end;
$$;
revoke all on function public.automation_legacy_retry_uncertain(text,text,jsonb,text,uuid) from public,anon,authenticated;

insert into public.automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state)
  select 'flow',id,'_legacy_unknown',gen_random_uuid(),'in_flight' from public.flow_sessions
  where public.automation_legacy_retry_uncertain('flow',status,context,null,dispatch_lease_token)
  union all
  select 'intercycle',id,'_legacy_unknown',gen_random_uuid(),'in_flight' from public.intercycle_anamnesis_deliveries
  where public.automation_legacy_retry_uncertain('intercycle',status,null,last_error_code,dispatch_lease_token);

update public.flow_sessions s set status='failed',
  context=coalesce(s.context,'{}') || jsonb_build_object(
    '_dispatch_previous_error',s.context->>'dispatch_error',
    'dispatch_error','dispatch_uncertain','next_dispatch_at',null),
  dispatch_lease_token=null,dispatch_lease_until=null,updated_at=now()
  where exists(select 1 from public.automation_dispatch_attempts a
    where a.kind='flow' and a.owner_id=s.id and a.send_key='_legacy_unknown');
update public.intercycle_anamnesis_deliveries d set status='failed',
  last_error_code='dispatch_uncertain',next_attempt_at=null,
  dispatch_lease_token=null,dispatch_lease_until=null,updated_at=now()
  where exists(select 1 from public.automation_dispatch_attempts a
    where a.kind='intercycle' and a.owner_id=d.id and a.send_key='_legacy_unknown');

create or replace function public.claim_automation_sessions(_limit integer default 25)
returns setof public.flow_sessions language plpgsql security definer
set search_path = public as $$
declare r public.flow_sessions;
begin
  for r in select s.* from public.flow_sessions s
    where s.current_node_id is not null and (
      (s.status = 'active' and coalesce(s.context->>'dispatch_error','') <> 'dispatch_uncertain'
       and (s.context->>'next_dispatch_at' is null or
         case when s.context->>'next_dispatch_at' ~ '^\d{4}-\d{2}-\d{2}T'
           then (s.context->>'next_dispatch_at')::timestamptz <= now() else true end))
      or (s.status = 'processing' and
        (s.dispatch_lease_until <= now() or s.dispatch_lease_token is null)))
    order by s.created_at for update skip locked
    limit greatest(1,least(coalesce(_limit,25),100))
  loop
    if public.automation_legacy_retry_uncertain('flow',r.status,r.context,null,r.dispatch_lease_token) then
      insert into public.automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state)
        values ('flow',r.id,'_legacy_unknown',gen_random_uuid(),'in_flight') on conflict do nothing;
    end if;
    if exists (
      select 1 from public.automation_dispatch_attempts a
      where a.kind = 'flow' and a.owner_id = r.id and a.state = 'in_flight'
    ) then
      update public.flow_sessions set status = 'failed',
        context = coalesce(context,'{}') || '{"dispatch_error":"dispatch_uncertain","next_dispatch_at":null}'::jsonb,
        dispatch_lease_token = null, dispatch_lease_until = null, updated_at = now()
        where id = r.id;
      continue;
    end if;
    update public.flow_sessions set status = 'processing',
      dispatch_lease_token = gen_random_uuid(), dispatch_lease_until = now() + interval '15 minutes',
      last_activity_at = now(), updated_at = now() where id = r.id returning * into r;
    return next r;
  end loop;
end $$;

create or replace function public.claim_intercycle_anamnesis_deliveries(_limit integer default 25)
returns setof public.intercycle_anamnesis_deliveries language plpgsql security definer
set search_path = public as $$
declare r public.intercycle_anamnesis_deliveries;
begin
  for r in select d.* from public.intercycle_anamnesis_deliveries d
    where ((d.status in ('scheduled','failed') and coalesce(d.last_error_code,'') not in
      ('dispatch_uncertain','company_feature_denied','company_feature_unavailable'))
      or (d.status = 'sending' and (d.dispatch_lease_until <= now() or d.dispatch_lease_token is null)))
      and d.scheduled_for <= now() and (d.next_attempt_at is null or d.next_attempt_at <= now())
    order by d.scheduled_for for update skip locked
    limit greatest(1,least(coalesce(_limit,25),100))
  loop
    if public.automation_legacy_retry_uncertain('intercycle',r.status,null,r.last_error_code,r.dispatch_lease_token) then
      insert into public.automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state)
        values ('intercycle',r.id,'_legacy_unknown',gen_random_uuid(),'in_flight') on conflict do nothing;
    end if;
    if exists (
      select 1 from public.automation_dispatch_attempts a
      where a.kind = 'intercycle' and a.owner_id = r.id and a.state = 'in_flight'
    ) then
      update public.intercycle_anamnesis_deliveries set status = 'failed',
        last_error_code = 'dispatch_uncertain', next_attempt_at = null,
        dispatch_lease_token = null, dispatch_lease_until = null, updated_at = now()
        where id = r.id;
      continue;
    end if;
    update public.intercycle_anamnesis_deliveries set status = 'sending',
      dispatch_lease_token = gen_random_uuid(), dispatch_lease_until = now() + interval '15 minutes',
      updated_at = now() where id = r.id returning * into r;
    return next r;
  end loop;
end $$;

-- Lock the owner before the ledger everywhere to serialize claim/begin/ACK.
create function public.lock_automation_dispatch_owner(_kind text, _owner_id uuid, _lease_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare valid boolean;
begin
  if _kind = 'flow' then
    perform 1 from public.flow_sessions where id = _owner_id for update;
    select status = 'processing' and dispatch_lease_token = _lease_token
      and dispatch_lease_until > clock_timestamp() into valid
      from public.flow_sessions where id = _owner_id;
  elsif _kind = 'intercycle' then
    perform 1 from public.intercycle_anamnesis_deliveries where id = _owner_id for update;
    select status = 'sending' and dispatch_lease_token = _lease_token
      and dispatch_lease_until > clock_timestamp() into valid
      from public.intercycle_anamnesis_deliveries where id = _owner_id;
  end if;
  if valid is distinct from true then raise exception 'dispatch_lease_lost'; end if;
end $$;

create function public.checkpoint_automation_dispatch(_kind text, _owner_id uuid,
  _lease_token uuid, _patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_automation_dispatch_owner(_kind,_owner_id,_lease_token);
  if jsonb_typeof(_patch) is distinct from 'object' then raise exception 'dispatch_patch_invalid'; end if;
  if _kind='flow' then
    if exists(select 1 from jsonb_object_keys(_patch) k where k not in
      ('flow_id','current_node_id','context','status','last_activity_at','updated_at'))
      or (_patch ? 'status' and coalesce(_patch->>'status','') not in ('processing','active','completed','failed','waiting_response'))
      or (_patch ? 'context' and jsonb_typeof(_patch->'context') is distinct from 'object')
    then raise exception 'dispatch_patch_invalid'; end if;
    update public.flow_sessions set
      flow_id=case when _patch ? 'flow_id' then (_patch->>'flow_id')::uuid else flow_id end,
      current_node_id=case when _patch ? 'current_node_id' then _patch->>'current_node_id' else current_node_id end,
      context=case when _patch ? 'context' then _patch->'context' else context end,
      status=case when _patch ? 'status' then _patch->>'status' else status end,
      last_activity_at=case when _patch ? 'last_activity_at' then clock_timestamp() else last_activity_at end,
      updated_at=clock_timestamp() where id=_owner_id;
  else
    if exists(select 1 from jsonb_object_keys(_patch) k where k not in
      ('status','cancelled_at','last_error_code','retry_count','next_attempt_at','updated_at'))
      or (_patch ? 'status' and coalesce(_patch->>'status','') not in ('failed','cancelled'))
    then raise exception 'dispatch_patch_invalid'; end if;
    update public.intercycle_anamnesis_deliveries set
      status=case when _patch ? 'status' then _patch->>'status' else status end,
      cancelled_at=case when _patch ? 'cancelled_at' then clock_timestamp() else cancelled_at end,
      last_error_code=case when _patch ? 'last_error_code' then _patch->>'last_error_code' else last_error_code end,
      retry_count=case when _patch ? 'retry_count' then (_patch->>'retry_count')::integer else retry_count end,
      next_attempt_at=case when _patch ? 'next_attempt_at' then (_patch->>'next_attempt_at')::timestamptz else next_attempt_at end,
      updated_at=clock_timestamp() where id=_owner_id;
  end if;
  if not found then raise exception 'dispatch_lease_lost'; end if;
end $$;

create function public.begin_automation_dispatch(_kind text, _owner_id uuid, _lease_token uuid, _send_key text)
returns text language plpgsql security definer set search_path = public as $$
declare prior text;
begin
  perform public.lock_automation_dispatch_owner(_kind,_owner_id,_lease_token);
  select state into prior from public.automation_dispatch_attempts
    where kind = _kind and owner_id = _owner_id and send_key = _send_key;
  if prior = 'acked' then return 'acked'; end if;
  if prior is not null then raise exception 'dispatch_uncertain'; end if;
  insert into public.automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state)
    values (_kind,_owner_id,_send_key,_lease_token,'in_flight');
  return 'in_flight';
end $$;

create function public.authorize_automation_dispatch(_kind text, _owner_id uuid, _lease_token uuid, _send_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_automation_dispatch_owner(_kind,_owner_id,_lease_token);
  if not exists (select 1 from public.automation_dispatch_attempts
    where kind = _kind and owner_id = _owner_id and send_key = _send_key
      and lease_token = _lease_token and state = 'in_flight') then
    raise exception 'dispatch_attempt_lost';
  end if;
end $$;

create function public.ack_automation_dispatch(_kind text, _owner_id uuid, _lease_token uuid,
  _send_key text, _provider_message_id text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lock_automation_dispatch_owner(_kind,_owner_id,_lease_token);
  if _provider_message_id is null or length(btrim(_provider_message_id)) not between 1 and 200 then
    raise exception 'dispatch_receipt_missing';
  end if;
  update public.automation_dispatch_attempts set state = 'acked',
    provider_message_id = left(_provider_message_id,200), acknowledged_at = now()
    where kind = _kind and owner_id = _owner_id and send_key = _send_key
      and lease_token = _lease_token and state = 'in_flight';
  if not found then raise exception 'dispatch_attempt_lost'; end if;
  if _kind = 'intercycle' then
    update public.intercycle_anamnesis_deliveries set status = 'sent', sent_at = now(),
      last_error_code = null, next_attempt_at = null, updated_at = now(),
      dispatch_lease_token = null, dispatch_lease_until = null where id = _owner_id;
  end if;
end $$;

revoke all on function public.lock_automation_dispatch_owner(text,uuid,uuid),
  public.checkpoint_automation_dispatch(text,uuid,uuid,jsonb),
  public.begin_automation_dispatch(text,uuid,uuid,text),
  public.authorize_automation_dispatch(text,uuid,uuid,text),
  public.ack_automation_dispatch(text,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.begin_automation_dispatch(text,uuid,uuid,text),
  public.checkpoint_automation_dispatch(text,uuid,uuid,jsonb),
  public.authorize_automation_dispatch(text,uuid,uuid,text),
  public.ack_automation_dispatch(text,uuid,uuid,text,text) to service_role;
revoke all on function public.claim_automation_sessions(integer),
  public.claim_intercycle_anamnesis_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_automation_sessions(integer),
  public.claim_intercycle_anamnesis_deliveries(integer) to service_role;

-- Delay yields cannot turn a cyclic graph into distinct send occurrences.
-- Existing graphs remain stored but runtime rejects cycles before any send.
create function public.guard_automation_graph_acyclic()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('automation-graph:' || new.flow_id::text,0));
  if exists (
    with recursive reach(source,target) as (
      select e.source_node_id::text,e.target_node_id::text
      from public.automation_flow_edges e where e.flow_id=new.flow_id
      union
      select r.source,e.target_node_id::text
      from reach r join public.automation_flow_edges e on e.source_node_id::text=r.target and e.flow_id=new.flow_id
    ) select 1 from reach where source=target
  ) then raise exception using errcode='23514',message='flow_graph_cycle_unsupported'; end if;
  return null;
end $$;
revoke all on function public.guard_automation_graph_acyclic() from public,anon,authenticated;
create constraint trigger automation_graph_acyclic
after insert or update on public.automation_flow_edges deferrable initially deferred
for each row execute function public.guard_automation_graph_acyclic();
