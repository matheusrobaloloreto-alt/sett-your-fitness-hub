-- Arquivamento reversivel de treinos materializados do aluno.
-- Nao remove ciclo, matricula, plano, logs nem sessoes. As telas ativas ja
-- leem apenas workouts com superseded_at is null; logs/sessoes seguem
-- apontando para o workout arquivado para auditoria e historico.

create table if not exists public.workout_archive_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  student_id uuid not null references public.students(id),
  cycle_id uuid not null references public.training_cycles(id),
  workout_id uuid not null references public.workouts(id),
  action text not null check (action in ('archive', 'restore')),
  reason text,
  previous_superseded_at timestamptz,
  previous_superseded_reason text,
  workout_snapshot jsonb not null,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.workout_archive_events enable row level security;

revoke all on public.workout_archive_events from public, anon;
grant select on public.workout_archive_events to authenticated;
grant all on public.workout_archive_events to service_role;

drop policy if exists "workout archive events tenant read" on public.workout_archive_events;
create policy "workout archive events tenant read"
on public.workout_archive_events
for select
to authenticated
using (
  public.can_read_staff_student(workout_archive_events.company_id, workout_archive_events.student_id)
  or exists (
    select 1
    from public.students s
    where s.id = workout_archive_events.student_id
      and s.user_id = auth.uid()
  )
);

create index if not exists workout_archive_events_workout_created_idx
  on public.workout_archive_events (workout_id, created_at desc);

alter table public.workouts
  add column if not exists student_profile_archive_event_id uuid;

do $archive_event_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workouts_student_profile_archive_event_id_fkey'
      and conrelid = 'public.workouts'::regclass
  ) then
    alter table public.workouts
      add constraint workouts_student_profile_archive_event_id_fkey
      foreign key (student_profile_archive_event_id)
      references public.workout_archive_events(id)
      on delete restrict;
  end if;
end
$archive_event_fk$;

create index if not exists workouts_student_profile_archive_event_idx
  on public.workouts (student_profile_archive_event_id)
  where student_profile_archive_event_id is not null;

create or replace function public.archive_student_workout(
  p_student_id uuid,
  p_cycle_id uuid,
  p_workout_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  cycle public.training_cycles%rowtype;
  workout public.workouts%rowtype;
  log_count integer;
  session_count integer;
  archive_event_id uuid;
  updated_rows integer;
begin
  if actor is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into cycle
  from public.training_cycles
  where id = p_cycle_id
  for update;

  if not found or cycle.student_id = p_student_id is not true then
    raise exception 'cycle_not_found_for_student' using errcode = 'P0001';
  end if;

  select * into workout
  from public.workouts
  where id = p_workout_id
  for update;

  if not found
    or workout.cycle_id = p_cycle_id is not true
    or workout.company_id = cycle.company_id is not true
  then
    raise exception 'workout_not_found_for_student_cycle' using errcode = 'P0001';
  end if;

  if not public.can_manage_staff_student(cycle.company_id, p_student_id) then
    raise exception 'forbidden_cross_tenant_workout_archive' using errcode = '42501';
  end if;

  select count(*) into log_count
  from public.workout_logs logs
  where logs.workout_id = p_workout_id;

  select count(*) into session_count
  from public.workout_sessions sessions
  where sessions.workout_id = p_workout_id;

  if workout.superseded_at is not null
     or workout.student_profile_archive_event_id is not null then
    raise exception 'workout_not_active_for_manual_archive' using errcode = 'P0001';
  end if;

  insert into public.workout_archive_events (
    company_id, student_id, cycle_id, workout_id, action, reason,
    previous_superseded_at, previous_superseded_reason, workout_snapshot, actor_id
  )
  values (
    cycle.company_id, p_student_id, p_cycle_id, p_workout_id, 'archive', nullif(trim(p_reason), ''),
    workout.superseded_at, workout.superseded_reason, to_jsonb(workout), actor
  )
  returning id into archive_event_id;

  update public.workouts
  set
    superseded_at = now(),
    superseded_by_revision_id = coalesce(workout.revision_id, workout.id),
    superseded_reason = concat_ws(
      ' · ',
      'student_profile_manual_archive',
      'archive_event_id=' || archive_event_id::text,
      'logs_preserved=' || log_count::text,
      'sessions_preserved=' || session_count::text,
      nullif(trim(p_reason), '')
    ),
    student_profile_archive_event_id = archive_event_id,
    updated_at = now()
  where id = p_workout_id
    and cycle_id = p_cycle_id
    and company_id = cycle.company_id
    and superseded_at is null
    and student_profile_archive_event_id is null;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'workout_archive_concurrent_update' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'archive',
    'workout_id', p_workout_id,
    'student_id', p_student_id,
    'cycle_id', p_cycle_id,
    'logs_preserved', log_count,
    'sessions_preserved', session_count
  );
end;
$$;

create or replace function public.restore_student_workout(
  p_student_id uuid,
  p_cycle_id uuid,
  p_workout_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  cycle public.training_cycles%rowtype;
  workout public.workouts%rowtype;
  archive_event public.workout_archive_events%rowtype;
  updated_rows integer;
begin
  if actor is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into cycle
  from public.training_cycles
  where id = p_cycle_id
  for update;

  if not found or cycle.student_id = p_student_id is not true then
    raise exception 'cycle_not_found_for_student' using errcode = 'P0001';
  end if;

  select * into workout
  from public.workouts
  where id = p_workout_id
  for update;

  if not found
    or workout.cycle_id = p_cycle_id is not true
    or workout.company_id = cycle.company_id is not true
  then
    raise exception 'workout_not_found_for_student_cycle' using errcode = 'P0001';
  end if;

  if not public.can_manage_staff_student(cycle.company_id, p_student_id) then
    raise exception 'forbidden_cross_tenant_workout_restore' using errcode = '42501';
  end if;

  if workout.superseded_at is null
     or workout.student_profile_archive_event_id is null then
    raise exception 'workout_is_not_manual_archive' using errcode = 'P0001';
  end if;

  select * into archive_event
  from public.workout_archive_events e
  where e.id = workout.student_profile_archive_event_id
    and e.action = 'archive'
    and e.company_id = cycle.company_id
    and e.student_id = p_student_id
    and e.cycle_id = p_cycle_id
    and e.workout_id = p_workout_id
  for update;

  if not found then
    raise exception 'manual_archive_event_missing' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.workout_archive_events e
    where e.workout_id = p_workout_id
      and e.action = 'restore'
      and e.created_at > archive_event.created_at
  ) then
    raise exception 'manual_archive_already_restored' using errcode = '40001';
  end if;

  insert into public.workout_archive_events (
    company_id, student_id, cycle_id, workout_id, action, reason,
    previous_superseded_at, previous_superseded_reason, workout_snapshot, actor_id
  )
  values (
    cycle.company_id, p_student_id, p_cycle_id, p_workout_id, 'restore', nullif(trim(p_reason), ''),
    workout.superseded_at, workout.superseded_reason, to_jsonb(workout), actor
  );

  update public.workouts
  set
    superseded_at = archive_event.previous_superseded_at,
    superseded_by_revision_id = null,
    superseded_reason = archive_event.previous_superseded_reason,
    student_profile_archive_event_id = null,
    updated_at = now()
  where id = p_workout_id
    and cycle_id = p_cycle_id
    and company_id = cycle.company_id
    and superseded_at is not null
    and student_profile_archive_event_id = archive_event.id;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'workout_restore_concurrent_update' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'restore',
    'workout_id', p_workout_id,
    'student_id', p_student_id,
    'cycle_id', p_cycle_id
  );
end;
$$;

revoke all on function public.archive_student_workout(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.restore_student_workout(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.archive_student_workout(uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.restore_student_workout(uuid, uuid, uuid, text) to authenticated, service_role;
