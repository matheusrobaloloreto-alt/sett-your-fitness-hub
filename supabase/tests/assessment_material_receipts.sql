-- Run inside a disposable database or a transaction that ends in ROLLBACK.
do $test$
declare
  v_company uuid := gen_random_uuid();
  v_other_company uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_student uuid := gen_random_uuid();
  v_no_material uuid := gen_random_uuid();
  v_receipt public.assessment_material_receipts%rowtype;
  v_retry public.assessment_material_receipts%rowtype;
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
  values (v_staff, 'authenticated', 'authenticated', v_staff || '@example.invalid', now(), now()),
    (v_outsider, 'authenticated', 'authenticated', v_outsider || '@example.invalid', now(), now());
  insert into public.user_roles (user_id, role) values (v_staff, 'admin'), (v_outsider, 'admin');
  insert into public.companies (id, name, slug)
  values (v_company, 'Synthetic assessment receipt', 'assessment-receipt-' || v_company),
    (v_other_company, 'Synthetic assessment other company', 'assessment-receipt-' || v_other_company);
  insert into public.company_members (company_id, user_id) values (v_company, v_staff), (v_other_company, v_outsider);
  insert into public.students (id, company_id, full_name, status, sales_stage, assessment_due_at)
  values (v_student, v_company, 'Synthetic receipt student', 'active', 'active_onboarding', '2026-10-30'),
    (v_no_material, v_company, 'Synthetic student still waiting', 'active', 'active_onboarding', '2026-10-30');
  insert into public.company_agenda_availability (company_id, settings, version, updated_by)
  values (v_company, '{"timezone":"America/Sao_Paulo","weekly":[],"exceptions":[{"date":"2026-11-02","windows":[]}]}'::jsonb, 1, v_staff);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('role', 'authenticated', true);
  if exists (select 1 from public.assessment_material_receipts where student_id in (v_student, v_no_material)) then
    raise exception 'A legacy due date created a receipt';
  end if;

  select * into v_receipt from public.record_assessment_material_receipt(v_company, v_student, date '2026-10-30', 'Vídeo recebido pelo WhatsApp');
  if v_receipt.received_on is distinct from date '2026-10-30'
    or v_receipt.material_reference is distinct from 'Vídeo recebido pelo WhatsApp'
    or v_receipt.assessment_due_on is distinct from date '2026-11-04'
    or v_receipt.first_prescription_due_on is distinct from date '2026-11-09'
    or v_receipt.recorded_by is distinct from v_staff then
    raise exception 'Weekend, holiday, or receipt provenance was handled incorrectly';
  end if;
  select * into v_retry from public.record_assessment_material_receipt(v_company, v_student, date '2026-10-30', 'Vídeo recebido pelo WhatsApp');
  if v_receipt is distinct from v_retry then raise exception 'Receipt retry changed the saved row'; end if;

  begin
    perform public.record_assessment_material_receipt(v_company, v_student, date '2026-10-31', 'Vídeo recebido pelo WhatsApp');
    raise exception 'Different receipt date replaced the original';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.record_assessment_material_receipt(v_company, v_student, date '2026-10-30', 'Outro material');
    raise exception 'Different receipt reference replaced the original';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.record_assessment_material_receipt(v_company, v_no_material, current_date + 2, 'Vídeo futuro');
    raise exception 'Future receipt was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.assessment_material_receipts set received_on = date '2026-10-29' where student_id = v_student;
    raise exception 'Receipt was directly edited by a client';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_outsider::text, true);
  if exists (select 1 from public.assessment_material_receipts where student_id = v_student) then
    raise exception 'Receipt leaked across companies';
  end if;
  begin
    perform public.record_assessment_material_receipt(v_company, v_no_material, date '2026-10-30', 'Vídeo recebido');
    raise exception 'Outsider registered material for another company';
  exception when insufficient_privilege then null;
  end;
  perform set_config('role', 'postgres', true);
end;
$test$;
