-- Run in a disposable database, with a role that can create roles and schemas.
-- Load, in order, before the assertions:
-- 20260908090000_intercycle_anamnesis.sql
-- 20260909152020_intercycle_manual_link_ready.sql
-- 20260914104500_return_workout_revision_rows.sql
-- 20261026174533_automation_dispatch_recovery.sql
-- 20261026180257_automation_dispatch_status.sql
-- 20261107124507_atomic_studio_strength_publication.sql
-- 20261107141629_studio_strength_generation_idempotency.sql
do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key);
create table public.companies (id uuid primary key);
create table public.students (
  id uuid primary key, company_id uuid, user_id uuid, status text default 'active',
  created_at timestamptz default now()
);
-- Empty unrelated automation tables used by the dispatch migrations.
create table public.flow_sessions (
  id uuid primary key, flow_id uuid, status text, context jsonb, updated_at timestamptz
);
create table public.automation_flow_edges (
  flow_id uuid, source_node_id text, target_node_id text
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
create function public.current_business_date() returns date language sql stable as $$ select date '2026-11-07' $$;
create function public.can_manage_staff_student(company uuid, student uuid) returns boolean
language sql stable as $$
  select company = '00000000-0000-0000-0000-000000000001'::uuid
    and student = '00000000-0000-0000-0000-000000000002'::uuid
    and auth.uid() = '00000000-0000-0000-0000-000000000003'::uuid
$$;

create function public.company_feature_allowed(company uuid, feature text) returns boolean
language sql stable as $$
  select company = '00000000-0000-0000-0000-000000000001'::uuid and feature = 'hasPrescription'
    and current_setting('sett.test_feature_off', true) is distinct from 'yes'
$$;

create table public.cycle_templates (id uuid primary key, company_id uuid, plan jsonb);
create table public.enrollments (id uuid primary key, company_id uuid, student_id uuid, status text);
create table public.training_cycles (
  id uuid primary key, company_id uuid, student_id uuid, enrollment_id uuid references enrollments,
  status text, superseded_at timestamptz, superseded_by_cycle_id uuid,
  start_date date, end_date date, cycle_number int, bundle_id uuid, delivery_status text,
  name text, objective text, duration_weeks int, prescribed_offline_at timestamptz,
  prescribed_offline_by uuid, prescribed_offline_note text, prescription_cleared_at timestamptz,
  prescription_cleared_by uuid, prescription_cleared_reason text, prescription_cleared_event_id uuid,
  prescription_cleared_signature text
);
create unique index one_active_cycle on public.training_cycles(enrollment_id) where status = 'active';
create table public.prescription_bundles (
  id uuid primary key, company_id uuid, student_id uuid, training_cycle_id uuid references training_cycles,
  has_strength boolean, strength_plan_id uuid, generation_error text, status text,
  has_cardio boolean, has_swimming boolean, has_cycling boolean, has_nutrition boolean, modalities text[]
);
alter table public.training_cycles add foreign key (bundle_id) references prescription_bundles;
create table public.ai_strength_plans (
  id uuid primary key, company_id uuid, student_id uuid, training_cycle_id uuid references training_cycles,
  bundle_id uuid references prescription_bundles, plan jsonb, duration_weeks int, cycle_name text, objective text,
  updated_at timestamptz not null default now()
);
alter table public.prescription_bundles add foreign key (strength_plan_id) references ai_strength_plans;
create unique index one_cycle_strength_plan on public.ai_strength_plans(training_cycle_id) where training_cycle_id is not null;
create table public.prescription_bundle_items (
  bundle_id uuid references prescription_bundles, company_id uuid, student_id uuid,
  modality text, entity_type text, entity_id uuid, unique (bundle_id, modality, entity_type, entity_id)
);
create table public.workouts (
  id uuid primary key default gen_random_uuid(), cycle_id uuid references training_cycles, company_id uuid,
  name text, title text, description text, day_of_week int, sort_order int, exercises jsonb, created_by uuid,
  revision_id uuid, superseded_at timestamptz, superseded_by_revision_id uuid, superseded_reason text,
  updated_at timestamptz not null default now()
);
create table public.ai_plan_versions (
  company_id uuid, student_id uuid, cycle_id uuid, plan jsonb, edited boolean, edit_summary text, created_by uuid
);

alter table public.ai_strength_plans enable row level security;
alter table public.prescription_bundles enable row level security;
alter table public.prescription_bundle_items enable row level security;
grant select on public.ai_strength_plans, public.prescription_bundles, public.prescription_bundle_items to authenticated;
create policy plan_read on public.ai_strength_plans for select to authenticated using (
  public.can_manage_staff_student(company_id, student_id) or student_id = auth.uid() and (
    training_cycle_id is null or training_cycle_id in (
      select id from public.training_cycles where start_date <= public.current_business_date()
    )
  )
);
grant select on public.training_cycles, public.enrollments, public.cycle_templates, public.workouts to authenticated;
grant insert, update on public.ai_strength_plans, public.prescription_bundles to authenticated;
grant usage on schema public to service_role;
grant select, update on public.ai_strength_plans to service_role;
create policy plan_service on public.ai_strength_plans for all to service_role using (true);
grant select on public.prescription_bundles to service_role;
create policy bundle_service on public.prescription_bundles for select to service_role using (true);
create policy plan_update on public.ai_strength_plans for update to authenticated
  using (public.can_manage_staff_student(company_id, student_id));
create policy bundle_update on public.prescription_bundles for update to authenticated
  using (public.can_manage_staff_student(company_id, student_id));
create policy plan_insert on public.ai_strength_plans for insert to authenticated
  with check (public.can_manage_staff_student(company_id, student_id));
create policy bundle_insert on public.prescription_bundles for insert to authenticated
  with check (public.can_manage_staff_student(company_id, student_id));
create policy bundle_read on public.prescription_bundles for select to authenticated
  using (student_id = auth.uid() or public.can_manage_staff_student(company_id, student_id));
create policy item_read on public.prescription_bundle_items for select to authenticated
  using (student_id = auth.uid() or public.can_manage_staff_student(company_id, student_id));
