-- Idempotent acknowledgement for public pre-registration WhatsApp confirmations.
-- A lead is not a student yet, so this intentionally has no student_id and
-- cannot create a matrícula or infer any student relationship.

create table if not exists public.lead_funnel_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  status text not null default 'processing',
  payload jsonb not null default '{}'::jsonb,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, event_key),
  constraint lead_funnel_events_status_check
    check (status in ('processing', 'completed', 'failed'))
);

create index if not exists lead_funnel_events_company_created_idx
  on public.lead_funnel_events (company_id, created_at desc);

alter table public.lead_funnel_events enable row level security;
grant all on table public.lead_funnel_events to service_role;
revoke all on table public.lead_funnel_events from anon, authenticated;
