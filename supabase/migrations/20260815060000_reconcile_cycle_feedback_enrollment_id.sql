-- Production can contain the legacy cycle_feedback table without enrollment_id
-- because the later CREATE TABLE IF NOT EXISTS migration is a no-op there.
-- Reconcile that drift before the terminal RLS policies reference the column.
alter table public.cycle_feedback
  add column if not exists enrollment_id uuid;
