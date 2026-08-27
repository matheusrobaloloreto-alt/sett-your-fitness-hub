alter table public.students
  add column if not exists country_code text not null default 'BR';

alter table public.students
  drop constraint if exists students_country_code_format;

alter table public.students
  add constraint students_country_code_format
  check (country_code ~ '^[A-Z]{2}$');
