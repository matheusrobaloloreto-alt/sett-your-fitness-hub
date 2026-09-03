alter table public.students
  add column if not exists billing_country_code text,
  add column if not exists billing_name text,
  add column if not exists billing_email text,
  add column if not exists billing_cpf_cnpj text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_address text,
  add column if not exists billing_address_number text,
  add column if not exists billing_neighborhood text,
  add column if not exists billing_phone text;

alter table public.students
  drop constraint if exists students_billing_country_code_format;

alter table public.students
  add constraint students_billing_country_code_format
  check (
    billing_country_code is null
    or billing_country_code ~ '^[A-Z]{2}$'
  );

update public.students
set billing_country_code = 'BR',
    billing_name = coalesce(billing_name, full_name),
    billing_email = coalesce(billing_email, email),
    billing_cpf_cnpj = coalesce(billing_cpf_cnpj, regexp_replace(coalesce(cpf, ''), '\D', '', 'g')),
    billing_postal_code = coalesce(billing_postal_code, regexp_replace(coalesce(cep, zip_code, ''), '\D', '', 'g')),
    billing_address = coalesce(billing_address, address),
    billing_address_number = coalesce(billing_address_number, address_number),
    billing_neighborhood = coalesce(billing_neighborhood, neighborhood),
    billing_phone = coalesce(billing_phone, whatsapp, phone)
where billing_country_code is null
  and country_code = 'BR';

comment on column public.students.billing_country_code is
  'Country of the fiscal payer. Kept separate from contact/residence country so international WhatsApp numbers are not rewritten.';

comment on column public.students.billing_cpf_cnpj is
  'Fiscal payer document. May belong to a payer who is not the student; never overwrite student identity from checkout.';

comment on column public.students.billing_name is
  'Fiscal payer name. It may differ from the student and is used only for billing.';
