-- Rollout: this migration (RPC + guards) BEFORE the new frontend. No backfill,
-- reclassification, history recalculation or retroactive session uniqueness.
-- Rollback frontend first; retain receipts/guards until all new clients retire.
begin;
create schema if not exists session_private;
revoke all on schema session_private from public, anon, authenticated;
create table session_private.start_requests (
  student_id uuid not null references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  primary key(student_id, company_id, request_id)
);
alter table session_private.start_requests enable row level security;
revoke all on session_private.start_requests from public, anon, authenticated;
create index if not exists workout_sessions_open_student_company_idx
on public.workout_sessions(student_id,company_id) where status='in_progress';

-- Row/advisory locks also protect old clients which still write directly.
create or replace function public.guard_workout_session_transition()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then
    if new.status='in_progress' then
      perform pg_advisory_xact_lock(hashtextextended(new.student_id::text, 29180000));
      if exists(select 1 from public.workout_sessions s where s.student_id=new.student_id and s.status='in_progress') then
        raise exception 'session_already_in_progress' using errcode='PT409';
      end if;
    end if;
  else
    if new.student_id is distinct from old.student_id or new.company_id is distinct from old.company_id or new.workout_id is distinct from old.workout_id then
      raise exception 'session_identity_immutable' using errcode='23514';
    end if;
    if old.status in ('completed','abandoned') and new is distinct from old then
      raise exception 'session_terminal_immutable' using errcode='PT409';
    end if;
    if new.status is distinct from old.status and (old.status is distinct from 'in_progress' or new.status not in ('completed','abandoned') or new.status is null) then
      raise exception 'session_transition_conflict' using errcode='PT409';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_workout_session_transition() from public,anon,authenticated;
create trigger session_transition_guard before insert or update on public.workout_sessions
for each row execute function public.guard_workout_session_transition();

create or replace function public.start_workout_session(_student_id uuid,_company_id uuid,_workout_id uuid,_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_session public.workout_sessions; v_request session_private.start_requests; v_count integer;
begin
  if auth.uid() is null or not exists(select 1 from public.students where id=_student_id and company_id=_company_id and user_id=auth.uid()) then
    raise exception 'session_not_authorized' using errcode='42501';
  end if;
  if _request_id is null or not exists(select 1 from public.workouts w join public.training_cycles c on c.id=w.cycle_id where w.id=_workout_id and c.student_id=_student_id and c.company_id=_company_id and (w.company_id is null or w.company_id=_company_id)) then
    raise exception 'session_workout_mismatch' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(_student_id::text,29180000));
  select * into v_request from session_private.start_requests where student_id=_student_id and company_id=_company_id and request_id=_request_id;
  if found then
    if v_request.workout_id<>_workout_id then raise exception 'session_request_reused' using errcode='PT409'; end if;
    select * into strict v_session from public.workout_sessions where id=v_request.session_id;
    return to_jsonb(v_session);
  end if;
  select count(*) into v_count from public.workout_sessions where student_id=_student_id and status='in_progress';
  if v_count>1 then raise exception 'session_legacy_ambiguous' using errcode='PT409'; end if;
  if v_count=1 then
    select * into v_session from public.workout_sessions where student_id=_student_id and status='in_progress' for update;
    if v_session.company_id is distinct from _company_id or v_session.workout_id is distinct from _workout_id then
      raise exception 'session_already_in_progress' using errcode='PT409';
    end if;
  else
    insert into public.workout_sessions(student_id,company_id,workout_id,status,started_at)
    values(_student_id,_company_id,_workout_id,'in_progress',clock_timestamp()) returning * into v_session;
  end if;
  insert into session_private.start_requests values(_student_id,_company_id,_request_id,_workout_id,v_session.id);
  return to_jsonb(v_session);
end $$;
revoke all on function public.start_workout_session(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.start_workout_session(uuid,uuid,uuid,uuid) to authenticated;
commit;
