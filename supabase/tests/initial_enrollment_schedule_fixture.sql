-- Extend schedule_reconciliation_fixture.sql for the real paid/manual RPCs.
-- Apply the renewal, enrollment guard, and schedule migrations after this fixture.
alter table public.students
  add column status text default 'pending',
  add column sales_stage text default 'payment_pending',
  add column activated_at timestamptz,
  add column assessment_due_at timestamptz,
  add column assigned_trainer_id uuid,
  add column updated_at timestamptz default now();

alter table public.enrollments
  alter column id set default gen_random_uuid(),
  add column trainer_id uuid,
  add column cycle_duration_days integer,
  add column payment_status text,
  add column payment_date date;
alter table public.workouts
  add column company_id uuid,
  add column superseded_by_revision_id uuid,
  add column student_profile_archive_event_id uuid;

create table public.functional_assessments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  student_id uuid,
  status text
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  company_id uuid not null,
  plan_id uuid not null,
  asaas_payment_id text not null unique,
  enrollment_id uuid,
  lifecycle_applied_at timestamptz,
  lifecycle_enrollment_id uuid,
  lifecycle_first_activation boolean,
  updated_at timestamptz default now()
);

insert into public.students (id, company_id)
select format('00000003-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '00000002-0000-4000-8000-000000000001'
from generate_series(10, 23) n;

-- Legacy active null date, legacy unpaid awaiting confirmation, and a legacy
-- paid enrollment with no cycles that staff can explicitly defer at onboarding.
insert into public.enrollments (id, student_id, company_id, plan_id, status, start_date, end_date, payment_status)
select format('00000005-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  format('00000003-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  '00000002-0000-4000-8000-000000000001', '00000004-0000-4000-8000-000000000001',
  case when n = 15 then 'inactive' when n = 16 then 'completed' else 'active' end,
  date '2026-06-01', date '2026-11-15', case when n = 13 then 'pending' else 'paid' end
from generate_series(12, 16) n;

-- Already activated without an enrollment in this fixture.
update public.students set status = 'active', sales_stage = 'active', activated_at = '2026-01-01'
where id = '00000003-0000-4000-8000-000000000017';
