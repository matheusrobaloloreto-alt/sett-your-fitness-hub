-- Execute as a reviewed migration, not through an app client. No data DML.
-- Retain fractional RPE, existing receipts and globally unique revisions.
-- Never reset the sequence or restore per-slot revisions: that reopens ABA.
set lock_timeout = '5s';
set statement_timeout = '30s';
drop function public.save_workout_logs_if_current(jsonb);
alter function public.save_workout_logs_if_current_core(jsonb)
  rename to save_workout_logs_if_current;
revoke all on function public.save_workout_logs_if_current(jsonb) from public, anon;
grant execute on function public.save_workout_logs_if_current(jsonb) to authenticated, service_role;
