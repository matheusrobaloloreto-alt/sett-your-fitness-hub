begin;

-- Optional per-flow spacing may only make the mandatory company interval stricter.
-- Zero preserves the previous behavior. Existing inactivity settings are untouched.
alter table public.automation_flows
  add column weekly_contact_interval_hours integer not null default 0
  check (weekly_contact_interval_hours between 0 and 720);

-- Match the WhatsApp graph editor's tenant and module permission for these
-- settings. Protect non-default inserts as well as changes to existing rules.
create function commercial_private.guard_weekly_contact_conditions_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  caller_role text := current_setting('role', true);
begin
  if new.company_id is null then
    raise exception 'weekly_contact_conditions_forbidden' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.company_id is distinct from new.company_id then
    raise exception 'weekly_contact_conditions_forbidden' using errcode = '42501';
  end if;
  if caller_role = 'service_role'
    or (session_user = 'postgres' and caller_role in ('none', 'postgres')) then
    return new;
  end if;
  if coalesce(public.is_company_staff(actor, new.company_id), false) and (
    public.has_role(actor, 'master'::public.app_role)
    or public.has_role(actor, 'admin'::public.app_role)
    or exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role = ur.role::text and rp.company_id = new.company_id
      where ur.user_id = actor and ur.role in ('coordinator', 'trainer')
        and rp.module = 'whatsapp' and rp.enabled is true
    )
  ) then
    return new;
  end if;
  raise exception 'weekly_contact_conditions_forbidden' using errcode = '42501';
end $$;

revoke all on function commercial_private.guard_weekly_contact_conditions_write() from public, anon, authenticated;

create trigger guard_weekly_contact_conditions_insert
before insert on public.automation_flows for each row
when (new.weekly_contact_interval_hours <> 0 or new.weekly_contact_inactivity_hours <> 0)
execute function commercial_private.guard_weekly_contact_conditions_write();

create trigger guard_weekly_contact_conditions_update
before update on public.automation_flows for each row
when (old.weekly_contact_interval_hours is distinct from new.weekly_contact_interval_hours
   or old.weekly_contact_inactivity_hours is distinct from new.weekly_contact_inactivity_hours)
execute function commercial_private.guard_weekly_contact_conditions_write();

-- The scheduler and final dispatch authorization already share this guard.
-- Replacing its body preserves ACLs, queue behavior and dispatch locking.
create or replace function public.weekly_contact_eligibility(_flow_id uuid, _chat_id uuid, _student_id uuid,
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
          and m.origin is distinct from 'automation'
          and not public.has_automated_whatsapp_receipt(m.company_id, m.chat_id, m.message_id_external))))
  ) then return 'weekly_contact_conversation_active'; end if;

  select contacts_last_7d, last_contact_at into recent_count, latest_contact
    from public.weekly_contact_history(flow.company_id, _student_id, chat.id, _owner_id, _at);
  if recent_count >= public.company_communication_number(flow.company_id, 'max_weekly_contacts', 2, 1, 2)
    or latest_contact > _at - make_interval(hours => greatest(
      public.company_communication_number(flow.company_id, 'minimum_interval_hours', 72, 72, 168),
      flow.weekly_contact_interval_hours))
  then return 'weekly_contact_interval_blocked'; end if;
  return 'eligible';
end $$;

commit;
