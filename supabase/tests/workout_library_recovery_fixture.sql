-- Synthetic isolated database only. No production/customer fixtures.
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create type public.app_role as enum ('master', 'admin', 'coordinator', 'trainer', 'student');
create table public.companies(id uuid primary key);
create table public.company_members(user_id uuid, company_id uuid references public.companies);
create table public.user_roles(user_id uuid, role public.app_role);
create function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create table public.exercise_library (
  id uuid primary key default gen_random_uuid(), company_id uuid references public.companies,
  name text not null, muscle_group text, equipment text, category text, categories text[] default '{}',
  is_global boolean default false, created_by uuid, description text, video_url text,
  video_path text, thumbnail_url text, youtube_video_id text,
  difficulty text default 'intermediate'
);
alter table public.exercise_library enable row level security;
grant select on public.companies to authenticated;
grant select, insert on public.exercise_library to authenticated;
insert into public.companies values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.company_members values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('55555555-5555-5555-5555-555555555555','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('66666666-6666-6666-6666-666666666666','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('66666666-6666-6666-6666-666666666666','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.user_roles values
  ('11111111-1111-1111-1111-111111111111','trainer'),
  ('55555555-5555-5555-5555-555555555555','student'),
  ('66666666-6666-6666-6666-666666666666','admin'),
  ('77777777-7777-7777-7777-777777777777','master');
