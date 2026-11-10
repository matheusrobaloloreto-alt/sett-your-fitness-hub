begin;

-- The public reader still resolves chat and student visibility under RLS.
-- This private worker aggregates only those chats after authorizing the
-- company and WhatsApp module once, instead of rechecking each message.
create function commercial_private.contact_cadence_message_times(_company_id uuid, _chat_ids uuid[])
returns table (
  chat_id uuid,
  first_unanswered_at timestamptz,
  last_unanswered_at timestamptz,
  last_team_message_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $function$
begin
  if coalesce(cardinality(_chat_ids), 0) = 0 or not coalesce((
    public.is_company_staff(auth.uid(), _company_id)
    and public.company_feature_allowed(_company_id, 'hasWhatsApp')
    and (
      public.has_role(auth.uid(), 'master'::public.app_role)
      or public.has_role(auth.uid(), 'admin'::public.app_role)
      or exists (
        select 1 from public.user_roles actor
        join public.role_permissions permission on permission.role = actor.role::text
          and permission.company_id = _company_id
        where actor.user_id = auth.uid() and actor.role in ('trainer', 'coordinator')
          and permission.module = 'whatsapp' and permission.enabled is true
      )
    )
  ), false) then
    return;
  end if;

  return query
  select c.id, first_incoming.first_unanswered_at, last_incoming.last_unanswered_at,
    outgoing.last_team_message_at
  from public.whatsapp_chats c
  left join lateral (
    select m.timestamp as last_team_message_at
    from public.whatsapp_messages m
    where m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is true and m.failed_at is null
      and nullif(btrim(m.message_id_external), '') is not null
      and (
        m.status in ('sent', 'delivered', 'read')
        or (m.status = 'accepted' and m.provider_status in ('SERVER_ACK', 'SENT')
          and m.provider_status_at is not null)
      )
      and m.type is distinct from 'reaction'
      and isfinite(m.timestamp) and m.timestamp <= now()
      -- Webhook echoes have no outgoing sender. Match a trusted panel origin
      -- or a staff actor in legacy/provider rows, then exclude known automation.
      and case when m.sender_id::text ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        m.origin = 'panel_manual' or (
          m.origin in ('provider_live', 'provider_history_sync', 'unknown')
          and public.is_company_staff(m.sender_id::uuid, m.company_id)
          and not public.is_automated_cadence_receipt(m.company_id, m.chat_id, m.message_id_external)
        )
        else false
      end
    order by m.timestamp desc
    limit 1
  ) outgoing on true
  left join lateral (
    select m.timestamp as first_unanswered_at
    from public.whatsapp_messages m
    where m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is false and m.type is distinct from 'reaction'
      and isfinite(m.timestamp) and m.timestamp <= now()
      and m.timestamp > coalesce(outgoing.last_team_message_at, '-infinity'::timestamptz)
    order by m.timestamp
    limit 1
  ) first_incoming on true
  left join lateral (
    select m.timestamp as last_unanswered_at
    from public.whatsapp_messages m
    where first_incoming.first_unanswered_at is not null
      and m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is false and m.type is distinct from 'reaction'
      and isfinite(m.timestamp) and m.timestamp <= now()
      and m.timestamp >= first_incoming.first_unanswered_at
    order by m.timestamp desc
    limit 1
  ) last_incoming on true
  where c.company_id = _company_id and c.id = any(_chat_ids);
end;
$function$;

revoke all on function commercial_private.contact_cadence_message_times(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function commercial_private.contact_cadence_message_times(uuid, uuid[]) to authenticated;

create or replace function public.operational_contact_cadence_status(_company_id uuid, _student_ids uuid[] default null)
returns table (
  chat_id uuid,
  contact_name text,
  student_id uuid,
  student_name text,
  student_status text,
  first_unanswered_at timestamptz,
  last_unanswered_at timestamptz,
  last_team_message_at timestamptz,
  chat_created_at timestamptz,
  unanswered_hours numeric,
  unanswered boolean,
  without_team_message boolean
)
language sql stable security invoker
set search_path = ''
begin atomic
  with eligible_chats as materialized (
    select c.id, c.contact_name, c.student_id, c.created_at, s.full_name, s.status
    from public.whatsapp_chats c
    left join public.students s on s.id = c.student_id and s.company_id = c.company_id
    where c.company_id = _company_id
      and (_student_ids is null or c.student_id = any(_student_ids))
      and public.is_company_staff(auth.uid(), _company_id)
      and public.company_feature_allowed(_company_id, 'hasWhatsApp')
      and (
        public.has_role(auth.uid(), 'master'::public.app_role)
        or public.has_role(auth.uid(), 'admin'::public.app_role)
        or exists (
          select 1 from public.user_roles actor
          join public.role_permissions permission on permission.role = actor.role::text
            and permission.company_id = _company_id
          where actor.user_id = auth.uid() and actor.role in ('trainer', 'coordinator')
            and permission.module = 'whatsapp' and permission.enabled is true
        )
      )
      and c.cadence_muted is not true and c.is_archived is not true
      and c.remote_jid not like '%@g.us'
      and (c.student_id is null or s.status in ('active', 'pending', 'awaiting_renewal', 'awaiting_training'))
  ), message_times as materialized (
    select *
    from commercial_private.contact_cadence_message_times(_company_id, array(select id from eligible_chats))
  ), closures as materialized (
    select closed
    from commercial_private.contact_cadence_closures(_company_id) as closed
    where lower(closed) < now()
  )
  select c.id, c.contact_name, c.student_id, c.full_name, c.status,
    times.first_unanswered_at, times.last_unanswered_at, times.last_team_message_at, c.created_at,
    elapsed.unanswered_seconds / 3600.0,
    coalesce(elapsed.unanswered_seconds >= 86400, false),
    c.student_id is not null and coalesce(elapsed.without_team_seconds >= 604800, false)
  from eligible_chats c
  join message_times times on times.chat_id = c.id
  cross join lateral (
    select coalesce(times.last_team_message_at,
      case when isfinite(c.created_at) and c.created_at <= now() then c.created_at end,
      times.first_unanswered_at) as without_team_since
  ) clocks
  cross join lateral (
    select
      sum(greatest(interval '0', least(now(), upper(closed))
        - greatest(times.first_unanswered_at, lower(closed)))) as unanswered_pause,
      sum(greatest(interval '0', least(now(), upper(closed))
        - greatest(clocks.without_team_since, lower(closed)))) as without_team_pause
    from closures
    where upper(closed) > least(times.first_unanswered_at, clocks.without_team_since)
  ) pauses
  cross join lateral (
    select
      extract(epoch from (now() - times.first_unanswered_at - coalesce(pauses.unanswered_pause, interval '0'))) as unanswered_seconds,
      extract(epoch from (now() - clocks.without_team_since - coalesce(pauses.without_team_pause, interval '0'))) as without_team_seconds
  ) elapsed;
end;

commit;
