-- Permite excluir um aluno: as 3 FKs que faltavam viram ON DELETE CASCADE.
alter table public.functional_assessments
  drop constraint if exists functional_assessments_student_id_fkey,
  add constraint functional_assessments_student_id_fkey
    foreign key (student_id) references public.students(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_cycles'
      and column_name = 'student_id'
  ) then
    alter table public.training_cycles
      drop constraint if exists training_cycles_student_id_fkey,
      add constraint training_cycles_student_id_fkey
        foreign key (student_id) references public.students(id) on delete cascade;
  else
    raise notice 'Skipping training_cycles.student_id cascade: column is not present yet.';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'prescription_bundles'
      and column_name = 'training_cycle_id'
  ) then
    alter table public.prescription_bundles
      drop constraint if exists prescription_bundles_training_cycle_id_fkey,
      add constraint prescription_bundles_training_cycle_id_fkey
        foreign key (training_cycle_id) references public.training_cycles(id) on delete cascade;
  else
    raise notice 'Skipping prescription_bundles.training_cycle_id cascade: column is not present yet.';
  end if;
end $$;
