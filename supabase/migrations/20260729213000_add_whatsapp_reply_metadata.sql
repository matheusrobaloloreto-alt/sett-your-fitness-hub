-- Store reply/quote metadata for WhatsApp messages.
alter table public.whatsapp_messages
  add column if not exists quoted_message_id uuid references public.whatsapp_messages(id) on delete set null,
  add column if not exists quoted_message_external_id text,
  add column if not exists quoted_message_preview text,
  add column if not exists quoted_message_source text;

create index if not exists idx_whatsapp_messages_quoted_message_id
  on public.whatsapp_messages (quoted_message_id);

create index if not exists idx_whatsapp_messages_quoted_external
  on public.whatsapp_messages (company_id, quoted_message_external_id)
  where quoted_message_external_id is not null;
