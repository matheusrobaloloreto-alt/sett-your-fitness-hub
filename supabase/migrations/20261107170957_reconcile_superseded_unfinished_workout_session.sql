-- Install an operator-only neutral transition. No historical rows are changed here.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

alter table public.workout_sessions
  add column technical_resolution text,
  drop constraint workout_session_duplicate_state,
  add constraint workout_session_duplicate_state check (
    case
      when status = 'reconciled' then
        completed_at is null and (
          (technical_resolution is null and duplicate_of_session_id is not null and duplicate_of_session_id <> id)
          or (technical_resolution is not null and technical_resolution = 'superseded_unfinished'
            and duplicate_of_session_id is null)
        )
      else duplicate_of_session_id is null and technical_resolution is null
    end
  );

create or replace function public.guard_workout_session_transition()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'reconciled' then
      raise exception 'session_reconciliation_requires_existing_row' using errcode='42501';
    end if;
    if new.technical_resolution is not null then
      raise exception 'session_technical_resolution_requires_reconciliation' using errcode='42501';
    end if;
    if new.status = 'in_progress' then
      perform pg_advisory_xact_lock(hashtextextended(new.student_id::text, 29180000));
      if new.workout_id is not null then
        -- Guard fresh starts only. An existing receipt must still be recoverable,
        -- and an older workout still published under continuity remains eligible.
        perform 1 from public.workouts w join public.training_cycles c on c.id = w.cycle_id
        where w.id = new.workout_id and c.student_id = new.student_id and c.company_id = new.company_id
          and (w.company_id is null or w.company_id = new.company_id)
          and w.superseded_at is null and w.superseded_by_revision_id is null and w.student_profile_archive_event_id is null
          and c.superseded_at is null and c.superseded_by_cycle_id is null and c.prescription_cleared_at is null
          and c.status in ('active','completed','pending');
        if not found then raise exception 'session_workout_no_longer_published' using errcode='PT409'; end if;
      end if;
      if exists(select 1 from public.workout_sessions s where s.student_id=new.student_id and s.status='in_progress') then
        raise exception 'session_already_in_progress' using errcode='PT409';
      end if;
    end if;
    return new;
  end if;

  if new.student_id is distinct from old.student_id or new.company_id is distinct from old.company_id
    or new.workout_id is distinct from old.workout_id then
    raise exception 'session_identity_immutable' using errcode='23514';
  end if;
  if old.status in ('completed', 'abandoned', 'reconciled') and new is distinct from old then
    raise exception 'session_terminal_immutable' using errcode='PT409';
  end if;
  if new.status = 'reconciled' and old.status = 'in_progress' then
    if not pg_has_role(current_user, (select relowner from pg_class where oid = tg_relid), 'USAGE') then
      raise exception 'session_reconciliation_not_authorized' using errcode='42501';
    end if;
    if new.technical_resolution = 'superseded_unfinished' then
      if old.completed_at is not null or new.duplicate_of_session_id is not null
        or old.session_date is null or old.session_date >= (now() at time zone 'America/Sao_Paulo')::date
        or (to_jsonb(new) - 'status' - 'technical_resolution') is distinct from
           (to_jsonb(old) - 'status' - 'technical_resolution')
        or not exists (
          select 1 from public.workouts w join public.training_cycles c on c.id = w.cycle_id
          where w.id = old.workout_id and c.student_id = old.student_id and c.company_id = old.company_id
            and (w.company_id is null or w.company_id = old.company_id)
            and w.superseded_by_revision_id is not null
            and w.superseded_at > old.started_at and w.superseded_at <= now()
            and old.session_date < (w.superseded_at at time zone 'America/Sao_Paulo')::date
        ) then
        raise exception 'session_reconciliation_scope_mismatch' using errcode='PT409';
      end if;
    else
      if old.completed_at is not null or coalesce(old.exercises_summary, '[]'::jsonb) <> '[]'::jsonb
        or coalesce(old.total_sets_completed, 0) <> 0 or coalesce(old.total_volume, 0) <> 0
        or coalesce(old.duration_seconds, 0) <> 0 or nullif(btrim(old.notes), '') is not null
        or (to_jsonb(new) - 'status' - 'duplicate_of_session_id') is distinct from
           (to_jsonb(old) - 'status' - 'duplicate_of_session_id')
        or not exists (
          select 1 from public.workout_sessions s where s.id = new.duplicate_of_session_id
            and s.status = 'completed' and s.completed_at > old.started_at
            and s.company_id = old.company_id and s.student_id = old.student_id
            and s.workout_id = old.workout_id and s.session_date = old.session_date
        ) then
        raise exception 'session_reconciliation_scope_mismatch' using errcode='PT409';
      end if;
    end if;
  elsif new.technical_resolution is distinct from old.technical_resolution then
    raise exception 'session_technical_resolution_requires_reconciliation' using errcode='42501';
  end if;
  if new.status is distinct from old.status
    and (old.status is distinct from 'in_progress' or new.status not in ('completed', 'abandoned', 'reconciled') or new.status is null) then
    raise exception 'session_transition_conflict' using errcode='PT409';
  end if;
  return new;
end $$;

-- Capture evidence in UTC: md5((to_jsonb(session) - 'technical_resolution')::text),
-- md5(to_jsonb(workout)::text), and md5(jsonb_agg(to_jsonb(log) order by log.id)::text)
-- over every log for the exact student/workout/session_date. Pass the reviewed count.
create function session_private.reconcile_superseded_unfinished_workout_session(
  p_company_id uuid,
  p_student_id uuid,
  p_session_id uuid,
  p_session_fingerprint text,
  p_workout_fingerprint text,
  p_expected_log_count integer,
  p_logs_fingerprint text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
set timezone = 'UTC'
as $$
declare
  v_session public.workout_sessions;
  v_workout public.workouts;
  v_exercise_count integer;
  v_log_count bigint;
  v_unique_series bigint;
  v_logged_exercises bigint;
  v_meaningful_series boolean;
  v_logs_fingerprint text;
begin
  if not pg_has_role(current_user, (select relowner from pg_class where oid = 'public.workout_sessions'::regclass), 'USAGE') then
    raise exception 'session_reconciliation_not_authorized' using errcode='42501';
  end if;
  if p_company_id is null or p_student_id is null or p_session_id is null
    or p_session_fingerprint is null or p_workout_fingerprint is null
    or p_expected_log_count is null or p_expected_log_count < 1 or p_logs_fingerprint is null then
    raise exception 'session_reconciliation_scope_mismatch' using errcode='PT409';
  end if;
  -- Each read after acquiring its locks must see commits from before those locks.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'session_reconciliation_requires_read_committed' using errcode='25001';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended(p_student_id::text, 29180000)) then
    raise exception 'session_reconciliation_lock_conflict' using errcode='55P03';
  end if;

  lock table public.workout_sessions in share row exclusive mode nowait;
  select * into v_session from public.workout_sessions where id = p_session_id for update nowait;
  if not found or v_session.company_id is distinct from p_company_id
    or v_session.student_id is distinct from p_student_id
    or v_session.status is distinct from 'in_progress'
    or v_session.technical_resolution is not null or v_session.duplicate_of_session_id is not null
    or v_session.completed_at is not null or v_session.started_at is null
    or v_session.session_date is null or v_session.session_date >= (now() at time zone 'America/Sao_Paulo')::date
    or md5((to_jsonb(v_session) - 'technical_resolution')::text) is distinct from p_session_fingerprint then
    raise exception 'session_reconciliation_evidence_changed' using errcode='PT409';
  end if;

  select w.* into v_workout
  from public.workouts w
  join public.training_cycles c on c.id = w.cycle_id
  join public.students s on s.id = c.student_id and s.company_id = c.company_id
  where w.id = v_session.workout_id and s.id = p_student_id and s.company_id = p_company_id
    and (w.company_id is null or w.company_id = p_company_id)
    and w.superseded_by_revision_id is not null
    and w.superseded_at > v_session.started_at and w.superseded_at <= now()
    and v_session.session_date < (w.superseded_at at time zone 'America/Sao_Paulo')::date
  for share of w, c, s nowait;

  if not found or md5(to_jsonb(v_workout)::text) is distinct from p_workout_fingerprint
    or jsonb_typeof(v_workout.exercises) is distinct from 'array' then
    raise exception 'session_reconciliation_workout_changed' using errcode='PT409';
  end if;
  v_exercise_count := jsonb_array_length(v_workout.exercises);

  -- Locks also fence references without a foreign key and legacy direct log writers.
  lock table public.workout_logs, public.workout_feedback, public.community_posts,
    session_private.start_requests, public.wearable_workouts, public.scheduled_messages,
    public.challenge_score_log, public.points_transactions, public.xp_events,
    public.company_form_responses, public.crm_tag_assignments, public.prescription_bundle_items
    in share mode nowait;

  if exists (
      select 1 from public.workout_sessions s where s.id <> p_session_id
        and s.student_id = p_student_id and s.workout_id = v_session.workout_id
        and s.session_date = v_session.session_date
    )
    or exists (select 1 from public.workout_sessions where duplicate_of_session_id = p_session_id)
    or exists (select 1 from public.workout_feedback where workout_session_id = p_session_id)
    or exists (select 1 from public.community_posts where workout_session_id = p_session_id)
    or exists (select 1 from session_private.start_requests where session_id = p_session_id)
    or exists (select 1 from public.wearable_workouts where linked_workout_session_id = p_session_id)
    or exists (select 1 from public.scheduled_messages where trigger_data->>'session_id' = p_session_id::text)
    or exists (select 1 from public.challenge_score_log where source_id::text = p_session_id::text)
    or exists (select 1 from public.points_transactions where source_id::text = p_session_id::text)
    or exists (select 1 from public.xp_events where source_id::text = p_session_id::text)
    or exists (select 1 from public.company_form_responses
      where source_id::text = p_session_id::text or source_record_id::text = p_session_id::text)
    or exists (select 1 from public.crm_tag_assignments where entity_id::text = p_session_id::text)
    or exists (select 1 from public.prescription_bundle_items where entity_id::text = p_session_id::text) then
    raise exception 'session_reconciliation_evidence_changed' using errcode='PT409';
  end if;

  select count(*), count(distinct (l.exercise_index, l.set_number)), count(distinct l.exercise_index),
    bool_and((
      l.completed is true and l.exercise_index >= 0 and l.exercise_index < v_exercise_count
      and l.set_number > 0 and l.reps_done > 0 and l.weight >= 0
      and l.weight::text not in ('NaN', 'Infinity', '-Infinity')
    ) is true),
    md5(jsonb_agg(to_jsonb(l) order by l.id)::text)
  into v_log_count, v_unique_series, v_logged_exercises, v_meaningful_series, v_logs_fingerprint
  from public.workout_logs l
  where l.student_id = p_student_id and l.workout_id = v_session.workout_id and l.session_date = v_session.session_date;

  if v_log_count <> p_expected_log_count or v_unique_series <> v_log_count
    or v_logged_exercises >= v_exercise_count or v_meaningful_series is not true
    or v_logs_fingerprint is distinct from p_logs_fingerprint then
    raise exception 'session_reconciliation_logs_changed' using errcode='PT409';
  end if;

  update public.workout_sessions
  set status = 'reconciled', technical_resolution = 'superseded_unfinished'
  where id = p_session_id;
end $$;

revoke all on function session_private.reconcile_superseded_unfinished_workout_session(uuid, uuid, uuid, text, text, integer, text)
  from public, anon, authenticated, service_role;

commit;
