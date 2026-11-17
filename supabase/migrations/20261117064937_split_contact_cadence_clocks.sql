begin;

-- Keep the RPC shape and grants. last_team_message_at is the contact clock;
-- the human reply boundary stays internal. No message data is rewritten.
-- To revert, replace this worker with its definition from 20261110120200.
create or replace function commercial_private.contact_cadence_message_times(_company_id uuid, _chat_ids uuid[])
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
    outgoing.last_contact_at
  from public.whatsapp_chats c
  cross join lateral (
    with outbound as not materialized (
      select m.timestamp, m.origin, m.sender_id, m.quoted_message_id, m.quoted_message_external_id,
        coalesce(m.status in ('sent', 'delivered', 'read') or (
          m.status = 'accepted' and m.provider_status in ('SERVER_ACK', 'SENT')
          and isfinite(m.provider_status_at) and m.provider_status_at <= now()
        ), false) as confirmed,
        public.is_automated_cadence_receipt(m.company_id, m.chat_id, m.message_id_external) as automated_receipt
      from public.whatsapp_messages m
      where m.chat_id = c.id and m.company_id = c.company_id
        and m.is_from_me is true and m.failed_at is null
        and coalesce(m.status, '') not in ('failed', 'deleted')
        and coalesce(m.provider_status, '') not in ('ERROR', 'FAILED', 'DELETED')
        and nullif(btrim(m.message_id_external), '') is not null
        and m.type is distinct from 'reaction'
        and isfinite(m.timestamp) and m.timestamp <= now()
    ), human as not materialized (
      select o.*
      from outbound o
      where o.confirmed
        and case when o.sender_id::text ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
          o.origin = 'panel_manual' or (
            o.origin in ('provider_live', 'provider_history_sync', 'unknown')
            and public.is_company_staff(o.sender_id::uuid, c.company_id)
          )
          else false
        end
        and not o.automated_receipt
    ), latest_human as materialized (
      select (select h.timestamp from human h order by h.timestamp desc limit 1) as replied_at
    )
    select h.replied_at,
      greatest(h.replied_at, (
        select o.timestamp
        from outbound o
        where o.timestamp > coalesce(h.replied_at, '-infinity'::timestamptz)
          -- A matched durable ack also confirms a projection that still shows pending.
          -- Use the message time, not the time of a later ack or read receipt.
          and (o.automated_receipt or (o.origin = 'automation' and o.confirmed))
        order by o.timestamp desc
        limit 1
      )) as last_contact_at,
      -- Provider timestamps can tie to the second. Only an explicit quote
      -- of the inbound proves precedence in that case.
      array(select q.quoted_message_id from human q
        where q.timestamp = h.replied_at and q.quoted_message_id is not null) as quoted_ids,
      array(select q.quoted_message_external_id from human q
        where q.timestamp = h.replied_at and q.quoted_message_id is null
          and nullif(btrim(q.quoted_message_external_id), '') is not null) as quoted_external_ids
    from latest_human h
  ) outgoing
  left join lateral (
    select m.timestamp as first_unanswered_at
    from public.whatsapp_messages m
    where m.chat_id = c.id and m.company_id = c.company_id
      and m.is_from_me is false and m.type is distinct from 'reaction'
      and isfinite(m.timestamp) and m.timestamp <= now()
      and m.timestamp >= coalesce(outgoing.replied_at, '-infinity'::timestamptz)
      and (m.timestamp is distinct from outgoing.replied_at or (
        not (m.id = any(outgoing.quoted_ids))
        and not coalesce(m.message_id_external = any(outgoing.quoted_external_ids), false)
      ))
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

commit;
