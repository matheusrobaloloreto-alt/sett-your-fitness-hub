-- Synthetic only. Run after the fixture, production migrations under test,
-- and the normal AFTER INSERT OR UPDATE generate_training_cycles trigger.
begin;
set local test.actor = '00000001-0000-4000-8000-000000000001';
set local test.role = 'service_role';

do $$
declare
  company constant uuid := '00000002-0000-4000-8000-000000000001';
  plan constant uuid := '00000004-0000-4000-8000-000000000001';
  paid_student constant uuid := '00000003-0000-4000-8000-000000000010';
  manual_student constant uuid := '00000003-0000-4000-8000-000000000011';
  legacy constant uuid := '00000005-0000-4000-8000-000000000012';
  unpaid constant uuid := '00000005-0000-4000-8000-000000000013';
  manual_assessment constant uuid := '00000005-0000-4000-8000-000000000014';
  inactive constant uuid := '00000005-0000-4000-8000-000000000015';
  historical_student constant uuid := '00000003-0000-4000-8000-000000000016';
  already_active_student constant uuid := '00000003-0000-4000-8000-000000000017';
  imported_completed constant uuid := '00000005-0000-4000-8000-000000000018';
  imported_inactive constant uuid := '00000005-0000-4000-8000-000000000019';
  imported_empty constant uuid := '00000005-0000-4000-8000-000000000020';
  dated_student constant uuid := '00000003-0000-4000-8000-000000000021';
  transition_student constant uuid := '00000003-0000-4000-8000-000000000022';
  predated_student constant uuid := '00000003-0000-4000-8000-000000000023';
  trainer constant uuid := '00000001-0000-4000-8000-000000000001';
  paid_id uuid;
  manual_id uuid;
  historical_id uuid;
  renewal_id uuid;
  cycle_id uuid;
  workout_id uuid;
  old_workout jsonb;
  history_cycle_id uuid;
  cycle_snapshot jsonb;
  result jsonb;
begin
  insert into public.enrollments (student_id, company_id, plan_id, status, start_date, end_date, training_start_date)
  values (dated_student, company, plan, 'completed', '2026-04-01', '2026-05-31', '2026-04-01') returning id into paid_id;
  insert into public.training_cycles (enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status)
  values (paid_id, dated_student, company, 1, '2026-04-01', '2026-05-12', 'completed');
  begin
    insert into public.enrollments (student_id, company_id, plan_id, status, start_date, end_date, training_start_date)
    values (dated_student, company, plan, 'active', '2026-06-01', '2026-11-15', '2026-06-01');
    raise exception 'dated insert bypassed readiness with only a historical placeholder';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_requires_trainer', sqlerrm;
  end;
  begin
    insert into public.enrollments (student_id, company_id, plan_id, status, start_date, end_date, training_start_date, trainer_id)
    values (dated_student, company, plan, 'active', '2026-06-01', '2026-11-15', '2026-06-01', trainer);
    raise exception 'dated insert bypassed completed assessment';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_requires_completed_assessment', sqlerrm;
  end;
  insert into public.functional_assessments (company_id, student_id, status) values (company, dated_student, 'completed');
  begin
    insert into public.enrollments (student_id, company_id, plan_id, status, start_date, end_date, training_start_date, trainer_id)
    values (dated_student, company, plan, 'active', '2026-06-01', '2026-11-15', '2026-05-31', trainer);
    raise exception 'dated insert silently clamped the early date';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_before_commercial_start', sqlerrm;
  end;
  insert into public.enrollments (student_id, company_id, plan_id, status, start_date, end_date, training_start_date, trainer_id)
  values (dated_student, company, plan, 'active', '2026-06-01', '2026-11-15', '2026-06-02', trainer) returning id into paid_id;
  assert (select min(start_date) from public.training_cycles where enrollment_id = paid_id) = date '2026-06-02',
    'ready dated insert did not schedule from the explicit date';
  begin
    update public.enrollments set start_date = '2026-06-03' where id = paid_id;
    raise exception 'commercial date update silently moved an existing training start out of bounds';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_before_commercial_start', sqlerrm;
  end;

  insert into public.enrollments (student_id, company_id, plan_id, status, start_date, end_date)
  values (transition_student, company, plan, 'inactive', '2026-06-01', '2026-11-15') returning id into manual_id;
  begin
    update public.enrollments set status = 'active', training_start_date = '2026-06-02' where id = manual_id;
    raise exception 'status and date update bypassed readiness on an unmarked enrollment';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_requires_trainer', sqlerrm;
  end;
  insert into public.functional_assessments (company_id, student_id, status) values (company, transition_student, 'completed');
  begin
    update public.enrollments set status = 'active', training_start_date = '2026-05-31', trainer_id = trainer where id = manual_id;
    raise exception 'status and date update silently clamped the early date';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_before_commercial_start', sqlerrm;
  end;
  update public.enrollments set status = 'active', training_start_date = '2026-06-02', trainer_id = trainer where id = manual_id;
  assert (select min(start_date) from public.training_cycles where enrollment_id = manual_id) = date '2026-06-02',
    'ready status and date update did not create cycles';

  insert into public.enrollments (student_id, company_id, plan_id, status, start_date, end_date, training_start_date)
  values (predated_student, company, plan, 'inactive', '2026-06-01', '2026-11-15', '2026-06-02') returning id into manual_id;
  begin
    update public.enrollments set status = 'active' where id = manual_id;
    raise exception 'status-only activation trusted a date preloaded on a nonoperational row';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_requires_trainer', sqlerrm;
  end;

  -- Historical imports created after rollout can still use a null training date.
  insert into public.enrollments (id, student_id, company_id, plan_id, status, start_date, end_date, payment_status)
  values
    (imported_completed, '00000003-0000-4000-8000-000000000018', company, plan, 'completed', '2026-06-01', '2026-11-15', 'paid'),
    (imported_inactive, '00000003-0000-4000-8000-000000000019', company, plan, 'inactive', '2026-06-01', '2026-11-15', 'paid'),
    (imported_empty, '00000003-0000-4000-8000-000000000020', company, plan, 'inactive', '2026-06-01', '2026-11-15', 'paid');
  assert not exists(select 1 from public.enrollments
    where id in (imported_completed, imported_inactive, imported_empty) and requires_explicit_training_start),
    'nonoperational history imports must not be marked on insert';
  insert into public.training_cycles (enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status)
  select id, student_id, company_id, 1, '2026-06-01', '2026-07-12', 'completed'
  from public.enrollments where id in (imported_completed, imported_inactive);
  perform public.set_student_enrollment_status(imported_inactive, 'active');
  assert not (select requires_explicit_training_start from public.enrollments where id = imported_inactive),
    'activation of an inactive import with cycle history must not mark the legacy row';
  perform public.set_student_enrollment_status(imported_empty, 'active');

  insert into public.payments(student_id, company_id, plan_id, asaas_payment_id) values
    (paid_student, company, plan, 'synthetic-first-paid'),
    (paid_student, company, plan, 'synthetic-paid-renewal'),
    ('00000003-0000-4000-8000-000000000013', company, plan, 'synthetic-existing-unpaid');

  select enrollment_id into paid_id from public.apply_paid_payment_lifecycle(
    paid_student, company, plan, 'synthetic-first-paid', date '2026-06-01', date '2026-06-08');
  assert paid_id is not null, 'first payment creates enrollment';
  assert not exists(select 1 from public.training_cycles where enrollment_id = paid_id),
    'first paid activation generated cycles before an explicit training start';

  select enrollment_id into manual_id from public.replace_student_enrollment(
    manual_student, company, plan, null, date '2026-06-01', false) where first_activation;
  assert manual_id is not null, 'first manual activation creates enrollment';
  assert (select sales_stage from public.students where id = manual_student) = 'active_onboarding',
    'first manual activation must enter the assessment receipt workflow';
  assert exists(select 1 from public.enrollments where id = manual_id and training_start_date is null),
    'manual commercial date must not become the first training start';
  assert not exists(select 1 from public.training_cycles where enrollment_id = manual_id),
    'first manual activation generated cycles';

  insert into public.training_cycles (enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status)
  values ('00000005-0000-4000-8000-000000000016', historical_student, company, 1, '2026-05-01', '2026-05-31', 'completed')
  returning id into history_cycle_id;
  insert into public.workouts (cycle_id, company_id, exercises)
  values (history_cycle_id, company, '[{"exercise_name":"Synthetic history"}]');
  select enrollment_id into historical_id from public.replace_student_enrollment(
    historical_student, company, plan, null, date '2026-06-01', false) where not first_activation;
  assert historical_id is not null,
    'historical enrollment must prevent a first-activation classification even with no activation timestamp';
  assert (select sales_stage from public.students where id = historical_student) = 'active',
    'historical re-enrollment must stay active';
  assert (select carried_over_cycle_id from public.enrollments where id = historical_id) = history_cycle_id,
    'historical re-enrollment lost the closed paid term carry-over';
  select id into cycle_id from public.training_cycles where enrollment_id = historical_id order by start_date limit 1;
  assert cycle_id is not null, 'historical re-enrollment lost normal cycle generation';
  perform public.reschedule_training_cycles_from(historical_id, cycle_id, date '2026-06-02');
  assert (select training_start_date from public.enrollments where id = historical_id) = date '2026-06-02',
    'historical non-null reschedule unexpectedly required initial assessment or trainer';
  select enrollment_id into renewal_id from public.replace_student_enrollment(
    already_active_student, company, plan, null, date '2026-06-01', false) where not first_activation;
  assert renewal_id is not null and (select sales_stage from public.students where id = already_active_student) = 'active',
    'existing activation timestamp must prevent a first-activation classification';
  assert not exists(select 1 from public.training_cycles where enrollment_id = renewal_id),
    'first enrollment for an already activated student still awaits a training date';

  assert (select enrollment_id from public.apply_paid_payment_lifecycle(
    paid_student, company, plan, 'synthetic-first-paid', date '2026-06-01', date '2026-06-08')
    where already_applied) = paid_id, 'payment replay must reuse enrollment';

  assert (select enrollment_id from public.apply_paid_payment_lifecycle(
    '00000003-0000-4000-8000-000000000013', company, plan, 'synthetic-existing-unpaid',
    date '2026-06-01', date '2026-06-08')) = unpaid, 'existing unpaid term retained';
  perform private.defer_initial_enrollment_schedule(manual_assessment);
  perform public.set_student_enrollment_status(inactive, 'active');

  foreach renewal_id in array array[paid_id, manual_id, unpaid, manual_assessment, inactive, imported_empty] loop
    result := public.reconcile_prescription_schedule(
      renewal_id, public.get_prescription_schedule(renewal_id)->'contract');
    assert result->>'schedule_state' = 'awaiting_training_start', 'explicit reconcile must respect pending start';
    assert result->'created_cycle_ids' = '[]'::jsonb and result->'audit_id' = 'null'::jsonb,
      'pending reconcile created cycles or an audit receipt';
    assert not exists(select 1 from public.training_cycles where enrollment_id = renewal_id),
      'pending enrollment acquired cycles';
  end loop;

  assert not exists(select 1 from public.sync_prescription_cycles(paid_student, date '2026-06-01')),
    'legacy sync date hint must not start training';
  begin
    insert into public.training_cycles(enrollment_id, student_id, company_id, cycle_number, start_date, end_date, status)
    values (paid_id, paid_student, company, 1, '2026-06-01', '2026-06-30', 'pending');
    raise exception 'direct cycle insert bypassed training-start gate';
  exception when check_violation then
    assert sqlerrm = 'schedule_awaiting_training_start', sqlerrm;
  end;

  assert jsonb_array_length(public.reconcile_prescription_schedule(legacy)->'created_cycle_ids') > 0,
    'existing legacy enrollment with null start lost eligibility';
  select jsonb_agg(to_jsonb(c) order by c.id) into cycle_snapshot
  from public.training_cycles c where c.enrollment_id = legacy;
  perform private.defer_initial_enrollment_schedule(legacy);
  assert not (select requires_explicit_training_start from public.enrollments where id = legacy),
    'manual deferral marked an enrollment with cycle history';
  assert cycle_snapshot = (select jsonb_agg(to_jsonb(c) order by c.id) from public.training_cycles c where c.enrollment_id = legacy),
    'manual deferral changed history';

  -- A second payment cannot supply a training date for an unstarted term.
  select enrollment_id into renewal_id from public.apply_paid_payment_lifecycle(
    paid_student, company, plan, 'synthetic-paid-renewal', date '2026-06-01', date '2026-06-08');
  assert renewal_id is not null and renewal_id <> paid_id, 'paid renewal replaces the term';
  assert (select status from public.enrollments where id = paid_id) = 'completed', 'old paid term preserved';
  assert (select training_start_date from public.enrollments where id = renewal_id) is null,
    'renewal supplied an implicit first training start';
  assert (select sales_stage from public.students where id = paid_student) = 'active_onboarding',
    'renewal before first start closed the assessment receipt workflow';
  assert (public.reconcile_prescription_schedule(renewal_id)->'created_cycle_ids') = '[]'::jsonb,
    'renewal of an unstarted term generated cycles';

  begin
    update public.enrollments set training_start_date = '2026-06-01' where id = renewal_id;
    raise exception 'marked enrollment accepted a date without an assigned trainer';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_requires_trainer', sqlerrm;
  end;

  update public.enrollments set trainer_id = trainer where id = renewal_id;
  insert into public.functional_assessments (company_id, student_id, status) values
    (company, paid_student, 'draft'),
    ('00000002-0000-4000-8000-000000000002', paid_student, 'completed'),
    (company, manual_student, 'completed');
  begin
    update public.enrollments set training_start_date = '2026-06-01' where id = renewal_id;
    raise exception 'marked enrollment accepted a date without its own completed assessment';
  exception when check_violation then
    assert sqlerrm = 'schedule_training_start_requires_completed_assessment', sqlerrm;
  end;
  assert (select training_start_date from public.enrollments where id = renewal_id) is null
    and not exists(select 1 from public.training_cycles where enrollment_id = renewal_id),
    'readiness rejection changed the enrollment or its cycles';

  insert into public.functional_assessments (company_id, student_id, status) values (company, paid_student, 'completed');
  update public.enrollments set training_start_date = '2026-06-01', status = 'awaiting_training' where id = renewal_id;
  select id into cycle_id from public.training_cycles where enrollment_id = renewal_id order by start_date limit 1;
  assert cycle_id is not null, 'explicit date did not generate cycles';
  select jsonb_agg(to_jsonb(c) order by c.id) into cycle_snapshot
  from public.training_cycles c where c.enrollment_id = renewal_id;
  update public.enrollments set training_start_date = '2026-06-01', status = 'awaiting_training' where id = renewal_id;
  assert (public.reconcile_prescription_schedule(renewal_id)->'created_cycle_ids') = '[]'::jsonb,
    'repeated schedule mutation generated duplicate cycles';
  assert cycle_snapshot = (select jsonb_agg(to_jsonb(c) order by c.id) from public.training_cycles c where c.enrollment_id = renewal_id),
    'repeated date or reconcile changed cycle identities or data';

  insert into public.workouts(cycle_id, company_id, exercises)
  values (cycle_id, company, '[{"exercise_name":"Synthetic"}]') returning id into workout_id;
  select to_jsonb(w) into old_workout from public.workouts w where id = workout_id;
  select enrollment_id into manual_id from public.replace_student_enrollment(
    paid_student, company, plan, null, date '2026-06-02', false) where not first_activation;
  assert exists(select 1 from public.enrollments where id = manual_id and carried_over_cycle_id = cycle_id),
    'replacement lost prior published workout continuity';
  assert old_workout = (select to_jsonb(w) from public.workouts w where id = workout_id),
    'replacement changed historical workout';
  assert cycle_snapshot = (select jsonb_agg(to_jsonb(c) order by c.id) from public.training_cycles c where c.enrollment_id = renewal_id),
    'replacement changed historical cycles';
  assert exists(select 1 from public.training_cycles where enrollment_id = manual_id),
    'started enrollment replacement lost normal generation';
end $$;

select 'INITIAL_ENROLLMENT_SCHEDULE_ASSERTIONS_PASSED';
rollback;
