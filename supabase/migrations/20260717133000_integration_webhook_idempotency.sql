create table if not exists public.integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'asaas', 'whatsapp')),
  event_id text not null,
  event_type text,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index if not exists idx_integration_webhook_events_received
  on public.integration_webhook_events(provider, received_at desc);
alter table public.integration_webhook_events enable row level security;
revoke all on public.integration_webhook_events from anon, authenticated;
grant all on public.integration_webhook_events to service_role;
