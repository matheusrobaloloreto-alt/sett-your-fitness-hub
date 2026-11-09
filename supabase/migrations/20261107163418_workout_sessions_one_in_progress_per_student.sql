-- Match the student-wide start guard, including sessions with a null company.
-- Existing duplicates must be reconciled before this migration can succeed.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create unique index workout_sessions_one_in_progress_per_student_uidx
  on public.workout_sessions (student_id)
  where status = 'in_progress';

commit;
