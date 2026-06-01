
-- Inserir aluna Ludmila com mesmo ID do Asaas externalReference
INSERT INTO public.students (
  id, company_id, full_name, email, phone, whatsapp,
  birth_date, cpf, cep, address, address_number, neighborhood, city, state,
  selected_plan_id, asaas_customer_id, status, created_at, updated_at
) VALUES (
  '23472c23-209a-4de9-b43a-ee45001ef168',
  'c051e80e-c10c-4522-a88a-e5da26a74d82',
  'Ludmila Queiroz',
  'ludmilaqcb@gmail.com',
  '(64) 99236-9698',
  '64992369698',
  '2003-08-23',
  '70176512195',
  '74255050',
  'av c 106 quadra 286 lote 15',
  '00',
  'Jardim América',
  'Goiânia',
  'GO',
  '88faf03c-c488-421f-af1d-d406fb4bb70f',
  'cus_000172243938',
  'active',
  '2026-04-21 17:53:08.064806+00',
  now()
);

-- Criar enrollment (matrícula) ativa e paga
INSERT INTO public.enrollments (
  company_id, student_id, plan_id, status,
  payment_status, payment_method, payment_date,
  start_date, training_start_date
) VALUES (
  'c051e80e-c10c-4522-a88a-e5da26a74d82',
  '23472c23-209a-4de9-b43a-ee45001ef168',
  '88faf03c-c488-421f-af1d-d406fb4bb70f',
  'active',
  'paid',
  'CREDIT_CARD',
  CURRENT_DATE,
  CURRENT_DATE,
  CURRENT_DATE
);

-- Registrar pagamento confirmado do Asaas
INSERT INTO public.payments (
  company_id, student_id, enrollment_id,
  amount, value, status, payment_method, billing_type,
  installment_count, asaas_customer_id, paid_at, due_date
) VALUES (
  'c051e80e-c10c-4522-a88a-e5da26a74d82',
  '23472c23-209a-4de9-b43a-ee45001ef168',
  (SELECT id FROM public.enrollments WHERE student_id = '23472c23-209a-4de9-b43a-ee45001ef168' ORDER BY created_at DESC LIMIT 1),
  1380.00, 1380.00,
  'confirmed', 'CREDIT_CARD', 'CREDIT_CARD',
  6, 'cus_000172243938',
  now(), CURRENT_DATE
);
