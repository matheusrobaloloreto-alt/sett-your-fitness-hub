alter table public.workouts add column superseded_at timestamptz,
  add column superseded_by_revision_id uuid, add column student_profile_archive_event_id uuid;
alter table public.training_cycles add column superseded_at timestamptz,
  add column superseded_by_cycle_id uuid, add column prescription_cleared_at timestamptz,
  add column status text default 'active';
-- Match the production workout FK's delete behavior in this isolated fixture.
alter table public.workout_sessions drop constraint workout_sessions_workout_id_fkey;
alter table public.workout_sessions add foreign key (workout_id) references public.workouts(id) on delete cascade;
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(), student_id uuid not null,
  workout_id uuid not null, session_date date not null, exercise_index int not null,
  set_number int not null, weight numeric not null, reps_done int not null
);
create table public.workout_feedback (workout_session_id uuid references public.workout_sessions(id));
create table public.community_posts (workout_session_id uuid references public.workout_sessions(id));
create table public.wearable_workouts (linked_workout_session_id uuid);
create table public.scheduled_messages (trigger_data jsonb);
create table public.challenge_score_log (source_id uuid);
create table public.points_transactions (source_id uuid);
create table public.xp_events (source_id uuid);
create table public.company_form_responses (source_id uuid, source_record_id uuid);
create table public.crm_tag_assignments (entity_id uuid);
create table public.prescription_bundle_items (entity_id uuid);
create table public.queued_fixture_messages (session_id uuid);
create function public.queue_post_session_message() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.queued_fixture_messages values (new.id);
  return new;
end $$;
create trigger trg_post_session_message after insert or update on public.workout_sessions
for each row execute function public.queue_post_session_message();

-- Existing opens for the two athletes predate the session transition guard.
update public.workout_sessions set session_date='2026-10-09', started_at='2026-10-09 08:00:00-03'
where student_id='00000000-0000-0000-0000-000000000003';
update public.workout_sessions set session_date='2026-10-12', started_at='2026-10-12 08:00:00-03'
where student_id='00000000-0000-0000-0000-000000000004';
delete from public.workout_sessions where id in (
  select id from public.workout_sessions where student_id='00000000-0000-0000-0000-000000000004' order by id limit 1
);
insert into public.workout_sessions (
  id, student_id, company_id, workout_id, session_date, started_at, completed_at, status, total_sets_completed, total_volume, exercises_summary
)
select ('70000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000001',
  ('30000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  d, d + time '13:00', d + time '16:00', 'completed', tally, total,
  jsonb_build_array(jsonb_build_object('sets', (
    select jsonb_agg(jsonb_build_object('weight', case when n = 3 then 10 else 0 end, 'reps', case when i <= tally then 10 else 0 end) order by i)
    from generate_series(1, detail) i
  )))
from (values (3,date '2026-10-09',28,28,2800),(4,date '2026-10-12',20,24,0)) f(n,d,tally,detail,total);

insert into public.workout_logs (student_id, workout_id, session_date, exercise_index, set_number, weight, reps_done)
select s.student_id, s.workout_id, s.session_date, 0, i, case when s.session_date = '2026-10-09' then 10 else 0 end,
  case when s.session_date = '2026-10-09' or i <= 20 then 10 else 0 end
from public.workout_sessions s
cross join lateral generate_series(1, case s.session_date when date '2026-10-09' then 28 else 22 end) i
where s.status='completed';

-- A second, distinct workout on the same day must remain in the history.
insert into public.workouts (id, cycle_id, company_id)
values ('30000000-0000-0000-0000-000000000098','20000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001');
insert into public.workout_sessions (student_id,company_id,workout_id,session_date,started_at,completed_at,status,total_volume)
values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000098','2026-10-09','2026-10-09 18:00:00-03','2026-10-09 18:20:00-03','completed',300);

insert into public.workout_sessions (student_id,company_id,workout_id,session_date,started_at,completed_at,status)
values ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000004','2026-10-11','2026-10-11 08:00:00-03','2026-10-11 08:10:00-03','abandoned');

truncate public.queued_fixture_messages;
