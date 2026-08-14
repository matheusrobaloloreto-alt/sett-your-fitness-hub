-- Keep the WhatsApp category selector usable for companies that were created
-- before category management existed.
insert into public.student_categories (company_id, name, color, sort_order)
select
  companies.id,
  'regular',
  '#64748b',
  0
from public.companies
where not exists (
  select 1
  from public.student_categories
  where student_categories.company_id = companies.id
    and lower(student_categories.name) = 'regular'
);
