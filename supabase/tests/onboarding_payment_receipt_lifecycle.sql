-- Integration rehearsal against the full schema. Wrap in a rollback transaction.
do $test$
declare
  v_company uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_paid_student uuid := gen_random_uuid();
  v_manual_student uuid := gen_random_uuid();
  v_reconciled_student uuid := gen_random_uuid();
  v_restored_student uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
  v_paid_key text := 'sett-onboarding-' || gen_random_uuid();
  v_renewal_key text := 'sett-onboarding-' || gen_random_uuid();
  v_closed_renewal_key text := 'sett-onboarding-' || gen_random_uuid();
  v_offline_renewal_key text := 'sett-onboarding-' || gen_random_uuid();
  v_today date := public.current_business_date();
  v_paid record;
  v_retry record;
  v_renewal record;
  v_manual record;
  v_manual_enrollment uuid;
  v_result jsonb;
  v_old_cycle uuid;
  v_old_workout uuid;
  v_workout_snapshot jsonb;
  v_cycles_snapshot jsonb;
  v_reconciled_enrollment uuid;
  v_restored_enrollment uuid;
  v_restored_cycle uuid;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_staff, 'authenticated', 'authenticated', v_staff || '@example.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (v_staff, 'admin');
  insert into public.companies (id, name, slug)
  values (v_company, 'Synthetic onboarding lifecycle', 'onboarding-lifecycle-' || v_company);
  insert into public.company_members (company_id, user_id) values (v_company, v_staff);
  insert into public.students (id, company_id, full_name, status, sales_stage)
  values (v_paid_student, v_company, 'Synthetic paid', 'pending', 'payment_pending'),
    (v_manual_student, v_company, 'Synthetic manual', 'pending', 'payment_pending'),
    (v_reconciled_student, v_company, 'Synthetic reconciled', 'pending', 'payment_pending'),
    (v_restored_student, v_company, 'Synthetic legacy restoration', 'active', 'active');
  insert into public.plans (id, company_id, name, price, duration_days, duration_weeks, cycle_duration_days, plan_kind, is_active)
  values (v_plan, v_company, 'Synthetic 28-day plan', 100, 28, 4, 14, 'standard', true);
  insert into public.payments (student_id, company_id, plan_id, amount, value, status, asaas_payment_id)
  values (v_paid_student, v_company, v_plan, 100, 100, 'RECEIVED', v_paid_key),
    (v_paid_student, v_company, v_plan, 100, 100, 'RECEIVED', v_renewal_key),
    (v_paid_student, v_company, v_plan, 100, 100, 'RECEIVED', v_closed_renewal_key),
    (v_restored_student, v_company, v_plan, 100, 100, 'RECEIVED', v_offline_renewal_key);

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select * into strict v_paid from public.apply_paid_payment_lifecycle(
    v_paid_student, v_company, v_plan, v_paid_key, v_today - 28, null
  );
  select * into strict v_retry from public.apply_paid_payment_lifecycle(
    v_paid_student, v_company, v_plan, v_paid_key, v_today - 28, v_today - 21
  );
  if not v_paid.first_activation or not v_retry.already_applied or v_retry.enrollment_id <> v_paid.enrollment_id
    or exists (select 1 from public.training_cycles where enrollment_id = v_paid.enrollment_id)
    or exists (select 1 from public.students where id = v_paid_student and assessment_due_at is not null)
    or exists (select 1 from public.assessment_material_receipts where student_id = v_paid_student) then
    raise exception 'Paid onboarding started cycles or a deadline early, or a retry changed the enrollment';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);
  v_manual_enrollment := public.activate_student_enrollment_manually(
    v_company, v_manual_student, v_plan, v_today, 'Ativação autorizada em teste'
  );
  begin
    perform public.activate_student_enrollment_manually(v_company, v_manual_student, v_plan, v_today, 'Repetição da ativação');
    raise exception 'Manual retry activated another enrollment';
  exception when sqlstate 'PT409' then null;
  end;
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.students where id = v_manual_student and status = 'active'
      and sales_stage = 'active_onboarding' and selected_plan_id = v_plan and assessment_due_at is null)
    or (select count(*) from public.enrollments where student_id = v_manual_student and company_id = v_company) <> 1
    or not exists (select 1 from public.student_funnel_events where student_id = v_manual_student and company_id = v_company
      and payload->>'actor_id' = v_staff::text and payload->>'enrollment_id' = v_manual_enrollment::text)
    or exists (select 1 from public.payments where student_id = v_manual_student and company_id = v_company)
    or exists (select 1 from public.enrollments where id = v_manual_enrollment and payment_date is not null)
    or exists (select 1 from public.training_cycles where enrollment_id = v_manual_enrollment) then
    raise exception 'Manual first enrollment did not wait in onboarding';
  end if;
  -- A stale Kanban stage cannot stop staff from recording the receipt of an unstarted enrollment.
  update public.students set sales_stage = 'active' where id = v_manual_student;

  insert into public.enrollments (
    student_id, company_id, plan_id, start_date, end_date, status, payment_status
  ) values (v_reconciled_student, v_company, v_plan, v_today, v_today + 27, 'active', 'paid')
  returning id into v_reconciled_enrollment;
  v_result := public.move_student_to_assessment_stage(v_reconciled_student, 'Pagamento conferido na massa de teste');
  if v_result->'assessment_due_at' <> 'null'::jsonb
    or exists (select 1 from public.students where id = v_reconciled_student and assessment_due_at is not null)
    or exists (select 1 from public.training_cycles where enrollment_id = v_reconciled_enrollment) then
    raise exception 'Manual payment reconciliation started the deadline or schedule early';
  end if;

  perform set_config('role', 'authenticated', true);
  perform public.record_assessment_material_receipt(v_company, v_paid_student, v_today - 27, 'Vídeo do aluno pago');
  perform public.record_assessment_material_receipt(v_company, v_manual_student, v_today, 'Vídeo do aluno ativado manualmente');
  perform public.record_assessment_material_receipt(v_company, v_reconciled_student, v_today, 'Vídeo do aluno com pagamento conciliado');
  if (select count(*) from public.assessment_material_receipts where company_id = v_company) <> 3 then
    raise exception 'Onboarding paths could not record material receipts';
  end if;
  perform set_config('role', 'postgres', true);

  begin
    update public.enrollments set training_start_date = v_today - 26 where id = v_paid.enrollment_id;
    raise exception 'Start without assessment or trainer was accepted';
  exception when check_violation then null;
  end;
  insert into public.functional_assessments (student_id, company_id, status)
  values (v_paid_student, v_company, 'completed'), (v_manual_student, v_company, 'completed');
  update public.enrollments set trainer_id = v_staff, training_start_date = v_today - 26
  where id = v_paid.enrollment_id;
  update public.enrollments set trainer_id = v_staff, training_start_date = v_today + 1
  where id = v_manual_enrollment;
  if (select min(start_date) from public.training_cycles where enrollment_id = v_paid.enrollment_id)
      is distinct from v_today - 26
    or (select min(start_date) from public.training_cycles where enrollment_id = v_manual_enrollment)
      is distinct from v_today + 1 then
    raise exception 'Explicit training start did not determine the first cycle date';
  end if;

  select id into strict v_old_cycle from public.training_cycles where enrollment_id = v_paid.enrollment_id
  order by end_date desc limit 1;
  insert into public.workouts (cycle_id, company_id, title, exercises)
  values (v_old_cycle, null, 'Synthetic published legacy workout', '[{"name":"Remada","sets":3}]')
  returning id into v_old_workout;
  select to_jsonb(w) into v_workout_snapshot from public.workouts w where id = v_old_workout;
  select jsonb_agg(to_jsonb(c) order by c.id) into v_cycles_snapshot
  from public.training_cycles c where enrollment_id = v_paid.enrollment_id;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select * into strict v_renewal from public.apply_paid_payment_lifecycle(
    v_paid_student, v_company, v_plan, v_renewal_key, v_today, null
  );
  if v_renewal.first_activation or v_renewal.enrollment_id = v_paid.enrollment_id
    or not exists (
      select 1 from public.enrollments where id = v_renewal.enrollment_id and carried_over_cycle_id = v_old_cycle
    )
    or not exists (select 1 from public.training_cycles where enrollment_id = v_renewal.enrollment_id)
    or (select to_jsonb(w) from public.workouts w where id = v_old_workout) is distinct from v_workout_snapshot
    or (select jsonb_agg(to_jsonb(c) order by c.id) from public.training_cycles c where enrollment_id = v_paid.enrollment_id)
      is distinct from v_cycles_snapshot
    or (select received_on from public.assessment_material_receipts where student_id = v_paid_student)
      is distinct from v_today - 27 then
    raise exception 'Renewal lost carry-over, altered history or reset the onboarding deadline';
  end if;

  update public.enrollments set status = 'completed' where id = v_renewal.enrollment_id;
  select * into strict v_renewal from public.apply_paid_payment_lifecycle(
    v_paid_student, v_company, v_plan, v_closed_renewal_key, v_today, null
  );
  if v_renewal.first_activation or not exists (
    select 1 from public.enrollments where id = v_renewal.enrollment_id and carried_over_cycle_id = v_old_cycle
  ) then
    raise exception 'Paid renewal after closure lost carry-over';
  end if;

  update public.enrollments set status = 'completed' where id = v_renewal.enrollment_id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  select * into strict v_manual from public.replace_student_enrollment(v_paid_student, v_company, v_plan, null, v_today, false);
  if v_manual.first_activation or v_manual.carried_over_cycle_id is distinct from v_old_cycle then
    raise exception 'Manual renewal after closure lost carry-over';
  end if;

  insert into public.enrollments (
    student_id, company_id, plan_id, start_date, end_date, training_start_date, status, payment_status
  ) values (v_restored_student, v_company, v_plan, v_today - 14, v_today + 13, v_today - 28, 'inactive', 'paid')
  returning id into v_restored_enrollment;
  insert into public.training_cycles (
    enrollment_id, student_id, company_id, cycle_number, start_date, end_date, duration_weeks, status, prescribed_offline_at
  ) values (v_restored_enrollment, v_restored_student, v_company, 1, v_today - 28, v_today - 15, 2, 'completed', now())
  returning id into v_restored_cycle;
  select to_jsonb(c) into v_cycles_snapshot from public.training_cycles c where id = v_restored_cycle;
  perform public.set_student_enrollment_status(v_restored_enrollment, 'active');
  if not exists (select 1 from public.enrollments where id = v_restored_enrollment
      and status = 'active' and training_start_date = v_today - 28)
    or (select to_jsonb(c) from public.training_cycles c where id = v_restored_cycle) is distinct from v_cycles_snapshot then
    raise exception 'Legacy status restoration rewrote the training date or historical cycle';
  end if;
  update public.enrollments set status = 'completed' where id = v_restored_enrollment;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  select * into strict v_renewal from public.apply_paid_payment_lifecycle(
    v_restored_student, v_company, v_plan, v_offline_renewal_key, v_today, null
  );
  if v_renewal.first_activation
    or not exists (select 1 from public.enrollments where id = v_renewal.enrollment_id
      and training_start_date = v_today and carried_over_cycle_id is null)
    or not exists (select 1 from public.training_cycles where enrollment_id = v_renewal.enrollment_id)
    or (select to_jsonb(c) from public.training_cycles c where id = v_restored_cycle) is distinct from v_cycles_snapshot then
    raise exception 'Offline renewal repeated onboarding, exposed a nonexistent workout, or rewrote history';
  end if;
end;
$test$;
