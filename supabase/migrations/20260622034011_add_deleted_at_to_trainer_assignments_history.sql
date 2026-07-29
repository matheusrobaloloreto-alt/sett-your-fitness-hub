-- P17 — soft-delete de período de atribuição de trainer (recuperável; herda RLS).
ALTER TABLE public.trainer_assignments_history ADD COLUMN IF NOT EXISTS deleted_at timestamptz;;
