-- Opaque, expiring checkout links. Public clients never receive a student UUID as
-- the authorization primitive for payment operations.
create table if not exists public.public_payment_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint public_payment_links_expiry_after_creation check (expires_at > created_at)
);
create index if not exists idx_public_payment_links_student_active
  on public.public_payment_links (student_id, created_at desc)
  where revoked_at is null;
create index if not exists idx_public_payment_links_company
  on public.public_payment_links (company_id, created_at desc);
alter table public.public_payment_links enable row level security;
-- Checkout tokens are resolved exclusively inside service-role edge functions.
-- Keeping the table unavailable through PostgREST also prevents token inventory leaks.
revoke all on table public.public_payment_links from public, anon, authenticated;
grant all on table public.public_payment_links to service_role;
-- This SECURITY DEFINER function previously allowed an anonymous caller to insert
-- recovery events for any known student UUID. Only trusted backend code may call it.
revoke all on function public.record_payment_recovery_event(uuid, text, uuid, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_payment_recovery_event(uuid, text, uuid, uuid, uuid, jsonb, text)
  to service_role;
