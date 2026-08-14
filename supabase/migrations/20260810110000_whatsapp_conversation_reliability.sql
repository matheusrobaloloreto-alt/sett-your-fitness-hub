-- Keep the sales funnel, Brazilian WhatsApp identities and stored media reliable.

alter table public.students
  drop constraint if exists students_sales_stage_check;
alter table public.students
  add constraint students_sales_stage_check check (
    sales_stage is null or sales_stage in (
      'interested',
      'contacted',
      'fiscal_registration_pending',
      'payment_pending',
      'active_onboarding',
      'active',
      'lost'
    )
  );

alter table public.whatsapp_messages
  add column if not exists media_storage_path text;

alter table public.whatsapp_chats
  add column if not exists history_synced_at timestamptz;

update public.whatsapp_messages
set media_storage_path = regexp_replace(
  split_part(media_url, '?', 1),
  '^.*/whatsapp-media/',
  ''
)
where media_storage_path is null
  and media_url like '%/storage/v1/object/%/whatsapp-media/%';

create or replace function public.sett_phone_key(_value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  with cleaned as (
    select regexp_replace(_value, '[^0-9]', '', 'g') as raw_digits
  ), without_country as (
    select case
      when raw_digits like '55%' and length(raw_digits) in (12, 13)
        then substring(raw_digits from 3)
      when length(raw_digits) > 11
        then right(raw_digits, 11)
      else raw_digits
    end as digits
    from cleaned
  )
  select case
    when length(digits) = 10 and substring(digits from 3 for 1) in ('6', '7', '8', '9')
      then left(digits, 2) || '9' || right(digits, 8)
    when length(digits) in (10, 11)
      then digits
    else null
  end
  from without_country;
$$;

-- Re-link direct chats after normalizing Brazil's legacy 8/9 digit mobile JIDs.
with candidates as (
  select
    c.id as chat_id,
    (array_agg(s.id order by s.id))[1] as student_id,
    count(distinct s.id) as matches
  from public.whatsapp_chats c
  join public.students s
    on s.company_id = c.company_id
   and public.sett_phone_key(split_part(c.remote_jid, '@', 1)) in (
     public.sett_phone_key(s.whatsapp),
     public.sett_phone_key(s.phone)
   )
  where c.remote_jid like '%@s.whatsapp.net'
  group by c.id
)
update public.whatsapp_chats c
set student_id = candidate.student_id
from candidates candidate
where c.id = candidate.chat_id
  and candidate.matches = 1
  and c.student_id is distinct from candidate.student_id;

create temporary table whatsapp_chat_merge_map on commit drop as
with ranked as (
  select
    c.id as chat_id,
    first_value(c.id) over (
      partition by c.instance_id, public.sett_phone_key(split_part(c.remote_jid, '@', 1))
      order by (c.student_id is not null) desc, c.created_at asc, c.id asc
    ) as keeper_id
  from public.whatsapp_chats c
  where c.remote_jid like '%@s.whatsapp.net'
    and public.sett_phone_key(split_part(c.remote_jid, '@', 1)) is not null
)
select chat_id as duplicate_id, keeper_id
from ranked
where chat_id <> keeper_id;

-- Remove provider duplicates before moving rows into their canonical chat.
with ranked_messages as (
  select
    m.id,
    row_number() over (
      partition by coalesce(map.keeper_id, m.chat_id), m.message_id_external
      order by
        (m.media_storage_path is not null) desc,
        (m.media_url is not null) desc,
        (m.content is not null) desc,
        m.created_at asc,
        m.id asc
    ) as duplicate_rank
  from public.whatsapp_messages m
  left join whatsapp_chat_merge_map map on map.duplicate_id = m.chat_id
  where m.message_id_external is not null
)
delete from public.whatsapp_messages message
using ranked_messages ranked
where message.id = ranked.id
  and ranked.duplicate_rank > 1;

insert into public.whatsapp_chat_labels (chat_id, label_id)
select distinct map.keeper_id, labels.label_id
from public.whatsapp_chat_labels labels
join whatsapp_chat_merge_map map on map.duplicate_id = labels.chat_id
on conflict (chat_id, label_id) do nothing;

delete from public.whatsapp_chat_labels labels
using whatsapp_chat_merge_map map
where labels.chat_id = map.duplicate_id;

update public.whatsapp_messages messages
set chat_id = map.keeper_id
from whatsapp_chat_merge_map map
where messages.chat_id = map.duplicate_id;

update public.flow_sessions sessions
set chat_id = map.keeper_id
from whatsapp_chat_merge_map map
where sessions.chat_id = map.duplicate_id;

with members as (
  select keeper_id, keeper_id as member_id from whatsapp_chat_merge_map
  union
  select keeper_id, duplicate_id from whatsapp_chat_merge_map
), aggregate as (
  select
    members.keeper_id,
    max(chats.last_message_at) as last_message_at,
    sum(coalesce(chats.unread_count, 0)) as unread_count,
    (array_agg(chats.student_id order by (chats.student_id is not null) desc, chats.updated_at desc)
      filter (where chats.student_id is not null))[1] as student_id,
    (array_agg(chats.contact_name order by chats.last_message_at desc nulls last)
      filter (where chats.contact_name is not null))[1] as contact_name,
    (array_agg(chats.contact_photo order by chats.updated_at desc nulls last)
      filter (where chats.contact_photo is not null))[1] as contact_photo,
    max(chats.history_synced_at) as history_synced_at
  from members
  join public.whatsapp_chats chats on chats.id = members.member_id
  group by members.keeper_id
), latest_preview as (
  select distinct on (members.keeper_id)
    members.keeper_id,
    chats.last_message,
    chats.last_sender_id
  from members
  join public.whatsapp_chats chats on chats.id = members.member_id
  order by members.keeper_id, chats.last_message_at desc nulls last, chats.updated_at desc
)
update public.whatsapp_chats keeper
set
  last_message = latest_preview.last_message,
  last_message_at = aggregate.last_message_at,
  unread_count = aggregate.unread_count,
  student_id = coalesce(aggregate.student_id, keeper.student_id),
  contact_name = coalesce(aggregate.contact_name, keeper.contact_name),
  contact_photo = coalesce(aggregate.contact_photo, keeper.contact_photo),
  last_sender_id = latest_preview.last_sender_id,
  history_synced_at = aggregate.history_synced_at,
  updated_at = now()
from aggregate
join latest_preview on latest_preview.keeper_id = aggregate.keeper_id
where keeper.id = aggregate.keeper_id;

delete from public.whatsapp_chats chats
using whatsapp_chat_merge_map map
where chats.id = map.duplicate_id;

create unique index if not exists whatsapp_chats_instance_phone_key_key
  on public.whatsapp_chats (
    instance_id,
    public.sett_phone_key(split_part(remote_jid, '@', 1))
  )
  where remote_jid like '%@s.whatsapp.net'
    and public.sett_phone_key(split_part(remote_jid, '@', 1)) is not null;

create or replace function public.advance_whatsapp_contact_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat public.whatsapp_chats%rowtype;
  v_phone_key text;
  v_lead_id uuid;
  v_lead_matches integer;
begin
  if new.origin not in ('panel_manual', 'provider_live') then
    return new;
  end if;

  select * into v_chat
  from public.whatsapp_chats
  where id = new.chat_id;

  if v_chat.student_id is not null then
    update public.students
    set sales_stage = 'contacted', updated_at = greatest(updated_at, coalesce(new.timestamp, now()))
    where id = v_chat.student_id
      and company_id = new.company_id
      and sales_stage = 'interested';
  end if;

  if v_chat.remote_jid not like '%@s.whatsapp.net' then
    return new;
  end if;

  v_phone_key := public.sett_phone_key(split_part(v_chat.remote_jid, '@', 1));
  if v_phone_key is null then return new; end if;

  select (array_agg(leads.id order by leads.id))[1], count(distinct leads.id)
  into v_lead_id, v_lead_matches
  from public.leads
  where leads.company_id = new.company_id
    and leads.converted_to_student_id is null
    and public.sett_phone_key(leads.phone) = v_phone_key;

  if v_lead_matches = 1 then
    update public.leads
    set
      stage = 'contacted',
      contact_outcome = coalesce(contact_outcome, 'in_conversation'),
      contacted_at = coalesce(contacted_at, coalesce(new.timestamp, now())),
      last_contact_at = greatest(coalesce(last_contact_at, '-infinity'::timestamptz), coalesce(new.timestamp, now())),
      updated_at = greatest(updated_at, coalesce(new.timestamp, now()))
    where id = v_lead_id
      and stage = 'interested';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_advance_whatsapp_contact_stage on public.whatsapp_messages;
create trigger trg_advance_whatsapp_contact_stage
after insert on public.whatsapp_messages
for each row execute function public.advance_whatsapp_contact_stage();

revoke all on function public.advance_whatsapp_contact_stage() from public;

comment on column public.whatsapp_messages.media_storage_path is
  'Stable private-bucket path used to refresh expiring signed media URLs.';
comment on column public.whatsapp_chats.history_synced_at is
  'Last successful provider-history reconciliation for this conversation.';
