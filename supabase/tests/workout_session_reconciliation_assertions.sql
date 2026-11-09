do $$
declare
  v_duplicate public.workout_sessions;
  v_completed public.workout_sessions;
  v_logs text;
  v_before_completed jsonb;
  v_before_logs jsonb;
  v_reconciled int := 0;
begin
  if has_function_privilege('authenticated','session_private.reconcile_workout_session(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('service_role','session_private.reconcile_workout_session(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'operator routine exposed';
  end if;
  select jsonb_agg(to_jsonb(s) order by id) into v_before_completed from workout_sessions s where status='completed';
  select jsonb_agg(to_jsonb(l) order by id) into v_before_logs from workout_logs l;
  begin
    update public.workout_sessions set status='reconciled', duplicate_of_session_id='70000000-0000-0000-0000-000000000004'
    where student_id='00000000-0000-0000-0000-000000000003' and status='in_progress';
    raise exception 'direct owner update accepted cross-student target';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'session_reconciliation_scope_mismatch' then raise; end if;
  end;
  for v_duplicate in
    select * from workout_sessions where status='in_progress' and session_date in ('2026-10-09','2026-10-12')
  loop
    select * into strict v_completed from workout_sessions s where s.status='completed'
      and s.student_id=v_duplicate.student_id and s.workout_id=v_duplicate.workout_id and s.session_date=v_duplicate.session_date;
    select md5(jsonb_agg(to_jsonb(l) order by id)::text) into v_logs
    from workout_logs l where l.student_id=v_duplicate.student_id and l.workout_id=v_duplicate.workout_id
      and l.session_date=v_duplicate.session_date;
    begin
      perform session_private.reconcile_workout_session(v_duplicate.company_id, v_duplicate.student_id,
        v_duplicate.id,v_completed.id,md5((to_jsonb(v_duplicate)-'duplicate_of_session_id')::text),
        md5((to_jsonb(v_completed)-'duplicate_of_session_id')::text),'stale');
      raise exception 'reconciliation accepted stale evidence';
    exception when sqlstate 'PT409' then
      if sqlerrm <> 'session_reconciliation_logs_changed' then raise; end if;
    end;
    insert into public.scheduled_messages values (jsonb_build_object('session_id',v_duplicate.id));
    begin
      perform session_private.reconcile_workout_session(v_duplicate.company_id, v_duplicate.student_id,
        v_duplicate.id,v_completed.id,md5((to_jsonb(v_duplicate)-'duplicate_of_session_id')::text),
        md5((to_jsonb(v_completed)-'duplicate_of_session_id')::text),v_logs);
      raise exception 'reconciliation accepted a referenced duplicate';
    exception when sqlstate 'PT409' then
      if sqlerrm <> 'session_reconciliation_evidence_changed' then raise; end if;
    end;
    delete from public.scheduled_messages where trigger_data->>'session_id'=v_duplicate.id::text;
    perform session_private.reconcile_workout_session(v_duplicate.company_id, v_duplicate.student_id,
      v_duplicate.id,v_completed.id,md5((to_jsonb(v_duplicate)-'duplicate_of_session_id')::text),
      md5((to_jsonb(v_completed)-'duplicate_of_session_id')::text),v_logs);
    perform session_private.reconcile_workout_session(v_duplicate.company_id, v_duplicate.student_id,
      v_duplicate.id,v_completed.id,null,null,null);
    v_reconciled := v_reconciled + 1;
  end loop;

  if v_reconciled <> 3 or (select count(*) from workout_sessions where status='reconciled') <> 3
    or (select count(*) from workout_sessions where status='abandoned') <> 1
    or exists(select 1 from workout_sessions where status='reconciled' and (duplicate_of_session_id is null or completed_at is not null))
    or exists(select 1 from queued_fixture_messages)
    or (select jsonb_agg(to_jsonb(s) order by id) from workout_sessions s where status='completed') is distinct from v_before_completed
    or (select jsonb_agg(to_jsonb(l) order by id) from workout_logs l) is distinct from v_before_logs
  then
    raise exception 'reconciliation changed history or produced notifications';
  end if;
end $$;

-- An isolated conclusion deletion still fails. Existing deletion of the entire
-- workout cascades to both rows together; it was never a history-preserving path.
do $$
begin
  begin
    delete from public.workout_sessions where id='70000000-0000-0000-0000-000000000004';
    set constraints all immediate;
    raise exception 'isolated delete left an orphan reconciliation';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.workouts where id='30000000-0000-0000-0000-000000000004';
    set constraints all immediate;
    if exists (select 1 from public.workout_sessions where workout_id='30000000-0000-0000-0000-000000000004')
    then raise exception 'whole workout cascade was blocked'; end if;
    raise exception 'test_cascade_rollback' using errcode='P9972';
  exception when sqlstate 'P9972' then null;
  end;
end $$;

do $$
declare
  v_student constant uuid := '00000000-0000-0000-0000-000000000001';
  v_workout constant uuid := '30000000-0000-0000-0000-000000000001';
  v_retired constant uuid := '90000000-0000-0000-0000-000000000001';
  v_winner constant uuid := '90000000-0000-0000-0000-000000000002';
  v_session jsonb;
  v_recovered jsonb;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
    if (public.retire_terminal_workout_start(v_student,v_student,v_workout,v_retired,null)->>'state') is distinct from 'retired'
    then raise exception 'request without a timer could not be retired'; end if;
    begin
      perform public.start_workout_session(v_student,v_student,v_workout,v_retired);
      raise exception 'retired request created a session';
    exception when sqlstate 'PT409' then
      if sqlerrm <> 'session_request_retired' then raise; end if;
    end;
    v_session := public.start_workout_session(v_student,v_student,v_workout,v_winner);
    v_recovered := public.retire_terminal_workout_start(v_student,v_student,v_workout,v_winner,null);
    if v_recovered->>'state' is distinct from 'active'
      or v_recovered->'session'->>'id' is distinct from v_session->>'id'
    then raise exception 'late winning request was not recovered'; end if;
    begin
      perform public.retire_terminal_workout_start('00000000-0000-0000-0000-000000000002',v_student,v_workout,v_winner,null);
      raise exception 'wrong student recovered a request';
    exception when insufficient_privilege then
      if sqlerrm <> 'session_not_authorized' then raise; end if;
    end;
    raise exception 'test_receipt_rollback' using errcode='P9973';
  exception when sqlstate 'P9973' then null;
  end;
end $$;

-- A late request may replay an existing receipt but cannot create a new
-- session for a workout that the portal excludes as superseded.
do $$
declare
  v_student constant uuid := '00000000-0000-0000-0000-000000000001';
  v_workout constant uuid := '30000000-0000-0000-0000-000000000001';
  v_request constant uuid := '90000000-0000-0000-0000-000000000003';
begin
  begin
    update public.workouts set superseded_at = now() where id = v_workout;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
    begin
      perform public.start_workout_session(v_student,v_student,v_workout,v_request);
      raise exception 'late start opened a superseded workout';
    exception when sqlstate 'PT409' then
      if sqlerrm <> 'session_workout_no_longer_published' then raise; end if;
    end;
    begin
      insert into public.workout_sessions(student_id,company_id,workout_id,status)
      values(v_student,v_student,v_workout,'in_progress');
      raise exception 'legacy direct write opened a superseded workout';
    exception when sqlstate 'PT409' then
      if sqlerrm <> 'session_workout_no_longer_published' then raise; end if;
    end;
    raise exception 'test_superseded_rollback' using errcode='P9974';
  exception when sqlstate 'P9974' then null;
  end;
end $$;
