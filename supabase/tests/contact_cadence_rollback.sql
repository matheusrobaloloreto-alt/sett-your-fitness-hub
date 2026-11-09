-- Run through scripts/qa/whatsapp-dispatch-guards.test.mjs, whose disposable
-- PostgreSQL fixture supplies these synthetic IDs and the auth.uid() shim.
begin;
set local plpgsql.check_asserts = on;
set local timezone = 'UTC';

do $test$
declare
  tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  foreign_tenant constant uuid := '00000000-0000-0000-0000-000000000009';
  chat constant uuid := '00000000-0000-0000-0000-000000000003';
  student constant uuid := '00000000-0000-0000-0000-000000000004';
  actor constant uuid := '00000000-0000-0000-0000-000000000008';
  zone constant text := 'Pacific/Honolulu';
  local_day date := (now() at time zone zone)::date;
  first_inbound timestamptz := now() - interval '24 hours';
  result record;
  next_status text;
begin
  update public.whatsapp_chats set created_at = now() - interval '168 hours' where id = chat;
  insert into public.whatsapp_messages
  values (chat, tenant, first_inbound + interval '1 microsecond', null, false, 'sent', 'text', 'provider_live', null, 'first'),
    (chat, tenant, now() - interval '1 hour', null, false, 'sent', 'text', 'provider_live', null, 'second');

  assert (select hours_since < 24 from public.contact_cadence(tenant)), 'below 24h in legacy projection';
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert not result.unanswered and result.without_team_message, 'just below 24h and exact 168h with no calendar row';
  assert result.first_unanswered_at = first_inbound + interval '1 microsecond', 'a later inbound does not reset the clock';
  assert result.last_unanswered_at = now() - interval '1 hour', 'last inbound remains available';
  assert (select last_inbound_at = result.last_unanswered_at from public.contact_cadence(tenant)), 'legacy projection keeps the last inbound';
  update public.whatsapp_messages set timestamp = first_inbound where message_id_external = 'first';
  update public.whatsapp_chats set created_at = created_at + interval '1 microsecond' where id = chat;
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and not result.without_team_message, 'exactly 24h and just below 168h';
  assert (select hours_since = 24 from public.contact_cadence(tenant)), 'legacy projection agrees at the boundary';

  insert into public.company_agenda_availability(company_id, settings, version, updated_by)
  values (tenant, public.validate_company_agenda_availability(jsonb_build_object(
    'timezone', zone, 'weekly', '[]'::jsonb, 'exceptions', jsonb_build_array(
      jsonb_build_object('date', local_day - 2, 'windows', '[]'::jsonb),
      jsonb_build_object('date', local_day - 1, 'windows', '[]'::jsonb),
      jsonb_build_object('date', local_day, 'windows', '[{"start":"09:00","end":"10:00"}]'::jsonb)
    ))), 1, actor);
  -- Same date in a different company is irrelevant even to an actor with both memberships.
  insert into public.company_agenda_availability(company_id, settings, version, updated_by)
  values (foreign_tenant, jsonb_build_object('timezone', zone, 'exceptions',
    jsonb_build_array(jsonb_build_object('date', local_day, 'windows', '[]'::jsonb))), 1, actor);
  insert into public.company_members values (actor, foreign_tenant);
  first_inbound := now() - interval '72 hours';
  update public.whatsapp_messages set timestamp = first_inbound + interval '1 microsecond' where message_id_external = 'first';
  update public.whatsapp_chats set created_at = now() - interval '216 hours' + interval '1 microsecond' where id = chat;
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert not result.unanswered and not result.without_team_message, 'both clocks one microsecond short after two consecutive closures';
  update public.whatsapp_messages set timestamp = first_inbound where message_id_external = 'first';
  update public.whatsapp_chats set created_at = now() - interval '216 hours' where id = chat;
  select * into strict result from public.operational_contact_cadence_status(tenant, array[student]);
  assert result.unanswered and result.without_team_message, 'both clocks hit the exact limit after the pause';
  assert result.unanswered_hours = 24, 'partial exception and weekly availability do not pause';
  assert (select hours_since = 24 from public.contact_cadence(tenant)), 'Carteira and legacy card receive adjusted hours';
  assert (commercial_private.get_company_dashboard_snapshot(tenant)->'contactCadence'->0->>'hours_since')::numeric = 24,
    'read-only snapshot receives adjusted hours';

  update public.whatsapp_messages
  set timestamp = (local_day - 1)::timestamp at time zone zone where message_id_external = 'first';
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered_hours = extract(epoch from (now() - (local_day::timestamp at time zone zone))) / 3600.0,
    'a clock started during a closure resumes at local midnight, not UTC';
  update public.whatsapp_messages set timestamp = first_inbound where message_id_external = 'first';

  insert into public.whatsapp_messages values
    (chat, tenant, now() - interval '1 minute', null, true, 'accepted', 'text', 'panel_manual', actor, 'manual'),
    (chat, tenant, now(), now(), true, 'sent', 'text', 'panel_manual', actor, 'failed'),
    (chat, tenant, now(), null, true, 'read', 'text', 'automation', null, 'automated'),
    (chat, tenant, now(), null, true, 'sent', 'reaction', 'panel_manual', actor, 'reaction'),
    (chat, tenant, now(), null, true, 'sent', 'text', 'unknown', null, 'unknown'),
    (chat, tenant, now() + interval '1 hour', null, true, 'sent', 'text', 'panel_manual', actor, 'future'),
    (chat, foreign_tenant, now(), null, true, 'sent', 'text', 'panel_manual', actor, 'foreign');
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered and result.without_team_message and result.last_team_message_at is null,
    'pending, failed, automation, reactions, unattributed, future and foreign sends do not reset clocks';

  foreach next_status in array array['sent', 'delivered', 'read'] loop
    update public.whatsapp_messages set status = next_status where message_id_external = 'manual';
    select * into strict result from public.operational_contact_cadence_status(tenant);
    assert not result.unanswered and not result.without_team_message
      and result.first_unanswered_at is null and result.last_team_message_at = now() - interval '1 minute',
      'a confirmed human send resets both clocks and receipt upgrades retain the send time';
  end loop;
  insert into public.whatsapp_messages values
    (chat, tenant, now(), null, true, 'sent', 'text', 'provider_live', null, 'manual'),
    (chat, tenant, now(), null, false, 'sent', 'text', 'provider_live', null, 'first')
    on conflict do nothing;
  assert (select last_team_message_at = now() - interval '1 minute' from public.operational_contact_cadence(tenant)),
    'a duplicate provider delivery cannot move the clock';

  update public.whatsapp_messages set timestamp = now() where message_id_external = 'second';
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.first_unanswered_at = now() and result.unanswered_hours = 0 and not result.unanswered,
    'inbound after confirmed human send starts a fresh unanswered clock';

  delete from public.whatsapp_messages where chat_id = chat;
  update public.whatsapp_chats set created_at = null where id = chat;
  select * into strict result from public.operational_contact_cadence_status(tenant);
  assert result.unanswered_hours is null and not result.unanswered and not result.without_team_message,
    'unknown dates do not generate alerts';

  -- One civil date during the DST jump is only 23 elapsed hours.
  update public.company_agenda_availability
  set settings = '{"timezone":"America/New_York","exceptions":[{"date":"2025-03-09","windows":[]}]}'
  where company_id = tenant;
  insert into public.whatsapp_messages values
    (chat, tenant, '2025-03-09 05:00+00', null, false, 'sent', 'text', 'provider_live', null, 'dst');
  assert (select hours_since = extract(epoch from now() - timestamptz '2025-03-10 04:00+00') / 3600.0
    from public.contact_cadence(tenant)), '23-hour civil closure across DST';

  update public.whatsapp_chats set cadence_muted = true where id = chat;
  assert not exists(select from public.operational_contact_cadence_status(tenant)), 'muted chat excluded';
  update public.whatsapp_chats set cadence_muted = false, is_archived = true where id = chat;
  assert not exists(select from public.operational_contact_cadence_status(tenant)), 'archived chat excluded';
  update public.whatsapp_chats set is_archived = false, remote_jid = 'group@g.us' where id = chat;
  assert not exists(select from public.operational_contact_cadence_status(tenant)), 'group chat excluded';
  update public.whatsapp_chats set remote_jid = '15550100100@s.whatsapp.net', student_id = null,
    created_at = now() - interval '200 hours' where id = chat;
  assert (select unanswered and not without_team_message from public.operational_contact_cadence_status(tenant)),
    'lead remains in the unanswered queue only';
  update public.whatsapp_chats set student_id = student where id = chat;
  assert not exists(select from public.operational_contact_cadence_status(tenant, array[]::uuid[])), 'empty student scope stays empty';

  delete from public.company_members where user_id = actor and company_id = foreign_tenant;
  insert into public.whatsapp_chats(id, company_id, remote_jid) values
    ('00000000-0000-0000-0000-000000000013', foreign_tenant, '15550100101@s.whatsapp.net');
end
$test$;

set local role authenticated;
do $access$
declare
  tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  foreign_tenant constant uuid := '00000000-0000-0000-0000-000000000009';
begin
  assert not has_schema_privilege(current_user, 'commercial_private', 'usage'), 'private schema is not exposed';
  assert not has_table_privilege(current_user, 'public.company_agenda_availability', 'select'), 'no agenda table access granted';
  assert (select unanswered from public.operational_contact_cadence_status(tenant)), 'authenticated admin can call through to private helper';
  assert (select hours_since = extract(epoch from now() - timestamptz '2025-03-10 04:00+00') / 3600.0
    from public.contact_cadence(tenant)), 'staff RPC uses the closure without calendar table privileges';
  assert not exists(select from public.operational_contact_cadence_status(foreign_tenant)), 'authenticated admin cannot read another tenant';
  perform set_config('sett.test_actor', '00000000-0000-0000-0000-000000000014', true);
  assert (select unanswered from public.operational_contact_cadence_status(tenant)), 'trainer with explicit WhatsApp access can read own company';
  assert jsonb_array_length(public.get_company_dashboard_snapshot(tenant)->'contactCadence') = 1,
    'trainer with explicit WhatsApp access sees the cadence projection';
  perform set_config('sett.test_actor', '', true);
  assert not exists(select from public.operational_contact_cadence_status(tenant)), 'missing actor is denied';
end
$access$;

reset role;
update public.role_permissions set enabled = false where role = 'trainer' and module = 'whatsapp';
set local role authenticated;
do $module$
declare
  tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  snapshot jsonb;
begin
  perform set_config('sett.test_actor', '00000000-0000-0000-0000-000000000014', true);
  snapshot := public.get_company_dashboard_snapshot(tenant);
  assert snapshot->'contactCadence' = '[]'::jsonb and snapshot->>'dashboardMarker' = 'preserved',
    'dashboard-only trainer sees dashboard data with no contacts';
  assert not exists(select from public.operational_contact_cadence_status(tenant)),
    'dashboard-only trainer cannot bypass module permission through the direct RPC';
end
$module$;

reset role;
update public.role_permissions set enabled = true where role = 'trainer' and module = 'whatsapp';
insert into public.fixture_company_features values
  ('00000000-0000-0000-0000-000000000001', 'hasWhatsApp', false);
set local role authenticated;
do $feature$
declare
  tenant constant uuid := '00000000-0000-0000-0000-000000000001';
  actor uuid;
  snapshot jsonb;
begin
  foreach actor in array array[
    '00000000-0000-0000-0000-000000000008'::uuid, '00000000-0000-0000-0000-000000000014'::uuid
  ] loop
    perform set_config('sett.test_actor', actor::text, true);
    assert public.company_feature_allowed(tenant, 'hasDashboard') and not public.company_feature_allowed(tenant, 'hasWhatsApp'),
      'dashboard allowed with WhatsApp disabled';
    assert not exists(select from public.whatsapp_chats where company_id = tenant), 'WhatsApp RLS rejects the role';
    assert not exists(select from public.operational_contact_cadence_status(tenant)), 'status RPC rejects the role';
    snapshot := public.get_company_dashboard_snapshot(tenant);
    assert snapshot->'contactCadence' = '[]'::jsonb and snapshot->>'dashboardMarker' = 'preserved',
      'admin and trainer receive only entitled dashboard data from the definer snapshot';
  end loop;
end
$feature$;

reset role;
delete from public.fixture_company_features where feature = 'hasWhatsApp';
-- A staff role does not override a stricter chat policy.
create policy cadence_fixture_trainer_scope on public.whatsapp_chats as restrictive for select to authenticated
  using (auth.uid() is distinct from '00000000-0000-0000-0000-000000000014'::uuid);
-- Model an accidentally broad table policy to exercise the RPC's own staff gate.
create policy cadence_fixture_members_read_chats on public.whatsapp_chats for select to authenticated
  using (exists(select 1 from public.company_members m
    where m.user_id = auth.uid() and m.company_id = whatsapp_chats.company_id));
set local role authenticated;
do $role_scope$
declare
  tenant constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  perform set_config('sett.test_actor', '00000000-0000-0000-0000-000000000014', true);
  assert not exists(select from public.operational_contact_cadence_status(tenant)), 'RPC respects restrictive trainer RLS';
  perform set_config('sett.test_actor', '00000000-0000-0000-0000-000000000015', true);
  assert exists(select from public.whatsapp_chats where company_id = tenant), 'same-tenant student can see fixture row under broad policy';
  assert not exists(select from public.operational_contact_cadence_status(tenant)), 'status RPC denies student despite broad table policy';
  assert not exists(select from public.operational_contact_cadence(tenant)), 'legacy operational RPC also denies student';
  assert not exists(select from public.contact_cadence(tenant)), 'legacy list RPC also denies student';
end
$role_scope$;

set local role anon;
do $anonymous$
begin
  assert not has_function_privilege(current_user, 'public.operational_contact_cadence_status(uuid, uuid[])', 'execute'),
    'anonymous RPC denied';
end
$anonymous$;
rollback;
