-- The student portal and prescription publishers already consume this field.
-- Production historically carried it through schema drift, but a fresh replay
-- did not, causing authenticated student cycle loading to fail with 42703.
alter table public.training_cycles
  add column if not exists objective text;
