
-- Remove remaining FK constraints to auth.users for data import
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_assigned_trainer_id_fkey;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_user_id_fkey;
ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_trainer_id_fkey;
