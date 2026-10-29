create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.companies(id uuid primary key);
create table public.students(id uuid primary key, company_id uuid references public.companies, user_id uuid);
create table public.training_cycles(id uuid primary key,student_id uuid references public.students,company_id uuid references public.companies);
create table public.workouts(id uuid primary key,cycle_id uuid references public.training_cycles,company_id uuid references public.companies);
create table public.workout_sessions (
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.students,workout_id uuid not null references public.workouts,company_id uuid references public.companies,
 session_date date default current_date,started_at timestamptz default now(),completed_at timestamptz,duration_seconds integer,total_volume numeric default 0,total_sets_completed integer default 0,total_sets_prescribed integer default 0,status text default 'in_progress',notes text,exercises_summary jsonb default '[]',created_at timestamptz default now()
);
insert into companies values('00000000-0000-0000-0000-000000000001');
insert into students select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001',('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;
insert into training_cycles select ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,id,company_id from students s join generate_series(1,5) n on s.id=('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
insert into workouts select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001' from generate_series(1,5) n;
insert into workouts values('30000000-0000-0000-0000-000000000099','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
-- Three preexisting ambiguous groups, not a cleaned fixture.
insert into workout_sessions(student_id,workout_id,company_id)
select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001' from generate_series(3,5) n cross join generate_series(1,2) duplicates;
create table legacy_snapshot as select * from workout_sessions;
alter table workout_sessions enable row level security;
create policy own_sessions on workout_sessions for all to authenticated using (exists(select 1 from students s where s.id=student_id and s.user_id=auth.uid() and s.company_id=workout_sessions.company_id)) with check(exists(select 1 from students s where s.id=student_id and s.user_id=auth.uid() and s.company_id=workout_sessions.company_id));
grant usage on schema public,auth to authenticated;
grant select on students,workouts,training_cycles to authenticated;
grant select,insert,update on workout_sessions to authenticated;
