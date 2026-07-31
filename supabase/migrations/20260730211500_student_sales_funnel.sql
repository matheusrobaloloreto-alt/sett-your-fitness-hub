-- Sales funnel for the public fiscal-registration -> Asaas checkout -> onboarding flow.
-- Public tokens remain service-role only; staff can read the append-only event trail.

alter table public.students
  add column if not exists sales_stage text,
  add column if not exists fiscal_completed_at timestamptz,
  add column if not exists payment_link_sent_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists assessment_due_at date,
  add column if not exists onboarding_instructions_sent_at timestamptz;

update public.students
set sales_stage = case
  when status = 'active' then 'active'
  when status = 'awaiting_renewal' then 'active'
  when status = 'inactive' then 'lost'
  else 'payment_pending'
end
where sales_stage is null;

alter table public.students
  alter column sales_stage set default 'interested';

alter table public.students
  drop constraint if exists students_sales_stage_check;
alter table public.students
  add constraint students_sales_stage_check check (
    sales_stage is null or sales_stage in (
      'interested',
      'fiscal_registration_pending',
      'payment_pending',
      'active_onboarding',
      'active',
      'lost'
    )
  );

create index if not exists idx_students_company_sales_stage
  on public.students (company_id, sales_stage, created_at desc);

create table if not exists public.public_registration_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  completed_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint public_registration_links_expiry_after_creation check (expires_at > created_at)
);

create index if not exists idx_public_registration_links_student_active
  on public.public_registration_links (student_id, created_at desc)
  where revoked_at is null and completed_at is null;
create index if not exists idx_public_registration_links_company
  on public.public_registration_links (company_id, created_at desc);

alter table public.public_registration_links enable row level security;
revoke all on table public.public_registration_links from public, anon, authenticated;
grant all on table public.public_registration_links to service_role;

create table if not exists public.student_funnel_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  status text not null default 'completed'
    check (status in ('processing', 'completed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (student_id, event_key)
);

create index if not exists idx_student_funnel_events_company_time
  on public.student_funnel_events (company_id, created_at desc);
create index if not exists idx_student_funnel_events_student_time
  on public.student_funnel_events (student_id, created_at desc);

alter table public.student_funnel_events enable row level security;
revoke all on table public.student_funnel_events from public, anon;
grant select on table public.student_funnel_events to authenticated;
grant all on table public.student_funnel_events to service_role;

drop policy if exists "Company staff read student funnel events" on public.student_funnel_events;
create policy "Company staff read student funnel events"
  on public.student_funnel_events
  for select
  to authenticated
  using (
    public.is_company_staff(auth.uid(), company_id)
    or public.has_role(auth.uid(), 'master'::public.app_role)
  );
