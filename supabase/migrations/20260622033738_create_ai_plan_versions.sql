-- P9/P15 — versionamento de planos publicados (snapshot + se foi editado + resumo da edição).
create table if not exists public.ai_plan_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  student_id uuid not null,
  cycle_id uuid,
  plan jsonb not null,
  edited boolean not null default false,
  edit_summary text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_plan_versions_student on public.ai_plan_versions(student_id, created_at desc);

alter table public.ai_plan_versions enable row level security;

-- Acesso por empresa (espelha prescription_bundles: company_members) + master full.
create policy "plan_versions_company_access" on public.ai_plan_versions
  for all
  using (company_id in (select company_id from public.company_members where user_id = auth.uid()))
  with check (company_id in (select company_id from public.company_members where user_id = auth.uid()));

create policy "plan_versions_master" on public.ai_plan_versions
  for all
  using (has_role(auth.uid(), 'master'::app_role))
  with check (has_role(auth.uid(), 'master'::app_role));;
