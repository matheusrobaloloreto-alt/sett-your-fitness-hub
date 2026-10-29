-- Dedicated disposable vanilla PostgreSQL only; never import shared QA helpers.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth,public to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create type public.app_role as enum('master','admin','trainer','student');
create table public.user_roles(user_id uuid,role public.app_role);
create function public.has_role(uuid,public.app_role) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=$1 and role=$2);
$$;
create table public.companies(id uuid primary key,tier text not null);
create table public.company_members(id uuid primary key default gen_random_uuid(),company_id uuid references public.companies on delete cascade,user_id uuid);
create table public.students(id uuid primary key,user_id uuid,company_id uuid);
create table public.platform_product_settings(id text primary key,settings jsonb,version integer);
create table public.automation_flows(id uuid primary key default gen_random_uuid(),company_id uuid references public.companies);
create table public.enrollments(id uuid primary key,company_id uuid,student_id uuid);
create table public.training_cycles(id uuid primary key default gen_random_uuid(),company_id uuid,enrollment_id uuid,start_date date,end_date date,status text);
create table public.workouts(id uuid primary key default gen_random_uuid(),cycle_id uuid,exercises jsonb default '[]');
create table public.company_form_definitions(id uuid primary key default gen_random_uuid(),company_id uuid,kind text,definition jsonb);
create table public.form_fields(id uuid primary key default gen_random_uuid(),company_id uuid,form_type text);
create table public.company_product_settings(id uuid primary key default gen_random_uuid(),company_id uuid unique,settings jsonb);
create function public.company_product_settings_defaults() returns jsonb language sql immutable as $$select '{"brand":{},"prescription":{},"contact_policy":{},"messages":{},"business":{}}'::jsonb$$;
create function public.get_company_dashboard_snapshot(_company_id uuid) returns jsonb language sql stable as $$select jsonb_build_object('company',_company_id)$$;
do $$ declare name text; begin
  foreach name in array array['staff_sessions','whatsapp_instances','whatsapp_labels','whatsapp_chats','whatsapp_messages','message_templates','payments','plans','platform_settings',
    'ai_strength_plans','running_plans','nutrition_plans','prescription_bundles','functional_assessments','company_assessment_protocols','company_ai_config','leads','public_registration_links','anamnese_invites','intercycle_anamnesis_invites'] loop
    execute format('create table public.%I(id uuid primary key default gen_random_uuid(),company_id uuid references public.companies, payload text)',name);
  end loop;
  foreach name in array array['automation_flow_nodes','automation_flow_edges','automation_flow_steps'] loop
    execute format('create table public.%I(id uuid primary key default gen_random_uuid(),flow_id uuid references public.automation_flows on delete cascade,payload text)',name);
  end loop;
end $$;
-- Permissive synthetic base policy demonstrates the new policy is restrictive,
-- rather than accidentally granting access or relying on a deny-all fixture.
do $$ declare name text; begin
  for name in select tablename from pg_tables where schemaname='public' and tablename not in ('user_roles','platform_product_settings','companies','students') loop
    execute format('alter table public.%I enable row level security',name);
    execute format('create policy fixture_existing on public.%I for all to authenticated using (true) with check (true)',name);
  end loop;
end $$;
grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
