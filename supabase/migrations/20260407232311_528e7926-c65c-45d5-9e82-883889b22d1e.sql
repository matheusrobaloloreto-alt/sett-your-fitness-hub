DO $$
DECLARE
  v_student_id uuid := '559d6fb8-a517-4b29-b422-261c13f45fe6';
  v_plan_id uuid := '88faf03c-c488-421f-af1d-d406fb4bb70f';
  v_company_id uuid := 'c051e80e-c10c-4522-a88a-e5da26a74d82';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.companies WHERE id = v_company_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.students WHERE id = v_student_id AND company_id = v_company_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.plans WHERE id = v_plan_id AND company_id = v_company_id
  ) THEN
    RAISE NOTICE 'Skipping historical enrollment seed: required student, plan, or company is absent.';
    RETURN;
  END IF;

  INSERT INTO public.enrollments (
    student_id, plan_id, company_id, start_date, end_date,
    payment_status, payment_date, status
  ) VALUES (
    v_student_id, v_plan_id, v_company_id, '2026-04-07', '2026-10-04',
    'paid', '2026-04-07', 'active'
  );
END $$;
