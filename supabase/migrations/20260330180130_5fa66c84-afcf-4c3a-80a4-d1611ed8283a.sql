
-- More missing columns for anamnesis
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS aware_of_trilogy text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS feel_in_3_months text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS biggest_obstacle text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS extra_comments text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS authorizes_plan text;

-- Workout logs: more fields
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS reps_done integer;
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS set_number integer;
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS session_date date;
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS exercise_index integer;
