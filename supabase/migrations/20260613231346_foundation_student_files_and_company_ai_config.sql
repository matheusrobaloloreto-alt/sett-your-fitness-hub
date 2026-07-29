-- Fundação: pasta de arquivos por aluno + config de IA por empresa (white-label).

-- 1) company_ai_config: a "IA-coração" configurável por empresa.
create table if not exists public.company_ai_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  assistant_name text not null default 'Assistente',
  consultancy_name text,
  methodology text,
  plans_payment text,
  tone text,
  extra jsonb not null default '{}'::jsonb,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.company_ai_config enable row level security;
grant select, insert, update, delete on public.company_ai_config to authenticated;
grant all on public.company_ai_config to service_role;

drop policy if exists "company members manage ai config" on public.company_ai_config;
create policy "company members manage ai config" on public.company_ai_config for all to authenticated
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
drop policy if exists "master manages ai config" on public.company_ai_config;
create policy "master manages ai config" on public.company_ai_config for all to authenticated
  using (public.has_role(auth.uid(), 'master'::app_role))
  with check (public.has_role(auth.uid(), 'master'::app_role));

drop trigger if exists update_company_ai_config_updated_at on public.company_ai_config;
create trigger update_company_ai_config_updated_at before update on public.company_ai_config
  for each row execute function public.update_updated_at_column();

-- 2) student_files: pasta automática por aluno (relatórios + downloads do WhatsApp).
create table if not exists public.student_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  kind text not null default 'other',
  source text not null default 'app',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (student_id, file_path)
);
alter table public.student_files enable row level security;
grant select, insert, update, delete on public.student_files to authenticated;
grant all on public.student_files to service_role;

create index if not exists idx_student_files_student on public.student_files (student_id, created_at desc);
create index if not exists idx_student_files_company on public.student_files (company_id, created_at desc);

drop policy if exists "company staff manage student files" on public.student_files;
create policy "company staff manage student files" on public.student_files for all to authenticated
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
drop policy if exists "master manages student files" on public.student_files;
create policy "master manages student files" on public.student_files for all to authenticated
  using (public.has_role(auth.uid(), 'master'::app_role))
  with check (public.has_role(auth.uid(), 'master'::app_role));
drop policy if exists "student reads own files" on public.student_files;
create policy "student reads own files" on public.student_files for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_files.student_id and s.user_id = auth.uid()));

-- 3) Bucket privado para os arquivos do aluno (path: {company_id}/{student_id}/...).
insert into storage.buckets (id, name, public, file_size_limit)
values ('student-files', 'student-files', false, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "company staff manage student-files objects" on storage.objects;
create policy "company staff manage student-files objects" on storage.objects for all to authenticated
  using (bucket_id = 'student-files' and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text)
  with check (bucket_id = 'student-files' and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text);
drop policy if exists "master manages student-files objects" on storage.objects;
create policy "master manages student-files objects" on storage.objects for all to authenticated
  using (bucket_id = 'student-files' and public.has_role(auth.uid(), 'master'::app_role))
  with check (bucket_id = 'student-files' and public.has_role(auth.uid(), 'master'::app_role));;
