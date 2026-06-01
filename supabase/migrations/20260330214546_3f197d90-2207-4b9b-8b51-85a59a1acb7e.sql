
-- Remove FK constraints that reference auth.users to allow data import
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.company_members DROP CONSTRAINT IF EXISTS company_members_user_id_fkey;
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
ALTER TABLE public.student_evaluations DROP CONSTRAINT IF EXISTS student_evaluations_evaluator_id_fkey;
