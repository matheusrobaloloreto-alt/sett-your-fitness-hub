-- P10 — histórico append-only de anamneses (snapshot por submit), sem alterar o read model atual.
create table if not exists public.student_anamnesis_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  company_id uuid not null,
  version int not null default 1,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_anamnesis_history_student on public.student_anamnesis_history(student_id, version desc);

alter table public.student_anamnesis_history enable row level security;
create policy "anamnesis_history_company_read" on public.student_anamnesis_history
  for select using (company_id in (select company_id from public.company_members where user_id = auth.uid()));
create policy "anamnesis_history_master" on public.student_anamnesis_history
  for all using (has_role(auth.uid(), 'master'::app_role)) with check (has_role(auth.uid(), 'master'::app_role));;
