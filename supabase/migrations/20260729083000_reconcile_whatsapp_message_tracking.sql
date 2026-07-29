-- Reconcile columns already consumed by the WhatsApp manager, automation
-- dispatcher and CRM filters. Both changes are additive and preserve data.

alter table public.whatsapp_messages
  add column if not exists origin text not null default 'unknown';

alter table public.whatsapp_chats
  add column if not exists last_sender_id uuid;

create index if not exists idx_whatsapp_messages_origin
  on public.whatsapp_messages (company_id, origin, timestamp desc);

create index if not exists idx_whatsapp_chats_last_sender
  on public.whatsapp_chats (company_id, last_sender_id)
  where last_sender_id is not null;
