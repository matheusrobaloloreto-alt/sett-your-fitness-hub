-- For the disposable PGlite fixture in scripts/qa/whatsapp-dispatch-guards.test.mjs only.
begin;

delete from public.whatsapp_messages;
update public.whatsapp_chats set created_at = now() - interval '10 days';
do $test$
declare
  tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  chat constant uuid := '00000000-0000-0000-0000-000000000003';
  owner constant uuid := '00000000-0000-0000-0000-000000000006';
  lease constant uuid := '00000000-0000-0000-0000-000000000007';
  actor constant uuid := '00000000-0000-0000-0000-000000000008';
  foreign_tenant constant uuid := '00000000-0000-0000-0000-000000000009';
  other_chat constant uuid := '00000000-0000-0000-0000-000000000013';
  inbound_at constant timestamptz := now() - interval '48 hours';
  result record;
begin
  insert into public.whatsapp_chats(id, company_id, remote_jid)
    values (other_chat, foreign_tenant, '15550100101@s.whatsapp.net');
  insert into public.flow_sessions(id, flow_id, chat_id, status)
    values ('00000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000002', other_chat, 'completed');
  insert into public.automation_dispatch_attempts(kind, owner_id, send_key, lease_token, state, provider_message_id, acknowledged_at)
    values ('flow', '00000000-0000-0000-0000-000000000016', 'foreign', lease, 'acked', 'foreign-receipt', now());

  insert into public.whatsapp_messages
    (chat_id, company_id, timestamp, failed_at, is_from_me, status, type, origin, sender_id, message_id_external)
  values
    (chat, tenant, inbound_at, null, false, 'sent', 'text', 'provider_live', null, 'split-inbound'),
    (chat, tenant, now(), null, true, 'accepted', 'text', 'automation', null, 'split-unconfirmed'),
    (chat, tenant, now(), now(), true, 'sent', 'text', 'panel_manual', actor, 'split-failed-human'),
    (chat, tenant, now(), null, true, 'failed', 'text', 'automation', null, 'split-failed-bot'),
    (chat, tenant, now(), null, true, 'sent', 'reaction', 'automation', null, 'split-reaction'),
    (chat, tenant, now(), null, true, 'sent', 'text', 'provider_live', null, 'foreign-receipt'),
    (chat, tenant, now() + interval '1 second', null, true, 'sent', 'text', 'automation', null, 'split-future'),
    (chat, foreign_tenant, now(), null, true, 'sent', 'text', 'automation', null, 'split-foreign-row');

  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and result.without_team_message and result.last_team_message_at is null,
    'unconfirmed, failed, future, reaction and foreign messages or receipts affect neither clock';

  update public.whatsapp_messages set timestamp = now() - interval '168 hours', status = 'sent'
    where message_id_external = 'split-unconfirmed';
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and result.without_team_message and result.last_team_message_at = now() - interval '168 hours',
    'automation reaches the exact seven-day boundary';
  update public.whatsapp_messages set timestamp = now() - interval '168 hours' + interval '1 microsecond',
    status = 'accepted', provider_status = 'SERVER_ACK', provider_status_at = now()
    where message_id_external = 'split-unconfirmed';
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and not result.without_team_message and result.unanswered_hours = 48
    and result.last_team_message_at = now() - interval '168 hours' + interval '1 microsecond',
    'a real provider ACK resets only contact using the original message time';

  insert into public.whatsapp_messages
    (chat_id, company_id, timestamp, is_from_me, status, type, origin, sender_id, message_id_external)
  values (chat, tenant, now() - interval '1 hour', true, 'pending', 'text', 'provider_live', actor, 'split-echo');
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and result.last_team_message_at < inbound_at, 'unconfirmed echo affects neither clock';
  insert into public.automation_dispatch_attempts(kind, owner_id, send_key, lease_token, state, provider_message_id, acknowledged_at)
    values ('flow', owner, 'split-echo', lease, 'acked', 'split-echo', now()),
      ('flow', owner, 'split-failed', lease, 'acked', 'split-failed-bot', now());
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and result.last_team_message_at = now() - interval '1 hour',
    'local durable receipt confirms the echo, but cannot rescue a recorded failure';
  update public.whatsapp_messages set status = 'sent', origin = 'panel_manual'
    where message_id_external = 'split-echo';
  assert (select unanswered from public.operational_contact_cadence_status(tenant)),
    'an automation receipt takes precedence even over conflicting panel attribution';

  insert into public.whatsapp_messages
    (chat_id, company_id, timestamp, is_from_me, status, type, origin, sender_id, message_id_external, provider_status_at)
  values (chat, tenant, inbound_at - interval '1 second', true, 'read', 'text', 'panel_manual', actor, 'split-human', now());
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and result.first_unanswered_at = inbound_at,
    'late read receipt or later insertion cannot turn an earlier send into a reply';
  update public.whatsapp_messages set timestamp = inbound_at where message_id_external = 'split-human';
  assert (select unanswered from public.operational_contact_cadence_status(tenant)),
    'identical timestamps without a quote leave the inbound pending';
  update public.whatsapp_messages set quoted_message_external_id = 'split-inbound' where message_id_external = 'split-human';
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.first_unanswered_at is null and not result.unanswered and not result.without_team_message,
    'a confirmed human quote of the tied inbound proves reply order';

  insert into public.whatsapp_messages
    (chat_id, company_id, timestamp, is_from_me, status, type, origin, message_id_external)
  values (chat, tenant, inbound_at, false, 'sent', 'text', 'provider_live', 'split-inbound-tied'),
    (chat, tenant, inbound_at + interval '30 minutes', false, 'sent', 'text', 'provider_live', 'split-inbound-later');
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.first_unanswered_at = inbound_at and result.last_unanswered_at = inbound_at + interval '30 minutes',
    'reply at the same timestamp only clears the quoted inbound; later inbound stays pending';
  update public.whatsapp_messages set timestamp = inbound_at + interval '1 minute' where message_id_external = 'split-human';
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.first_unanswered_at = inbound_at + interval '30 minutes' and result.unanswered,
    'a strictly later human reply clears prior inbound and the next inbound starts a new clock';
end
$test$;

set local role authenticated;
do $access$
declare
  tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  foreign_tenant constant uuid := '00000000-0000-0000-0000-000000000009';
begin
  assert (select unanswered and not without_team_message from public.operational_contact_cadence_status(tenant)),
    'authorized tenant staff sees the split through the public RPC';
  assert not exists(select from public.operational_contact_cadence_status(foreign_tenant)), 'other tenant stays inaccessible';
  perform set_config('sett.test_actor', '00000000-0000-0000-0000-000000000015', true);
  assert not exists(select from public.operational_contact_cadence_status(tenant)), 'student cannot read cadence';
end
$access$;

rollback;
