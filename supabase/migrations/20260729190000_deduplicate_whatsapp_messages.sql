-- Prevent the panel insert and Evolution webhook from persisting the same
-- provider message twice when both requests finish at nearly the same time.

with ranked_messages as (
  select
    id,
    row_number() over (
      partition by chat_id, message_id_external
      order by
        (media_url is not null) desc,
        (content is not null) desc,
        created_at asc,
        id asc
    ) as duplicate_rank
  from public.whatsapp_messages
  where message_id_external is not null
)
delete from public.whatsapp_messages as message
using ranked_messages as ranked
where message.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists whatsapp_messages_chat_external_id_key
  on public.whatsapp_messages (chat_id, message_id_external)
  where message_id_external is not null;

comment on index public.whatsapp_messages_chat_external_id_key is
  'Deduplicates Evolution API messages across panel sends and webhook delivery.';
