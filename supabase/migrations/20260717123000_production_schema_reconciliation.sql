-- Production reconciliation for the canonical SETT frontend.
-- This migration is intentionally self-contained because the remote migration
-- history predates and diverges from the repository history.

create or replace function public.set_student_scoped_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_company_id uuid;
begin
  select company_id into resolved_company_id
  from public.students
  where id = new.student_id;

  if resolved_company_id is null then
    raise exception 'Student % has no company', new.student_id;
  end if;

  if new.company_id is not null and new.company_id <> resolved_company_id then
    raise exception 'Student/company mismatch';
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;
create table if not exists public.external_activities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  activity_type text not null,
  activity_date date not null default current_date,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  distance_km numeric check (distance_km is null or distance_km >= 0),
  intensity smallint check (intensity between 1 and 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_external_activities_student_date
  on public.external_activities(student_id, activity_date desc);
create index if not exists idx_external_activities_company
  on public.external_activities(company_id);
drop trigger if exists trg_external_activities_company on public.external_activities;
create trigger trg_external_activities_company
before insert or update of student_id, company_id on public.external_activities
for each row execute function public.set_student_scoped_company_id();
drop trigger if exists trg_external_activities_updated on public.external_activities;
create trigger trg_external_activities_updated
before update on public.external_activities
for each row execute function public.update_updated_at_column();
alter table public.external_activities enable row level security;
grant select, insert, update, delete on public.external_activities to authenticated;
grant all on public.external_activities to service_role;
drop policy if exists "external activities master" on public.external_activities;
drop policy if exists "external activities company staff" on public.external_activities;
drop policy if exists "external activities student own" on public.external_activities;
create policy "external activities master" on public.external_activities
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "external activities company staff" on public.external_activities
for all to authenticated
using (company_id = public.get_user_company_id(auth.uid()))
with check (company_id = public.get_user_company_id(auth.uid()));
create policy "external activities student own" on public.external_activities
for all to authenticated
using (exists (
  select 1 from public.students s
  where s.id = external_activities.student_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = external_activities.student_id and s.user_id = auth.uid()
));
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid,
  title text not null,
  body text not null,
  image_url text,
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_announcements_company_published
  on public.announcements(company_id, pinned desc, published_at desc);
drop trigger if exists trg_announcements_updated on public.announcements;
create trigger trg_announcements_updated
before update on public.announcements
for each row execute function public.update_updated_at_column();
alter table public.announcements enable row level security;
grant select, insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
drop policy if exists "announcements master" on public.announcements;
drop policy if exists "announcements company staff" on public.announcements;
drop policy if exists "announcements student company" on public.announcements;
create policy "announcements master" on public.announcements
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "announcements company staff" on public.announcements
for all to authenticated
using (company_id = public.get_user_company_id(auth.uid()))
with check (
  company_id = public.get_user_company_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create policy "announcements student company" on public.announcements
for select to authenticated
using (exists (
  select 1 from public.students s
  where s.user_id = auth.uid() and s.company_id = announcements.company_id
));
create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (announcement_id, student_id)
);
create index if not exists idx_announcement_reads_student
  on public.announcement_reads(student_id);
alter table public.announcement_reads enable row level security;
grant select, insert, update, delete on public.announcement_reads to authenticated;
grant all on public.announcement_reads to service_role;
drop policy if exists "announcement reads master" on public.announcement_reads;
drop policy if exists "announcement reads student own" on public.announcement_reads;
drop policy if exists "announcement reads company staff" on public.announcement_reads;
create policy "announcement reads master" on public.announcement_reads
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "announcement reads student own" on public.announcement_reads
for all to authenticated
using (exists (
  select 1 from public.students s
  where s.id = announcement_reads.student_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  join public.announcements a on a.id = announcement_reads.announcement_id
  where s.id = announcement_reads.student_id
    and s.user_id = auth.uid()
    and s.company_id = a.company_id
));
create policy "announcement reads company staff" on public.announcement_reads
for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = announcement_reads.student_id
    and s.company_id = public.get_user_company_id(auth.uid())
));
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  measured_at date not null default current_date,
  neck numeric,
  shoulder numeric,
  chest numeric,
  waist numeric,
  abdomen numeric,
  hip numeric,
  arm numeric,
  forearm numeric,
  thigh numeric,
  calf numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_body_measurements_student
  on public.body_measurements(student_id, measured_at desc);
drop trigger if exists trg_body_measurements_company on public.body_measurements;
create trigger trg_body_measurements_company
before insert or update of student_id, company_id on public.body_measurements
for each row execute function public.set_student_scoped_company_id();
drop trigger if exists update_body_measurements_updated_at on public.body_measurements;
create trigger update_body_measurements_updated_at
before update on public.body_measurements
for each row execute function public.update_updated_at_column();
alter table public.body_measurements enable row level security;
grant select, insert, update, delete on public.body_measurements to authenticated;
grant all on public.body_measurements to service_role;
drop policy if exists "body measurements master" on public.body_measurements;
drop policy if exists "body measurements company staff" on public.body_measurements;
drop policy if exists "body measurements student own" on public.body_measurements;
create policy "body measurements master" on public.body_measurements
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "body measurements company staff" on public.body_measurements
for all to authenticated
using (company_id = public.get_user_company_id(auth.uid()))
with check (company_id = public.get_user_company_id(auth.uid()));
create policy "body measurements student own" on public.body_measurements
for all to authenticated
using (exists (
  select 1 from public.students s
  where s.id = body_measurements.student_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = body_measurements.student_id and s.user_id = auth.uid()
));
create table if not exists public.workout_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  workout_session_id uuid references public.workout_sessions(id) on delete set null,
  difficulty smallint check (difficulty between 1 and 10),
  energy smallint check (energy between 1 and 5),
  pain_areas jsonb not null default '[]'::jsonb,
  notes text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_workout_feedback_student
  on public.workout_feedback(student_id, created_at desc);
create index if not exists idx_workout_feedback_company_unread
  on public.workout_feedback(company_id, created_at desc) where read_at is null;
drop trigger if exists trg_workout_feedback_company on public.workout_feedback;
create trigger trg_workout_feedback_company
before insert or update of student_id, company_id on public.workout_feedback
for each row execute function public.set_student_scoped_company_id();
alter table public.workout_feedback enable row level security;
grant select, insert, update, delete on public.workout_feedback to authenticated;
grant all on public.workout_feedback to service_role;
drop policy if exists "workout feedback master" on public.workout_feedback;
drop policy if exists "workout feedback company staff" on public.workout_feedback;
drop policy if exists "workout feedback student own" on public.workout_feedback;
create policy "workout feedback master" on public.workout_feedback
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "workout feedback company staff" on public.workout_feedback
for select to authenticated
using (company_id = public.get_user_company_id(auth.uid()));
create policy "workout feedback company update" on public.workout_feedback
for update to authenticated
using (company_id = public.get_user_company_id(auth.uid()))
with check (company_id = public.get_user_company_id(auth.uid()));
create policy "workout feedback student own" on public.workout_feedback
for insert to authenticated
with check (exists (
  select 1 from public.students s
  where s.id = workout_feedback.student_id and s.user_id = auth.uid()
));
create policy "workout feedback student read" on public.workout_feedback
for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = workout_feedback.student_id and s.user_id = auth.uid()
));
create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  target_role text,
  target_user_id uuid,
  student_id uuid references public.students(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  title text not null,
  message text,
  action_url text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_alerts_company_open
  on public.admin_alerts(company_id, created_at desc) where resolved_at is null;
create index if not exists idx_admin_alerts_target_user
  on public.admin_alerts(target_user_id, created_at desc) where resolved_at is null;
create unique index if not exists uniq_admin_alerts_open_per_enrollment_type
  on public.admin_alerts(enrollment_id, type) where resolved_at is null and enrollment_id is not null;
alter table public.admin_alerts enable row level security;
grant select, insert, update, delete on public.admin_alerts to authenticated;
grant all on public.admin_alerts to service_role;
drop policy if exists "admin alerts master" on public.admin_alerts;
drop policy if exists "admin alerts company read" on public.admin_alerts;
drop policy if exists "admin alerts company update" on public.admin_alerts;
drop policy if exists "admin alerts company insert" on public.admin_alerts;
create policy "admin alerts master" on public.admin_alerts
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "admin alerts company read" on public.admin_alerts
for select to authenticated
using (
  company_id = public.get_user_company_id(auth.uid())
  and (
    target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create policy "admin alerts company update" on public.admin_alerts
for update to authenticated
using (
  company_id = public.get_user_company_id(auth.uid())
  and (
    target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
)
with check (company_id = public.get_user_company_id(auth.uid()));
create policy "admin alerts company insert" on public.admin_alerts
for insert to authenticated
with check (
  company_id = public.get_user_company_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create table if not exists public.company_billing (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_company_billing_stripe_customer
  on public.company_billing(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_company_billing_stripe_subscription
  on public.company_billing(stripe_subscription_id) where stripe_subscription_id is not null;
drop trigger if exists update_company_billing_updated_at on public.company_billing;
create trigger update_company_billing_updated_at
before update on public.company_billing
for each row execute function public.update_updated_at_column();
alter table public.company_billing enable row level security;
grant select on public.company_billing to authenticated;
grant all on public.company_billing to service_role;
drop policy if exists "company billing master" on public.company_billing;
create policy "company billing master" on public.company_billing
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
-- Preserve legacy columns for remote compatibility while copying their values
-- into the restricted billing table.
insert into public.company_billing(company_id, stripe_customer_id, stripe_subscription_id)
select id, stripe_customer_id, stripe_subscription_id
from public.companies
where stripe_customer_id is not null or stripe_subscription_id is not null
on conflict (company_id) do update set
  stripe_customer_id = coalesce(excluded.stripe_customer_id, company_billing.stripe_customer_id),
  stripe_subscription_id = coalesce(excluded.stripe_subscription_id, company_billing.stripe_subscription_id),
  updated_at = now();
alter table public.anamnese_invites
  add column if not exists expires_at timestamptz;
update public.anamnese_invites
set expires_at = created_at + interval '7 days'
where expires_at is null;
alter table public.anamnese_invites
  alter column expires_at set default (now() + interval '7 days');
alter table public.prescription_bundles
  add column if not exists strength_plan_id uuid references public.ai_strength_plans(id) on delete set null,
  add column if not exists assessment_id uuid references public.functional_assessments(id) on delete set null,
  add column if not exists generation_error text,
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists update_prescription_bundles_updated_at on public.prescription_bundles;
create trigger update_prescription_bundles_updated_at
before update on public.prescription_bundles
for each row execute function public.update_updated_at_column();
create table if not exists public.prescription_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.prescription_bundles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  modality text not null check (modality in ('musculacao', 'corrida', 'natacao', 'ciclismo', 'nutricao', 'avaliacao')),
  entity_type text not null check (entity_type in ('ai_strength_plan', 'training_cycle', 'running_plan', 'nutrition_plan', 'functional_assessment')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (bundle_id, modality, entity_type, entity_id)
);
create index if not exists idx_prescription_bundle_items_bundle
  on public.prescription_bundle_items(bundle_id);
create index if not exists idx_prescription_bundle_items_student
  on public.prescription_bundle_items(student_id, created_at desc);
alter table public.prescription_bundle_items enable row level security;
grant select, insert, update, delete on public.prescription_bundle_items to authenticated;
grant all on public.prescription_bundle_items to service_role;
drop policy if exists "bundle items master" on public.prescription_bundle_items;
drop policy if exists "bundle items company staff" on public.prescription_bundle_items;
drop policy if exists "bundle items student read" on public.prescription_bundle_items;
create policy "bundle items master" on public.prescription_bundle_items
for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "bundle items company staff" on public.prescription_bundle_items
for all to authenticated
using (company_id = public.get_user_company_id(auth.uid()))
with check (
  company_id = public.get_user_company_id(auth.uid())
  and exists (
    select 1 from public.prescription_bundles b
    where b.id = prescription_bundle_items.bundle_id
      and b.company_id = prescription_bundle_items.company_id
      and b.student_id = prescription_bundle_items.student_id
  )
);
create policy "bundle items student read" on public.prescription_bundle_items
for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = prescription_bundle_items.student_id and s.user_id = auth.uid()
));
-- Backfill cycle ownership from its authoritative enrollment.
update public.training_cycles tc
set student_id = e.student_id,
    company_id = e.company_id
from public.enrollments e
where e.id = tc.enrollment_id
  and (tc.student_id is distinct from e.student_id or tc.company_id is distinct from e.company_id);
create or replace function public.sync_training_cycle_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  enrollment_student_id uuid;
  enrollment_company_id uuid;
begin
  select student_id, company_id
  into enrollment_student_id, enrollment_company_id
  from public.enrollments
  where id = new.enrollment_id;

  if enrollment_student_id is null or enrollment_company_id is null then
    raise exception 'Enrollment % has incomplete ownership', new.enrollment_id;
  end if;

  if new.student_id is not null and new.student_id <> enrollment_student_id then
    raise exception 'Cycle/enrollment student mismatch';
  end if;
  if new.company_id is not null and new.company_id <> enrollment_company_id then
    raise exception 'Cycle/enrollment company mismatch';
  end if;

  new.student_id := enrollment_student_id;
  new.company_id := enrollment_company_id;
  return new;
end;
$$;
drop trigger if exists trg_training_cycles_ownership on public.training_cycles;
create trigger trg_training_cycles_ownership
before insert or update of enrollment_id, student_id, company_id on public.training_cycles
for each row execute function public.sync_training_cycle_ownership();
alter table public.training_cycles alter column student_id set not null;
alter table public.training_cycles alter column company_id set not null;
create index if not exists idx_training_cycles_student_status
  on public.training_cycles(student_id, status, start_date desc);
-- Best-effort historical links. Future bundles are linked explicitly by the Studio.
update public.prescription_bundles b
set strength_plan_id = (
  select p.id from public.ai_strength_plans p
  where p.student_id = b.student_id and p.company_id = b.company_id
    and p.created_at between b.created_at - interval '30 minutes' and b.created_at + interval '30 minutes'
  order by abs(extract(epoch from (p.created_at - b.created_at)))
  limit 1
)
where b.has_strength is true and b.strength_plan_id is null;
update public.prescription_bundles b
set running_plan_id = (
  select p.id from public.running_plans p
  where p.student_id = b.student_id and p.company_id = b.company_id
    and p.created_at between b.created_at - interval '30 minutes' and b.created_at + interval '30 minutes'
  order by abs(extract(epoch from (p.created_at - b.created_at)))
  limit 1
)
where (b.has_cardio is true or b.has_swimming is true or b.has_cycling is true)
  and b.running_plan_id is null;
update public.prescription_bundles b
set nutrition_plan_id = (
  select p.id from public.nutrition_plans p
  where p.student_id = b.student_id and p.company_id = b.company_id
    and p.created_at between b.created_at - interval '30 minutes' and b.created_at + interval '30 minutes'
  order by abs(extract(epoch from (p.created_at - b.created_at)))
  limit 1
)
where b.has_nutrition is true and b.nutrition_plan_id is null;
insert into public.prescription_bundle_items(bundle_id, company_id, student_id, modality, entity_type, entity_id)
select b.id, b.company_id, b.student_id, 'musculacao', 'ai_strength_plan', b.strength_plan_id
from public.prescription_bundles b
where b.strength_plan_id is not null
on conflict do nothing;
insert into public.prescription_bundle_items(bundle_id, company_id, student_id, modality, entity_type, entity_id)
select b.id, b.company_id, b.student_id,
  case lower(coalesce(p.sport, 'corrida'))
    when 'natacao' then 'natacao'
    when 'natação' then 'natacao'
    when 'ciclismo' then 'ciclismo'
    when 'pedal' then 'ciclismo'
    else 'corrida'
  end,
  'running_plan', p.id
from public.prescription_bundles b
join public.running_plans p on p.id = b.running_plan_id
on conflict do nothing;
insert into public.prescription_bundle_items(bundle_id, company_id, student_id, modality, entity_type, entity_id)
select b.id, b.company_id, b.student_id, 'nutricao', 'nutrition_plan', b.nutrition_plan_id
from public.prescription_bundles b
where b.nutrition_plan_id is not null
on conflict do nothing;
