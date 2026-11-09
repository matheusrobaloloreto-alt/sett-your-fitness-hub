-- Run with psql in an empty, disposable database with Supabase roles.
\set ON_ERROR_STOP on
\ir session_transitions_fixture.sql
\ir ../migrations/20261029180000_session_transitions_idempotency.sql
\ir workout_session_reconciliation_fixture.sql
\ir ../migrations/20261107132519_reconcile_duplicate_workout_sessions.sql
\ir workout_session_reconciliation_assertions.sql

-- Resolve the remaining synthetic duplicate before installing the index.
update public.workout_sessions set status = 'abandoned'
where id = (
  select id from public.workout_sessions
  where student_id = '00000000-0000-0000-0000-000000000005' and status = 'in_progress'
  order by id limit 1
);
create temp table sessions_before_index as table public.workout_sessions;
\ir ../migrations/20261107163418_workout_sessions_one_in_progress_per_student.sql

begin;
do $$
begin
  if exists (select * from sessions_before_index except all select * from public.workout_sessions)
    or exists (select * from public.workout_sessions except all select * from sessions_before_index)
  then raise exception 'index migration changed existing sessions'; end if;
  if to_regclass('public.workout_sessions_open_student_company_idx') is null
  then raise exception 'existing composite index was removed'; end if;
end $$;
\echo ok - migration preserved all existing rows and the composite index

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
do $$
declare
  v_student constant uuid := '00000000-0000-0000-0000-000000000003';
  v_company constant uuid := '00000000-0000-0000-0000-000000000001';
  v_workout constant uuid := '30000000-0000-0000-0000-000000000003';
  v_other_workout constant uuid := '30000000-0000-0000-0000-000000000098';
  v_request constant uuid := gen_random_uuid();
  v_id uuid;
begin
  v_id := (public.start_workout_session(v_student,v_company,v_workout,v_request)->>'id')::uuid;
  if v_id is null
    or (public.start_workout_session(v_student,v_company,v_workout,v_request)->>'id')::uuid is distinct from v_id
    or (public.start_workout_session(v_student,v_company,v_workout,gen_random_uuid())->>'id')::uuid is distinct from v_id
  then raise exception 'start replay or adoption changed session identity'; end if;
  begin
    perform public.start_workout_session(v_student,v_company,v_other_workout,gen_random_uuid());
    raise exception 'RPC opened a second workout for the same student';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'session_already_in_progress' then raise; end if;
  end;
  begin
    insert into public.workout_sessions (student_id,company_id,workout_id,status)
    values (v_student,v_company,v_other_workout,'in_progress');
    raise exception 'legacy insert opened a second workout for the same student';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'session_already_in_progress' then raise; end if;
  end;
  update public.workout_sessions set status = 'completed', completed_at = now()
  where id = v_id and status = 'in_progress';
  if not found
    or (public.start_workout_session(v_student,v_company,v_workout,v_request)->>'status') is distinct from 'completed'
    or (public.start_workout_session(v_student,v_company,v_other_workout,gen_random_uuid())->>'status') is distinct from 'in_progress'
  then raise exception 'completion, terminal replay or subsequent start failed'; end if;
end $$;
reset role;
\echo ok - authenticated start, replay, adoption, conflict, completion and fresh start

-- Test the physical backstop independently of the existing trigger.
set constraints all immediate;
alter table public.workout_sessions disable trigger session_transition_guard;
insert into public.companies values ('00000000-0000-0000-0000-000000000002');
do $$
declare
  v_student constant uuid := '00000000-0000-0000-0000-000000000003';
  v_company constant uuid := '00000000-0000-0000-0000-000000000001';
  v_workout constant uuid := '30000000-0000-0000-0000-000000000003';
  v_null_student constant uuid := '00000000-0000-0000-0000-000000000001';
  v_null_workout constant uuid := '30000000-0000-0000-0000-000000000001';
  v_attempt_company uuid;
  v_index text;
begin
  foreach v_attempt_company in array array[v_company, '00000000-0000-0000-0000-000000000002'::uuid, null] loop
    begin
      insert into public.workout_sessions (student_id,company_id,workout_id,status,session_date)
      values (v_student,v_attempt_company,v_workout,'in_progress',current_date - 1);
      raise exception 'index allowed another open row (company %)', v_attempt_company;
    exception when unique_violation then
      get stacked diagnostics v_index = constraint_name;
      if v_index <> 'workout_sessions_one_in_progress_per_student_uidx' then raise; end if;
    end;
  end loop;

  insert into public.workout_sessions (student_id,company_id,workout_id,status)
  values (v_null_student,null,v_null_workout,'in_progress');
  begin
    insert into public.workout_sessions (student_id,company_id,workout_id,status)
    values (v_null_student,null,v_null_workout,'in_progress');
    raise exception 'index allowed two open rows with null company';
  exception when unique_violation then
    get stacked diagnostics v_index = constraint_name;
    if v_index <> 'workout_sessions_one_in_progress_per_student_uidx' then raise; end if;
  end;
end $$;
alter table public.workout_sessions enable trigger session_transition_guard;
\echo ok - index alone rejects 23505 across workouts, dates, companies and null tenants

do $$
declare
  v_id constant uuid := '70000000-0000-0000-0000-000000000003';
  v_history public.workout_sessions;
begin
  select * into strict v_history from public.workout_sessions where id = v_id and status = 'completed';
  insert into public.workout_sessions (id,student_id,company_id,workout_id,status)
  values (v_id,v_history.student_id,v_history.company_id,v_history.workout_id,'completed')
  on conflict (id) do nothing;
  if found then raise exception 'primary-key conflict was not ignored'; end if;
  insert into public.workout_sessions (student_id,company_id,workout_id,status)
  values (v_history.student_id,v_history.company_id,v_history.workout_id,'completed')
  on conflict (id) do nothing;
  if not found then raise exception 'completed insert was blocked by an open session'; end if;
end $$;
\echo ok - existing ON CONFLICT (id) inference and repeat completed inserts
rollback;
