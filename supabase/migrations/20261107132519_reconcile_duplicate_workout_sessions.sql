-- A reconciliation is a technical correction, not an abandonment or a completion.
-- This migration installs the mechanism only. It does not reconcile any rows.
begin;

alter table public.workout_sessions
  add column duplicate_of_session_id uuid references public.workout_sessions(id) on delete no action deferrable initially deferred,
  add constraint workout_session_duplicate_state check (
    case when status = 'reconciled'
      then duplicate_of_session_id is not null and duplicate_of_session_id <> id and completed_at is null
      else duplicate_of_session_id is null
    end
  );

create or replace function public.guard_workout_session_transition()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'reconciled' then
      raise exception 'session_reconciliation_requires_existing_row' using errcode='42501';
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
  if new.status is distinct from old.status
    and (old.status is distinct from 'in_progress' or new.status not in ('completed', 'abandoned', 'reconciled') or new.status is null) then
    raise exception 'session_transition_conflict' using errcode='PT409';
  end if;
  return new;
end $$;

-- The legacy message trigger can enqueue on an update with both completion
-- timestamps null. Exclude technical reconciliation at the trigger boundary.
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.workout_sessions'::regclass and tgname = 'trg_post_session_message' and not tgisinternal
  ) then
    create or replace trigger trg_post_session_message
      after insert or update on public.workout_sessions for each row
      when (new.status is distinct from 'reconciled')
      execute function public.queue_post_session_message();
  end if;
end $$;

-- Run only with reviewed IDs and the captured fingerprints. A mismatched
-- series count on the completed row is preserved as historical evidence.
create function session_private.reconcile_workout_session(
  p_company_id uuid, p_student_id uuid, p_duplicate_id uuid, p_completed_id uuid,
  p_duplicate_fingerprint text, p_completed_fingerprint text, p_logs_fingerprint text
)
returns void language plpgsql set search_path=pg_catalog,public as $$
declare
  v_duplicate public.workout_sessions;
  v_completed public.workout_sessions;
  v_logs_fingerprint text;
begin
  if p_company_id is null or p_student_id is null or p_duplicate_id is null or p_completed_id is null then
    raise exception 'session_reconciliation_scope_mismatch' using errcode='PT409';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text, 29180000));
  -- Legacy clients can finalize using a direct UPDATE and do not take the advisory lock.
  -- Run the reviewed group in a short transaction; fail fast if another writer is active.
  lock table public.workout_sessions in share row exclusive mode nowait;
  select * into v_duplicate from public.workout_sessions where id = p_duplicate_id for update;
  select * into v_completed from public.workout_sessions where id = p_completed_id;

  if v_duplicate.company_id is distinct from p_company_id or v_duplicate.student_id is distinct from p_student_id
    or v_completed.company_id is distinct from p_company_id or v_completed.student_id is distinct from p_student_id
    or v_duplicate.workout_id is distinct from v_completed.workout_id
    or v_duplicate.session_date is distinct from v_completed.session_date
    or v_duplicate.session_date is null or v_duplicate.session_date >= (now() at time zone 'America/Sao_Paulo')::date
    or v_completed.status is distinct from 'completed'
    or (v_completed.completed_at > v_duplicate.started_at) is not true
    or not exists (
      select 1 from public.workouts w join public.training_cycles c on c.id=w.cycle_id
      where w.id=v_duplicate.workout_id and c.student_id=p_student_id and c.company_id=p_company_id
        and (w.company_id is null or w.company_id=p_company_id)
    ) then
    raise exception 'session_reconciliation_scope_mismatch' using errcode='PT409';
  end if;

  if v_duplicate.status = 'reconciled' and v_duplicate.duplicate_of_session_id = p_completed_id then
    return;
  end if;

  if v_duplicate.status is distinct from 'in_progress' or v_duplicate.completed_at is not null
    or coalesce(v_duplicate.exercises_summary, '[]'::jsonb) <> '[]'::jsonb
    or coalesce(v_duplicate.total_sets_completed, 0) <> 0
    or coalesce(v_duplicate.total_volume, 0) <> 0
    or coalesce(v_duplicate.duration_seconds, 0) <> 0
    or nullif(btrim(v_duplicate.notes), '') is not null
    or exists (select 1 from public.workout_feedback where workout_session_id = p_duplicate_id)
    or exists (select 1 from public.community_posts where workout_session_id = p_duplicate_id)
    or exists (select 1 from session_private.start_requests where session_id = p_duplicate_id)
    or exists (select 1 from public.wearable_workouts where linked_workout_session_id = p_duplicate_id)
    or exists (select 1 from public.scheduled_messages where trigger_data->>'session_id' = p_duplicate_id::text)
    or exists (select 1 from public.challenge_score_log where source_id::text = p_duplicate_id::text)
    or exists (select 1 from public.points_transactions where source_id::text = p_duplicate_id::text)
    or exists (select 1 from public.xp_events where source_id::text = p_duplicate_id::text)
    or exists (select 1 from public.company_form_responses
      where source_id::text = p_duplicate_id::text or source_record_id::text = p_duplicate_id::text)
    or exists (select 1 from public.crm_tag_assignments where entity_id::text = p_duplicate_id::text)
    or exists (select 1 from public.prescription_bundle_items where entity_id::text = p_duplicate_id::text)
    or exists (
      select 1 from public.workout_sessions s
      where s.student_id = p_student_id and s.company_id = p_company_id and s.workout_id = v_duplicate.workout_id
        and s.session_date = v_duplicate.session_date and s.status = 'completed' and s.id <> p_completed_id
    )
    or md5((to_jsonb(v_duplicate) - 'duplicate_of_session_id')::text) is distinct from p_duplicate_fingerprint
    or md5((to_jsonb(v_completed) - 'duplicate_of_session_id')::text) is distinct from p_completed_fingerprint then
    raise exception 'session_reconciliation_evidence_changed' using errcode='PT409';
  end if;

  -- Some historical clients still write logs without taking the student lock.
  -- Fail fast during a write and keep the evidence stable through the update.
  lock table public.workout_logs in share mode nowait;
  select md5(coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb)::text) into v_logs_fingerprint
  from public.workout_logs l
  where l.student_id=p_student_id and l.workout_id=v_duplicate.workout_id and l.session_date=v_duplicate.session_date;
  if v_logs_fingerprint is distinct from p_logs_fingerprint then
    raise exception 'session_reconciliation_logs_changed' using errcode='PT409';
  end if;

  update public.workout_sessions
  set status='reconciled', duplicate_of_session_id=p_completed_id
  where id=p_duplicate_id;
end $$;

revoke all on function session_private.reconcile_workout_session(uuid, uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
-- A retired request without a server session is a tombstone. The existing
-- start RPC must honor it so a delayed request cannot open the previous workout.
alter table session_private.start_requests alter column session_id drop not null;

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
    if v_request.session_id is null then raise exception 'session_request_retired' using errcode='PT409'; end if;
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

-- Resolve an uncertain start without ever opening a workout. Bind the request
-- to a known terminal row if available; otherwise record that it was retired.
-- If a delayed start already won, return its exact active row for recovery.
create function public.retire_terminal_workout_start(
  _student_id uuid, _company_id uuid, _workout_id uuid, _request_id uuid, _session_id uuid
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_request session_private.start_requests;
  v_session public.workout_sessions;
begin
  if auth.uid() is null or not exists (
    select 1 from public.students where id = _student_id and company_id = _company_id and user_id = auth.uid()
  ) then
    raise exception 'session_not_authorized' using errcode='42501';
  end if;
  if _request_id is null or _workout_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(_student_id::text, 29180000));
  if not exists (
    select 1 from public.workouts w join public.training_cycles c on c.id = w.cycle_id
    where w.id = _workout_id and c.student_id = _student_id and c.company_id = _company_id
      and (w.company_id is null or w.company_id = _company_id)
  ) then return null; end if;
  if _session_id is not null and not exists (
    select 1 from public.workout_sessions s
    where s.id = _session_id and s.student_id = _student_id and s.company_id = _company_id
      and s.workout_id = _workout_id and s.status in ('completed', 'abandoned', 'reconciled')
  ) then return null; end if;

  select * into v_request from session_private.start_requests
  where student_id = _student_id and company_id = _company_id and request_id = _request_id;
  if found then
    if v_request.workout_id is distinct from _workout_id then return null; end if;
    if v_request.session_id is null then return jsonb_build_object('state','retired'); end if;
    select * into v_session from public.workout_sessions s where s.id = v_request.session_id
      and s.student_id = _student_id and s.company_id = _company_id and s.workout_id = _workout_id for update;
    if v_session.status = 'in_progress' then
      return jsonb_build_object('state','active','session',jsonb_build_object(
        'id',v_session.id,'workout_id',v_session.workout_id,'student_id',v_session.student_id,
        'company_id',v_session.company_id,'started_at',v_session.started_at
      ));
    end if;
    if v_session.status in ('completed', 'abandoned', 'reconciled') then
      return jsonb_build_object('state','retired');
    end if;
    return null;
  end if;
  insert into session_private.start_requests values (_student_id, _company_id, _request_id, _workout_id, _session_id);
  return jsonb_build_object('state','retired');
end $$;
revoke all on function public.retire_terminal_workout_start(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.retire_terminal_workout_start(uuid, uuid, uuid, uuid, uuid) to authenticated;
commit;
