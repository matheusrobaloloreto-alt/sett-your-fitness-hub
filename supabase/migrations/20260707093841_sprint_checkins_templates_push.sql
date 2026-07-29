-- #2 Check-in diário de prontidão (aluno) — alimenta o readiness do motor.
create table if not exists public.student_checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  company_id uuid not null,
  checkin_date date not null default current_date,
  sleep_quality smallint check (sleep_quality between 1 and 5),
  stress smallint check (stress between 1 and 5),
  pain smallint check (pain between 0 and 10),
  created_at timestamptz not null default now(),
  unique (student_id, checkin_date)
);
alter table public.student_checkins enable row level security;
create policy "checkins_student_own" on public.student_checkins
  for all using (student_id in (select id from public.students where user_id = auth.uid()))
  with check (student_id in (select id from public.students where user_id = auth.uid()));
create policy "checkins_company_read" on public.student_checkins
  for select using (company_id in (select company_id from public.company_members where user_id = auth.uid()));
create policy "checkins_master" on public.student_checkins
  for all using (has_role(auth.uid(), 'master'::app_role)) with check (has_role(auth.uid(), 'master'::app_role));

-- #4 Templates de ciclo (professor) — salvar/reusar prescrições.
create table if not exists public.cycle_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  plan jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.cycle_templates enable row level security;
create policy "templates_company_all" on public.cycle_templates
  for all using (company_id in (select company_id from public.company_members where user_id = auth.uid()))
  with check (company_id in (select company_id from public.company_members where user_id = auth.uid()));
create policy "templates_master" on public.cycle_templates
  for all using (has_role(auth.uid(), 'master'::app_role)) with check (has_role(auth.uid(), 'master'::app_role));

-- #5 Web Push — assinaturas por usuário (aluno ou professor).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "push_owner_all" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- #1 BNITO no WhatsApp — opt-in por empresa (default OFF: nada muda até o professor ligar).
alter table public.company_ai_config add column if not exists bnito_whatsapp_enabled boolean not null default false;;
