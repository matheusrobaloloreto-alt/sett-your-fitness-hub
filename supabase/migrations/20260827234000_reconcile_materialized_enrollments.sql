-- Alunos pagos e já ativos podem ter ficado em awaiting_training após uma
-- migração de treino. Ativa somente a matrícula vigente com ciclo ativo e
-- treino realmente materializado, sem criar duas matrículas ativas.
update public.enrollments as enrollment
set status = 'active', updated_at = now()
where enrollment.status = 'awaiting_training'
  and enrollment.payment_status = 'paid'
  and current_date between enrollment.start_date and enrollment.end_date
  and exists (
    select 1
    from public.students as student
    where student.id = enrollment.student_id
      and student.company_id = enrollment.company_id
      and student.status = 'active'
  )
  and exists (
    select 1
    from public.training_cycles as cycle
    join public.workouts as workout on workout.cycle_id = cycle.id
    where cycle.enrollment_id = enrollment.id
      and cycle.company_id = enrollment.company_id
      and cycle.status = 'active'
      and jsonb_typeof(workout.exercises) = 'array'
      and jsonb_array_length(workout.exercises) > 0
  )
  and not exists (
    select 1
    from public.enrollments as other
    where other.student_id = enrollment.student_id
      and other.company_id = enrollment.company_id
      and other.id <> enrollment.id
      and other.status = 'active'
  );
