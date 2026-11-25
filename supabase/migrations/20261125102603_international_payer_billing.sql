-- Additive payer-only fields. Does not change contact identity, residence or existing data.
alter table public.students
  add column if not exists billing_document_type text,
  add column if not exists billing_document_number text,
  add column if not exists billing_city text,
  add column if not exists billing_state text;

comment on column public.students.billing_document_type is
  'Payer foreign document kind: TAX_ID, PASSPORT or NATIONAL_ID; separate from student identity.';
comment on column public.students.billing_document_number is
  'Foreign payer document; never coerced into Brazilian CPF/CNPJ.';
comment on column public.students.billing_city is 'Payer billing city; independent of residence.';
comment on column public.students.billing_state is 'Optional payer billing administrative region.';

-- Null keeps existing rows unchanged; non-null values are bounded and typed.
alter table public.students
  add constraint students_billing_document_type_valid
    check (billing_document_type is null or billing_document_type in ('TAX_ID', 'PASSPORT', 'NATIONAL_ID')),
  add constraint students_billing_document_number_valid
    check (billing_document_number is null or
      (char_length(billing_document_number) between 1 and 80 and billing_document_number ~ '^[A-Z0-9]+$')),
  add constraint students_billing_city_length
    check (billing_city is null or char_length(btrim(billing_city)) between 1 and 160),
  add constraint students_billing_state_length
    check (billing_state is null or char_length(btrim(billing_state)) between 1 and 160);
