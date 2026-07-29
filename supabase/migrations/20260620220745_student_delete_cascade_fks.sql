-- Permite excluir um aluno: as 3 FKs que faltavam viram ON DELETE CASCADE.
alter table public.functional_assessments
  drop constraint functional_assessments_student_id_fkey,
  add constraint functional_assessments_student_id_fkey
    foreign key (student_id) references public.students(id) on delete cascade;

alter table public.training_cycles
  drop constraint training_cycles_student_id_fkey,
  add constraint training_cycles_student_id_fkey
    foreign key (student_id) references public.students(id) on delete cascade;

alter table public.prescription_bundles
  drop constraint prescription_bundles_training_cycle_id_fkey,
  add constraint prescription_bundles_training_cycle_id_fkey
    foreign key (training_cycle_id) references public.training_cycles(id) on delete cascade;;
