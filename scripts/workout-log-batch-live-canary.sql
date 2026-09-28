-- Production contract probe: all row/receipt mutations roll back. Only sequence
-- gaps remain (required for non-reused revisions). Never output student data.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
declare
  sid uuid; wid uuid; uid uuid;
  base jsonb; first_row jsonb; second_row jsonb; replacement jsonb;
  request jsonb; result jsonb; replay jsonb; changed jsonb; updated jsonb;
  state_before jsonb; state_after jsonb;
  denied boolean := false;
begin
  if has_function_privilege('anon','public.save_workout_logs_if_current(jsonb)','execute')
    or has_table_privilege('authenticated','public.workout_log_batch_receipts','select')
    or has_function_privilege('authenticated','public.save_workout_logs_if_current_core(jsonb)','execute') then
    raise exception 'Public/private ACL contract failed';
  end if;
  select s.id,w.id,s.user_id into sid,wid,uid
  from public.students s join public.training_cycles tc on tc.student_id=s.id
    and tc.company_id=s.company_id join public.workouts w on w.cycle_id=tc.id
    and w.company_id=s.company_id
  where s.user_id is not null and jsonb_typeof(w.exercises)='array'
    and jsonb_typeof(w.exercises->0)='object'
    and not exists(select 1 from public.workout_logs l where l.workout_id=w.id
      and l.student_id=s.id and l.session_date=current_date+1)
  order by w.id limit 1;
  if wid is null then raise exception 'No safe canary slot available'; end if;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  base := jsonb_build_object('student_id',sid,'workout_id',wid,'exercise_index',0,
    'set_number',1,'session_date',(current_date+1)::text,'weight',35,
    'reps_done',10,'set_type','normal','rpe',7.5,'completed',true,'base_revision',null);
  result := public.save_workout_logs_if_current(jsonb_build_array(base));
  if result->'conflicts' is distinct from '[]'::jsonb
    or jsonb_array_length(result->'saved') is distinct from 1 then
    raise exception 'Initial save conflict or missing response'; end if;
  first_row := result->'saved'->0;
  if (select rpe from public.workout_logs where id=(first_row->>'id')::uuid)
    is distinct from 7.5::numeric then raise exception 'Fractional 7.5 not persisted'; end if;
  result := public.save_workout_logs_if_current(jsonb_build_array(
    base || jsonb_build_object('set_number',2,'weight',60,'rpe',9.5)));
  if result->'conflicts' is distinct from '[]'::jsonb
    or jsonb_array_length(result->'saved') is distinct from 1 then
    raise exception 'Second save conflict or missing response'; end if;
  second_row := result->'saved'->0;
  if (select rpe from public.workout_logs where id=(second_row->>'id')::uuid)
    is distinct from 9.5::numeric then raise exception 'Fractional 9.5 not persisted'; end if;
  request := jsonb_build_array(
    base || jsonb_build_object('deleted',true,'base_revision',first_row->'revision'),
    base || jsonb_build_object('set_number',2,'weight',60,'rpe',9.5,
      'deleted',true,'base_revision',second_row->'revision'),
    base || jsonb_build_object('weight',60,'rpe',9.5));
  result := public.save_workout_logs_if_current(request);
  if result->'conflicts' is distinct from '[]'::jsonb
    or jsonb_array_length(result->'saved') is distinct from 3 then
    raise exception 'Renumber batch failed';
  end if;
  select value into replacement from jsonb_array_elements(result->'saved')
    where not coalesce((value->>'deleted')::boolean,false);
  if replacement->>'id' is null or replacement->>'revision' is null
    or replacement->>'id'=first_row->>'id'
    or (replacement->>'revision')::bigint <= (second_row->>'revision')::bigint then
    raise exception 'Replacement generation reused';
  end if;
  select jsonb_agg(to_jsonb(l) order by set_number) into state_before
    from public.workout_logs l where student_id=sid and workout_id=wid
      and session_date=current_date+1;
  replay := public.save_workout_logs_if_current(request);
  select jsonb_agg(to_jsonb(l) order by set_number) into state_after
    from public.workout_logs l where student_id=sid and workout_id=wid
      and session_date=current_date+1;
  if replay is distinct from result or state_before is distinct from state_after then
    raise exception 'Replay wrote again or returned no response'; end if;
  changed := jsonb_build_array(base || jsonb_build_object('deleted',true,
    'base_revision',first_row->'revision'));
  replay := public.save_workout_logs_if_current(changed);
  if jsonb_array_length(replay->'conflicts') is distinct from 1
    or replay->'saved' is distinct from '[]'::jsonb then
    raise exception 'Old deletion bypassed generation guard';
  end if;
  updated := public.save_workout_logs_if_current(jsonb_build_array(base ||
    jsonb_build_object('weight',65,'rpe',9.5,'base_revision',replacement->'revision')));
  if updated->'conflicts' is distinct from '[]'::jsonb
    or jsonb_array_length(updated->'saved') is distinct from 1 then
    raise exception 'New-generation update failed'; end if;
  replay := public.save_workout_logs_if_current(request);
  if replay->'saved' is distinct from '[]'::jsonb
    or jsonb_array_length(replay->'conflicts') is distinct from 3 then
    raise exception 'Receipt replay returned stale success';
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.save_workout_logs_if_current(request);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Unauthenticated receipt replay allowed'; end if;
end;
$$;
rollback;
select true as live_canary_passed, true as row_and_receipt_changes_rolled_back;
