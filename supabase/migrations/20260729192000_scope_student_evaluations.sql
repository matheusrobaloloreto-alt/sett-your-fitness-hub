-- Legacy evaluations lacked company_id even though their students were valid.
update public.student_evaluations evaluation
set company_id = student.company_id
from public.students student
where student.id = evaluation.student_id
  and (
    evaluation.company_id is null
    or evaluation.company_id is distinct from student.company_id
  );

alter table public.student_evaluations
  alter column company_id set not null;

alter table public.student_evaluations
  drop constraint if exists student_evaluations_company_id_fkey;
alter table public.student_evaluations
  add constraint student_evaluations_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;
