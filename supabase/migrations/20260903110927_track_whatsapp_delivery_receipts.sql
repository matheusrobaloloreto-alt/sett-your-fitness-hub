alter table public.whatsapp_messages
  add column if not exists provider_status text,
  add column if not exists provider_status_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz;

create index if not exists idx_whatsapp_messages_company_external_delivery
  on public.whatsapp_messages (company_id, message_id_external)
  where message_id_external is not null and is_from_me is true;

comment on column public.whatsapp_messages.provider_status is
  'Latest provider acknowledgement label; contains no webhook payload or recipient data.';
