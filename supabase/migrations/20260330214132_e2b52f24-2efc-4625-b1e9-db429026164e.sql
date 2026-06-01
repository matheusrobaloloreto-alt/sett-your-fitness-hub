
-- Delete existing muscle_groups to re-insert with correct IDs from original DB
DELETE FROM public.exercise_muscle_targets;
DELETE FROM public.muscle_groups;

-- Drop the FK on companies.owner_user_id temporarily and re-add as nullable without FK
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_owner_user_id_fkey;

-- Drop the FK on exercise_library.created_by 
ALTER TABLE public.exercise_library DROP CONSTRAINT IF EXISTS exercise_library_created_by_fkey;
