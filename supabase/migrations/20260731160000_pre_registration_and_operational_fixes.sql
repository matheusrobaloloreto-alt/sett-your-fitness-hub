-- Operational fixes: master presence and the public pre-registration lead funnel.

alter table public.staff_sessions
  drop constraint if exists staff_sessions_role_check;

alter table public.staff_sessions
  add constraint staff_sessions_role_check
  check (role in (
    'master'::app_role,
    'admin'::app_role,
    'coordinator'::app_role,
    'trainer'::app_role
  ));

alter table public.leads
  add column if not exists pre_registration_answers jsonb not null default '{}'::jsonb,
  add column if not exists preferred_contact_period text,
  add column if not exists contact_outcome text,
  add column if not exists submitted_at timestamptz,
  add column if not exists contacted_at timestamptz,
  add column if not exists fiscal_invited_at timestamptz;

alter table public.leads
  drop constraint if exists leads_preferred_contact_period_check;
alter table public.leads
  add constraint leads_preferred_contact_period_check
  check (preferred_contact_period is null or preferred_contact_period in ('morning', 'afternoon', 'evening'));

alter table public.leads
  drop constraint if exists leads_contact_outcome_check;
alter table public.leads
  add constraint leads_contact_outcome_check
  check (contact_outcome is null or contact_outcome in (
    'in_conversation', 'no_response', 'follow_up', 'qualified', 'not_fit'
  ));

create unique index if not exists idx_leads_company_phone_open_unique
  on public.leads (company_id, phone)
  where phone is not null and phone <> '' and converted_to_student_id is null;

create index if not exists idx_leads_company_stage_priority
  on public.leads (company_id, stage, budget_range, created_at desc)
  where converted_to_student_id is null;

alter table public.leads enable row level security;
grant select, insert, update, delete on table public.leads to authenticated;
grant all on table public.leads to service_role;

drop policy if exists "Company staff manage leads" on public.leads;
create policy "Company staff manage leads"
  on public.leads
  for all
  to authenticated
  using (
    public.is_company_staff(auth.uid(), company_id)
    or public.has_role(auth.uid(), 'master'::public.app_role)
  )
  with check (
    public.is_company_staff(auth.uid(), company_id)
    or public.has_role(auth.uid(), 'master'::public.app_role)
  );
