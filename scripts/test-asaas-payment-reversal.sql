-- Run against a local database with the Asaas payment reversal migration applied.
begin;

do $$
declare
  v_company uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_old uuid := gen_random_uuid();
  v_current uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
  v_old_charge text := 'qa_old_' || gen_random_uuid();
  v_current_charge text := 'qa_current_' || gen_random_uuid();
  v_sibling_charge text := 'qa_sibling_' || gen_random_uuid();
  v_legacy_charge text := 'qa_legacy_' || gen_random_uuid();
  v_unlinked_charge text := 'qa_unlinked_' || gen_random_uuid();
begin
  if has_function_privilege('anon', 'public.apply_asaas_payment_reversal(text,uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.apply_asaas_payment_reversal(text,uuid,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.apply_asaas_payment_reversal(text,uuid,text)', 'EXECUTE') then
    raise exception 'Asaas reversal RPC must be callable only by the service role';
  end if;

  insert into public.companies (id, name, slug)
  values (v_company, 'Synthetic billing audit', 'qa-asaas-' || v_company);
  insert into public.students (id, company_id, full_name, status)
  values (v_student, v_company, 'Synthetic student', 'active');
  insert into public.plans (id, company_id, name, price, duration_days, duration_weeks, cycle_duration_days, is_active)
  values (v_plan, v_company, 'Synthetic plan', 120, 168, 24, 42, true);
  insert into public.enrollments (id, company_id, student_id, plan_id, start_date, end_date, status, payment_status)
  values (v_old, v_company, v_student, v_plan, current_date - 168, current_date - 1, 'completed', 'paid'),
         (v_current, v_company, v_student, v_plan, current_date, current_date + 167, 'active', 'paid');
  insert into public.payments (company_id, student_id, plan_id, asaas_payment_id, status, amount, value, enrollment_id)
  values (v_company, v_student, v_plan, v_old_charge, 'REFUNDED', 120, 120, v_old),
         (v_company, v_student, v_plan, v_current_charge, 'CONFIRMED', 120, 120, v_current),
         (v_company, v_student, v_plan, v_unlinked_charge, 'OVERDUE', 120, 120, null),
         (v_company, v_student, v_plan, v_legacy_charge, 'REFUNDED', 120, 120, v_current);
  perform public.apply_asaas_payment_reversal(v_legacy_charge, v_company, 'REFUNDED');

  perform public.apply_asaas_payment_reversal(v_old_charge, v_company, 'REFUNDED');
  perform public.apply_asaas_payment_reversal(v_old_charge, v_company, 'REFUNDED');
  perform public.apply_asaas_payment_reversal(v_unlinked_charge, v_company, 'OVERDUE');
  perform public.apply_asaas_payment_reversal(v_current_charge, v_company, 'REFUNDED');
  if (select status from public.students where id = v_student) is distinct from 'active'
    or (select payment_status from public.enrollments where id = v_current) is distinct from 'paid'
    or (select payment_status from public.enrollments where id = v_old) is distinct from 'paid' then
    raise exception 'Historical, unlinked or stale notification changed a current or historical enrollment';
  end if;

  update public.payments set status = 'OVERDUE' where asaas_payment_id = v_current_charge;
  if (select status from public.payments where asaas_payment_id = v_current_charge) is distinct from 'CONFIRMED' then
    raise exception 'Overdue response must not regress a confirmed charge';
  end if;
  perform public.apply_asaas_payment_reversal(v_current_charge, v_company, 'OVERDUE');
  if (select payment_status from public.enrollments where id = v_current) is distinct from 'paid' then
    raise exception 'Late overdue response must not regress the enrollment';
  end if;

  update public.payments set status = 'OVERDUE', asaas_payment_id = v_current_charge || '_overdue'
    where asaas_payment_id = v_current_charge;
  v_current_charge := v_current_charge || '_overdue';
  perform public.apply_asaas_payment_reversal(v_current_charge, v_company, 'OVERDUE');
  if (select status from public.students where id = v_student) is distinct from 'active'
    or (select payment_status from public.enrollments where id = v_current) is distinct from 'overdue' then
    raise exception 'Overdue should mark the linked enrollment without deactivating the student';
  end if;

  update public.payments set status = 'REFUNDED', lifecycle_enrollment_id = v_current,
      lifecycle_applied_at = now(), lifecycle_first_activation = true, installment_count = 3
    where asaas_payment_id = v_current_charge;
  perform public.apply_asaas_payment_reversal(v_current_charge, v_company, 'REFUNDED');
  if (select status from public.students where id = v_student) is distinct from 'active'
    or (select payment_status from public.enrollments where id = v_current) is distinct from 'overdue' then
    raise exception 'Refunded installment must keep the access for reconciliation';
  end if;
  update public.payments set installment_count = 1 where asaas_payment_id = v_current_charge;
  update public.payments set status = 'CONFIRMED' where asaas_payment_id = v_current_charge;
  if (select status from public.payments where asaas_payment_id = v_current_charge) is distinct from 'REFUNDED' then
    raise exception 'Stale confirmation must not overwrite a completed refund';
  end if;
  insert into public.payments (company_id, student_id, plan_id, asaas_payment_id, status, amount, value, enrollment_id)
  values (v_company, v_student, v_plan, v_sibling_charge, 'RECEIVED', 120, 120, v_current);
  perform public.apply_asaas_payment_reversal(v_current_charge, v_company, 'REFUNDED');
  if (select status from public.students where id = v_student) is distinct from 'active'
    or (select payment_status from public.enrollments where id = v_current) is distinct from 'overdue' then
    raise exception 'Another confirmed charge must preserve the enrollment';
  end if;
  delete from public.payments where asaas_payment_id = v_sibling_charge;
  update public.enrollments set status = 'awaiting_training' where id = v_current;

  perform public.apply_asaas_payment_reversal(v_current_charge, v_company, 'REFUNDED');
  perform public.apply_asaas_payment_reversal(v_current_charge, v_company, 'REFUNDED');
  if (select status from public.students where id = v_student) is distinct from 'pending'
    or (select payment_status from public.enrollments where id = v_current) is distinct from 'refunded' then
    raise exception 'Full refund did not update the linked active enrollment and its student';
  end if;
end;
$$;

rollback;
