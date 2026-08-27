-- One completed workout session may produce at most one feedback record.
-- Existing duplicate sessions intentionally fail this migration: do not delete
-- or merge feedback automatically because trainer replies and notes may differ.
create unique index if not exists workout_feedback_student_session_key
  on public.workout_feedback (student_id, workout_session_id)
  where workout_session_id is not null;

comment on index public.workout_feedback_student_session_key is
  'Prevents client retries from duplicating feedback and its optional CRM mirror.';
