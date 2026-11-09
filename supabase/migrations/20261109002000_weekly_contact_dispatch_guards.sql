begin;

-- Only the provider authorization step creates an ambiguous outcome. Rows
-- written by the previous worker remain in_flight and require reconciliation.
alter table public.automation_dispatch_attempts drop constraint automation_dispatch_attempts_state_check;
alter table public.automation_dispatch_attempts add constraint automation_dispatch_attempts_state_check
  check (state in ('prepared', 'in_flight', 'acked'));
alter table public.automation_dispatch_attempts add column authorized_at timestamptz;
-- Existing in-flight intents may already have reached the provider.
update public.automation_dispatch_attempts set authorized_at = started_at where state = 'in_flight';

create function public.prepare_automation_dispatch(_kind text, _owner_id uuid, _lease_token uuid, _send_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare prior text;
begin
  if _kind not in ('flow', 'intercycle') then raise exception 'dispatch_kind_invalid'; end if;
  perform public.lock_automation_dispatch_owner(_kind, _owner_id, _lease_token);
  select state into prior from public.automation_dispatch_attempts
    where kind = _kind and owner_id = _owner_id and send_key = _send_key;
  if prior = 'acked' then return 'acked'; end if;
  if prior = 'in_flight' then raise exception 'dispatch_uncertain'; end if;
  insert into public.automation_dispatch_attempts(kind, owner_id, send_key, lease_token, state)
    values (_kind, _owner_id, _send_key, _lease_token, 'prepared')
    on conflict (kind, owner_id, send_key) do update set lease_token = excluded.lease_token;
  return 'prepared';
end $$;

alter table public.automation_flows add column weekly_contact_inactivity_hours integer not null default 0
  check (weekly_contact_inactivity_hours between 0 and 720);

-- One occurrence counts once, even when it contains several media parts.
-- A possible send consumes the same rolling budget until it ages out. Merely
-- queued/prepared/cancelled rows with no provider intent do not consume it.
create function public.weekly_contact_history(_company_id uuid, _student_id uuid,
  _chat_id uuid, _exclude_owner uuid, _at timestamptz)
returns table (contacts_last_7d bigint, last_contact_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with history as (
    select greatest(
      (select max(coalesce(a.acknowledged_at, a.started_at)) from public.automation_dispatch_attempts a
        where a.kind = 'flow' and a.owner_id = s.id and a.state in ('acked', 'in_flight')
          and a.send_key <> '_legacy_unknown'),
      (select max(p.updated_at) from public.company_message_sequences seq
        join public.company_message_parts p on p.sequence_id = seq.id
        where seq.scope->>'kind' = 'flow' and seq.scope->>'ownerId' = s.id::text
          and p.state in ('acked', 'in_flight')),
      case when exists (select 1 from public.automation_dispatch_attempts a
        where a.kind = 'flow' and a.owner_id = s.id and a.send_key = '_legacy_unknown')
        then coalesce(s.last_activity_at, s.created_at) end
    ) as contact_at
    from public.flow_sessions s join public.automation_flows f on f.id = s.flow_id
    where f.company_id = _company_id and s.id is distinct from _exclude_owner
      and s.context->>'trigger_type' = 'weekly_contact'
      and (s.chat_id = _chat_id or s.context->>'student_id' = _student_id::text)
  )
  select count(*) filter (where contact_at > _at - interval '7 days'), max(contact_at) from history;
$$;

-- Provider echoes do not identify the sender's automation. Match durable
-- receipts within the conversation before treating an echo as human activity.
create function public.has_automated_whatsapp_receipt(_company_id uuid, _chat_id uuid, _receipt text)
returns boolean language sql stable security definer set search_path = '' as $$
  select _receipt is not null and exists (
    select 1 from public.whatsapp_chats chat
      where chat.id = _chat_id and chat.company_id = _company_id and (
        exists (
          select 1 from public.automation_dispatch_attempts attempt
          where attempt.state = 'acked' and attempt.provider_message_id = _receipt
            and case attempt.kind
              when 'flow' then exists (
                select 1 from public.flow_sessions owner where owner.id = attempt.owner_id and owner.chat_id = chat.id)
              when 'webhook' then exists (
                select 1 from public.webhook_dispatch_owners owner where owner.id = attempt.owner_id
                  and owner.chat_id = chat.id and owner.company_id = chat.company_id)
              when 'intercycle' then exists (
                select 1 from public.intercycle_anamnesis_deliveries owner where owner.id = attempt.owner_id
                  and owner.student_id = chat.student_id and owner.company_id = chat.company_id)
              else false end
        ) or exists (
          select 1 from public.company_message_parts part
          join public.company_message_sequences seq on seq.id = part.sequence_id
          where part.state = 'acked' and part.receipt = _receipt and seq.chat_id = chat.id
            and seq.company_id = chat.company_id and nullif(seq.snapshot->'metadata'->>'actorId', '') is null
        )
      )
  );
$$;

create function public.weekly_contact_eligibility(_flow_id uuid, _chat_id uuid, _student_id uuid,
  _recipient text, _generation bigint, _owner_id uuid, _at timestamptz)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  flow public.automation_flows;
  chat public.whatsapp_chats;
  recent_count bigint;
  latest_contact timestamptz;
  operational_day date := (_at at time zone 'America/Sao_Paulo')::date;
begin
  select * into flow from public.automation_flows where id = _flow_id and is_active and trigger_type = 'weekly_contact';
  if flow.id is null then return 'dispatch_lease_lost'; end if;

  select * into chat from public.whatsapp_chats where id = _chat_id and company_id = flow.company_id
    and student_id = _student_id;
  if chat.id is null or chat.remote_jid not like '%@s.whatsapp.net'
    or public.weekly_contact_recipient_key(chat.remote_jid) is null
    or public.weekly_contact_recipient_key(chat.remote_jid) is distinct from public.weekly_contact_recipient_key(_recipient)
    or public.weekly_contact_consent_is_current(_student_id, flow.company_id, chat.remote_jid, _generation) is distinct from true
    or not exists (select 1 from public.students s where s.id = _student_id and s.company_id = flow.company_id
      and s.status in ('active', 'awaiting_training'))
    or not exists (select 1 from public.enrollments e where e.student_id = _student_id and e.company_id = flow.company_id
      and e.status in ('active', 'awaiting_training')
      and e.start_date <= operational_day and e.end_date >= operational_day)
    or chat.cadence_muted is true or chat.is_archived is true
    or not exists (select 1 from public.whatsapp_instances i where i.id = chat.instance_id and i.company_id = flow.company_id and i.status = 'connected')
  then return 'weekly_contact_ineligible'; end if;

  if public.company_contact_window_open(flow.company_id, _at) is distinct from true then return 'weekly_contact_window_closed'; end if;

  if flow.weekly_contact_inactivity_hours > 0 and (
    chat.created_at > _at - make_interval(hours => flow.weekly_contact_inactivity_hours)
    or exists (select 1 from public.whatsapp_messages m
      where m.chat_id = chat.id and m.company_id = chat.company_id
        and m.timestamp > _at - make_interval(hours => flow.weekly_contact_inactivity_hours)
        and m.type is distinct from 'reaction' and m.failed_at is null
        and (m.is_from_me is false or (m.is_from_me is true and m.status in ('accepted','sent','delivered','read')
          and (m.origin = 'panel_manual' or (m.origin is distinct from 'automation'
            and not public.has_automated_whatsapp_receipt(m.company_id, m.chat_id, m.message_id_external))))))
  ) then return 'weekly_contact_conversation_active'; end if;

  select contacts_last_7d, last_contact_at into recent_count, latest_contact
    from public.weekly_contact_history(flow.company_id, _student_id, chat.id, _owner_id, _at);
  if recent_count >= public.company_communication_number(flow.company_id, 'max_weekly_contacts', 2, 1, 2)
    or latest_contact > _at - make_interval(hours => public.company_communication_number(flow.company_id, 'minimum_interval_hours', 72, 72, 168))
  then return 'weekly_contact_interval_blocked'; end if;
  return 'eligible';
end $$;

create function public.weekly_contact_dispatch_check(_owner_id uuid, _serialize boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  session public.flow_sessions;
  chat public.whatsapp_chats;
  generation text;
  policy_flow_id uuid;
begin
  select * into session from public.flow_sessions where id = _owner_id and status = 'processing';
  if session.id is null or not exists (select 1 from public.automation_flows where id = session.flow_id and is_active)
    then return 'dispatch_lease_lost'; end if;
  if session.context->>'trigger_type' is distinct from 'weekly_contact' then return 'eligible'; end if;
  select * into chat from public.whatsapp_chats where id = session.chat_id;
  generation := session.context->>'recipient_generation';
  if chat.student_id is null or chat.student_id::text is distinct from session.context->>'student_id'
    or generation is null or generation !~ '^[1-9][0-9]{0,15}$'
  then return 'weekly_contact_ineligible'; end if;
  if _serialize then
    perform pg_advisory_xact_lock(hashtextextended('weekly-contact:' || chat.company_id || ':' || chat.student_id, 0));
  end if;
  if jsonb_typeof(session.context->'_flow_path') = 'array' then
    select f.id into policy_flow_id from public.automation_flows f
      where f.id::text = session.context->'_flow_path'->>0 and f.company_id = chat.company_id;
    if policy_flow_id is null then return 'weekly_contact_ineligible'; end if;
  end if;
  return public.weekly_contact_eligibility(coalesce(policy_flow_id, session.flow_id), chat.id, chat.student_id,
    session.context->>'recipient_candidate', generation::bigint, session.id, clock_timestamp());
end $$;

-- Change only the weekly branch of the installed scheduler. Other triggers
-- retain the existing contract, including the serialized scan.
do $migration$
declare
  definition text := pg_get_functiondef('public.process_automation_triggers()'::regprocedure);
  weekly_start integer := strpos(definition, '  with candidates as (
    select f.company_id,f.id as flow_id,c.id as chat_id,c.remote_jid as recipient_candidate,');
  weekly_end integer := strpos(definition, '  ) select count(*) into v_weekly_contact from inserted;');
begin
  if weekly_start = 0 or weekly_end <= weekly_start
    or strpos(definition, 'company_automation_trigger_scan') = 0
  then raise exception 'Weekly contact scheduler definition changed'; end if;
  execute overlay(definition placing $weekly$
  with candidates as (
    select f.company_id, f.id as flow_id, c.id as chat_id, c.remote_jid as recipient_candidate,
      s.weekly_contact_recipient_generation as recipient_generation,
      to_jsonb(s)->>'country_code' as recipient_country_code,
      public.get_automation_start_node(f.id) as start_node_id, s.id as student_id, s.full_name as student_name,
      history.contacts_last_7d, history.last_contact_at
    from public.automation_flows f
    join public.students s on s.company_id = f.company_id
    join public.whatsapp_chats c on c.company_id = f.company_id and c.student_id = s.id
    cross join lateral public.weekly_contact_history(f.company_id, s.id, c.id, null, statement_timestamp()) history
    where f.is_active and f.trigger_type = 'weekly_contact'
      and public.weekly_contact_eligibility(f.id, c.id, s.id, c.remote_jid,
        s.weekly_contact_recipient_generation, null, statement_timestamp()) = 'eligible'
      and not exists (
        select 1 from public.flow_sessions pending
        join public.automation_flows pending_flow on pending_flow.id = pending.flow_id
        where pending_flow.company_id = f.company_id
          and pending.context->>'trigger_type' = 'weekly_contact'
          and (pending.chat_id = c.id or pending.context->>'student_id' = s.id::text)
          and pending.status in ('active', 'processing', 'waiting_response')
      )
  ), inserted as (
    insert into public.flow_sessions(flow_id, chat_id, current_node_id, status, context,
      started_at, last_activity_at, created_at, updated_at)
    select distinct on (c.student_id) c.flow_id, c.chat_id, c.start_node_id, 'active',
      jsonb_build_object('trigger_type', 'weekly_contact', 'automation_key', 'weekly_contact:' || c.student_id || ':' || gen_random_uuid(),
        'student_id', c.student_id, 'student_name', c.student_name, 'recipient_candidate', c.recipient_candidate,
        'recipient_generation', c.recipient_generation, 'recipient_country_code', c.recipient_country_code,
        'contact_objective', 'Perguntar se o aluno teve dificuldade no treino e se quer mandar video para correcao.',
        'copy_seed', floor(extract(epoch from now()) / 3600)::bigint,
        'copy_guidance', jsonb_build_array('Manter o mesmo objetivo, mas variar abertura, ritmo e pergunta final.',
          'Nao soar automatico; mencionar treino, dificuldade ou video de execucao.', 'Ser curto, humano e acionavel.'),
        'contacts_last_7d_before', c.contacts_last_7d, 'last_weekly_contact_at', c.last_contact_at),
      now(), now(), now(), now()
    from candidates c where c.start_node_id is not null
    order by c.student_id, c.flow_id, c.chat_id
    returning 1
$weekly$ from weekly_start for weekly_end - weekly_start);
end
$migration$;

create or replace function public.authorize_automation_dispatch(_kind text, _owner_id uuid, _lease_token uuid, _send_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare eligibility text;
begin
  perform public.lock_automation_dispatch_owner(_kind, _owner_id, _lease_token);
  if _kind = 'flow' then
    eligibility := public.weekly_contact_dispatch_check(_owner_id, true);
    if eligibility <> 'eligible' then raise exception '%', eligibility; end if;
  end if;
  -- Webhook text still begins in_flight; it may authorize exactly once.
  update public.automation_dispatch_attempts
    set state = 'in_flight', started_at = clock_timestamp(), authorized_at = clock_timestamp()
    where kind = _kind and owner_id = _owner_id and send_key = _send_key
      and lease_token = _lease_token and authorized_at is null
      and (state = 'prepared' or (_kind = 'webhook' and state = 'in_flight'));
  if not found then raise exception 'dispatch_attempt_lost'; end if;
end $$;

create or replace function public.ack_automation_dispatch(_kind text, _owner_id uuid, _lease_token uuid,
  _send_key text, _provider_message_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare paused boolean;
begin
  if _kind = 'flow' then
    select status = 'failed' and context->>'_dispatch_paused' = 'true'
      and dispatch_lease_token = _lease_token into paused
      from public.flow_sessions where id = _owner_id for update;
  end if;
  if paused is distinct from true then
    perform public.lock_automation_dispatch_owner(_kind, _owner_id, _lease_token);
  end if;
  if _provider_message_id is null or length(btrim(_provider_message_id)) not between 1 and 200 then
    raise exception 'dispatch_receipt_missing';
  end if;
  update public.automation_dispatch_attempts set state = 'acked',
    provider_message_id = left(_provider_message_id,200), acknowledged_at = now()
    where kind = _kind and owner_id = _owner_id and send_key = _send_key
      and lease_token = _lease_token and state = 'in_flight';
  if not found then raise exception 'dispatch_attempt_lost'; end if;
  if paused is true then
    -- A provider request already authorized before pause may still return a
    -- receipt. Keep the receipt while preventing the paused cursor from moving.
    update public.flow_sessions s set status = 'cancelled', dispatch_lease_token = null,
      context = context - 'dispatch_error', updated_at = clock_timestamp()
      where s.id = _owner_id
        and not exists (select 1 from public.automation_dispatch_attempts a
          where a.kind = 'flow' and a.owner_id = s.id and a.state = 'in_flight')
        and not exists (select 1 from public.company_message_sequences seq
          join public.company_message_parts p on p.sequence_id = seq.id
          where seq.scope->>'kind' = 'flow' and seq.scope->>'ownerId' = s.id::text and p.state = 'in_flight');
  elsif _kind = 'intercycle' then
    update public.intercycle_anamnesis_deliveries set status = 'sent', sent_at = now(),
      last_error_code = null, next_attempt_at = null, updated_at = now(),
      dispatch_lease_token = null, dispatch_lease_until = null where id = _owner_id;
  end if;
end $$;

create or replace function public.claim_company_message_part(_sequence_id uuid,_index integer,_scope jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.company_message_sequences; p public.company_message_parts; eligibility text;
begin
 if _scope is not null then perform public.lock_automation_dispatch_owner(_scope->>'kind',(_scope->>'ownerId')::uuid,(_scope->>'leaseToken')::uuid); end if;
 select * into s from public.company_message_sequences where id=_sequence_id for update;
 if not found then raise exception 'sequence_missing'; end if;
 if (s.scope->>'kind') is distinct from (_scope->>'kind') or (s.scope->>'ownerId') is distinct from (_scope->>'ownerId') then raise exception 'sequence_scope_changed'; end if;
 select * into p from public.company_message_parts where sequence_id=_sequence_id and part_index=_index for update;
 if not found then raise exception 'sequence_part_missing'; end if;
 if p.state='acked' then return jsonb_build_object('state','acked'); end if;
 if p.state <> 'pending' or exists(select 1 from public.company_message_parts where sequence_id=_sequence_id and part_index<_index and state<>'acked') then raise exception 'dispatch_uncertain'; end if;
 if _scope->>'kind' = 'flow' then
  eligibility := public.weekly_contact_dispatch_check((_scope->>'ownerId')::uuid, true);
  if eligibility <> 'eligible' then raise exception '%', eligibility; end if;
 end if;
 update public.company_message_parts set state='in_flight',token=gen_random_uuid(),updated_at=clock_timestamp() where sequence_id=_sequence_id and part_index=_index returning * into p;
 return jsonb_build_object('state',p.state,'token',p.token);
end $$;
-- A flow toggle and its queue transition share the same transaction. Keep
-- ambiguous sessions visible in the existing reconciliation UI.
create function public.cancel_paused_automation_queue()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Take the owner locks before inspecting the ledger in a fresh statement.
  perform 1 from public.flow_sessions s
    where (s.flow_id = new.id or s.context->'_flow_path' ? new.id::text)
      and s.status in ('active', 'waiting_response', 'processing')
    order by s.id for update;
  with disposition as (
    select s.id, (
      exists (select 1 from public.automation_dispatch_attempts a
        where a.kind = 'flow' and a.owner_id = s.id and a.state = 'in_flight')
      or exists (select 1 from public.company_message_sequences sequence
        join public.company_message_parts part on part.sequence_id = sequence.id
        where sequence.scope->>'kind' = 'flow' and sequence.scope->>'ownerId' = s.id::text and part.state = 'in_flight')
    ) as uncertain from public.flow_sessions s
    where (s.flow_id = new.id or s.context->'_flow_path' ? new.id::text)
      and s.status in ('active', 'waiting_response', 'processing')
  )
  update public.flow_sessions s set
    status = case when disposition.uncertain then 'failed' else 'cancelled' end,
    context = case when disposition.uncertain then coalesce(s.context, '{}') ||
      '{"dispatch_error":"dispatch_uncertain","next_dispatch_at":null,"_dispatch_paused":true}'::jsonb else s.context end,
    dispatch_lease_until = null, updated_at = clock_timestamp()
  from disposition where s.id = disposition.id;
  return new;
end $$;

create trigger cancel_paused_automation_queue after update of is_active on public.automation_flows
for each row when (old.is_active is true and new.is_active is not true)
execute function public.cancel_paused_automation_queue();

-- Serialize new work against pause, including scheduler and webhook inserts.
create function public.guard_automation_queue_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('active', 'waiting_response', 'processing') then
    perform 1 from public.automation_flows f where f.id = new.flow_id and f.is_active for share;
    if not found then return null; end if;
  end if;
  return new;
end $$;

create trigger guard_automation_queue_insert before insert on public.flow_sessions
for each row execute function public.guard_automation_queue_insert();

revoke all on function public.prepare_automation_dispatch(text,uuid,uuid,text),
  public.weekly_contact_dispatch_check(uuid,boolean), public.cancel_paused_automation_queue(),
  public.weekly_contact_history(uuid,uuid,uuid,uuid,timestamptz),
  public.has_automated_whatsapp_receipt(uuid,uuid,text),
  public.weekly_contact_eligibility(uuid,uuid,uuid,text,bigint,uuid,timestamptz),
  public.guard_automation_queue_insert() from public, anon, authenticated;
grant execute on function public.prepare_automation_dispatch(text,uuid,uuid,text),
  public.weekly_contact_dispatch_check(uuid,boolean) to service_role;

commit;
