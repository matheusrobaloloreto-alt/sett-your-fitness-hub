-- Add to studio_strength_publication_fixture.sql before loading the integrated migration.
create table public.running_plans (
  id uuid primary key, company_id uuid, student_id uuid, name text not null, plan_name text, sport text,
  goal text, weeks jsonb, fc_zones jsonb, safety_check jsonb, general_tips text, warnings text[],
  complementary_strength jsonb, nutrition_alert text, duration_weeks integer, model text, anamnese_id uuid,
  bundle_id uuid references public.prescription_bundles, training_cycle_id uuid references public.training_cycles,
  previous_plan_id uuid references public.running_plans, sequence_number integer, sequence_phase text,
  start_date date, end_date date, status text, updated_at timestamptz not null default clock_timestamp()
);
create unique index fixture_running_cycle_sport on public.running_plans(training_cycle_id, coalesce(sport, 'corrida'))
  where training_cycle_id is not null;
create table public.nutrition_plans (
  id uuid primary key, company_id uuid, student_id uuid, name text not null, plan_name text, goal text,
  target_calories integer, target_protein_g numeric, target_carbs_g numeric, target_fat_g numeric,
  target_water_ml integer, total_calories integer, protein_g numeric, carbs_g numeric, fat_g numeric,
  context_weight_kg numeric, context_body_fat_pct numeric, context_activity_level text, context_dietary_restrictions text,
  meals jsonb, ai_rationale text, observations text, anamnese_id uuid,
  bundle_id uuid references public.prescription_bundles, training_cycle_id uuid unique references public.training_cycles,
  previous_plan_id uuid references public.nutrition_plans, sequence_number integer, sequence_phase text,
  start_date date, end_date date, status text, updated_at timestamptz not null default clock_timestamp()
);
alter table public.prescription_bundles
  add column running_plan_id uuid references public.running_plans,
  add column nutrition_plan_id uuid references public.nutrition_plans;
grant select, insert, update on public.running_plans, public.nutrition_plans to authenticated, service_role;

alter table public.running_plans enable row level security;
alter table public.nutrition_plans enable row level security;
create policy fixture_running_read on public.running_plans for select to authenticated using (
  public.can_manage_staff_student(company_id, student_id)
  or (student_id = auth.uid() and (start_date is null or start_date <= public.current_business_date()))
);
create policy fixture_nutrition_read on public.nutrition_plans for select to authenticated using (
  public.can_manage_staff_student(company_id, student_id)
  or (student_id = auth.uid() and (start_date is null or start_date <= public.current_business_date()))
);
create policy fixture_running_service on public.running_plans for all to service_role using (true);
create policy fixture_nutrition_service on public.nutrition_plans for all to service_role using (true);
