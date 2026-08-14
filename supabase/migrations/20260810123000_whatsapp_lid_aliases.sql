-- Persist WhatsApp LID aliases so provider history and live events reuse one conversation.

create table if not exists public.whatsapp_jid_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  alias_jid text not null,
  canonical_chat_id uuid not null references public.whatsapp_chats(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instance_id, alias_jid)
);

create index if not exists idx_whatsapp_jid_aliases_canonical_chat
  on public.whatsapp_jid_aliases (canonical_chat_id);

alter table public.whatsapp_jid_aliases enable row level security;
revoke all on table public.whatsapp_jid_aliases from anon, authenticated;

create temporary table whatsapp_lid_merge_map on commit drop as
with match_counts as (
  select
    lid_chat.id as duplicate_id,
    direct_chat.id as keeper_id,
    count(*) as shared_messages,
    direct_chat.created_at as keeper_created_at
  from public.whatsapp_chats lid_chat
  join public.whatsapp_messages lid_message on lid_message.chat_id = lid_chat.id
  join public.whatsapp_messages direct_message
    on direct_message.company_id = lid_message.company_id
   and direct_message.message_id_external = lid_message.message_id_external
   and direct_message.chat_id <> lid_message.chat_id
  join public.whatsapp_chats direct_chat on direct_chat.id = direct_message.chat_id
  where lid_chat.remote_jid like '%@lid'
    and direct_chat.remote_jid like '%@s.whatsapp.net'
    and direct_chat.company_id = lid_chat.company_id
    and direct_chat.instance_id = lid_chat.instance_id
    and lid_message.message_id_external is not null
  group by lid_chat.id, direct_chat.id, direct_chat.created_at
), ranked as (
  select
    duplicate_id,
    keeper_id,
    row_number() over (
      partition by duplicate_id
      order by shared_messages desc, keeper_created_at asc, keeper_id asc
    ) as match_rank
  from match_counts
)
select duplicate_id, keeper_id
from ranked
where match_rank = 1;

insert into public.whatsapp_jid_aliases (
  company_id,
  instance_id,
  alias_jid,
  canonical_chat_id
)
select
  duplicate.company_id,
  duplicate.instance_id,
  duplicate.remote_jid,
  map.keeper_id
from whatsapp_lid_merge_map map
join public.whatsapp_chats duplicate on duplicate.id = map.duplicate_id
on conflict (instance_id, alias_jid) do update
set
  canonical_chat_id = excluded.canonical_chat_id,
  company_id = excluded.company_id,
  updated_at = now();

delete from public.whatsapp_messages duplicate_message
using whatsapp_lid_merge_map map
where duplicate_message.chat_id = map.duplicate_id
  and duplicate_message.message_id_external is not null
  and exists (
    select 1
    from public.whatsapp_messages keeper_message
    where keeper_message.chat_id = map.keeper_id
      and keeper_message.message_id_external = duplicate_message.message_id_external
  );

insert into public.whatsapp_chat_labels (chat_id, label_id)
select distinct map.keeper_id, labels.label_id
from public.whatsapp_chat_labels labels
join whatsapp_lid_merge_map map on map.duplicate_id = labels.chat_id
on conflict (chat_id, label_id) do nothing;

delete from public.whatsapp_chat_labels labels
using whatsapp_lid_merge_map map
where labels.chat_id = map.duplicate_id;

update public.flow_sessions sessions
set chat_id = map.keeper_id
from whatsapp_lid_merge_map map
where sessions.chat_id = map.duplicate_id;

update public.whatsapp_messages messages
set chat_id = map.keeper_id
from whatsapp_lid_merge_map map
where messages.chat_id = map.duplicate_id;

update public.whatsapp_chats keeper
set
  last_message = case
    when duplicate.last_message_at is not null
      and (keeper.last_message_at is null or duplicate.last_message_at > keeper.last_message_at)
      then duplicate.last_message
    else keeper.last_message
  end,
  last_message_at = greatest(keeper.last_message_at, duplicate.last_message_at),
  last_sender_id = case
    when duplicate.last_message_at is not null
      and (keeper.last_message_at is null or duplicate.last_message_at > keeper.last_message_at)
      then duplicate.last_sender_id
    else keeper.last_sender_id
  end,
  unread_count = coalesce(keeper.unread_count, 0) + coalesce(duplicate.unread_count, 0),
  student_id = coalesce(keeper.student_id, duplicate.student_id),
  contact_name = coalesce(keeper.contact_name, duplicate.contact_name),
  contact_photo = coalesce(keeper.contact_photo, duplicate.contact_photo),
  history_synced_at = greatest(keeper.history_synced_at, duplicate.history_synced_at),
  updated_at = now()
from whatsapp_lid_merge_map map
join public.whatsapp_chats duplicate on duplicate.id = map.duplicate_id
where keeper.id = map.keeper_id;

delete from public.whatsapp_chats duplicate
using whatsapp_lid_merge_map map
where duplicate.id = map.duplicate_id;

comment on table public.whatsapp_jid_aliases is
  'Private provider identity map from WhatsApp LID aliases to canonical direct chats.';
