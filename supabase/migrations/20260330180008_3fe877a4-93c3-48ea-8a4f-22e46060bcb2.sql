
-- More missing columns

-- Anamnesis: more structured fields from StudentDetail
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS nutrition text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS sleep_hours text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS restorative_sleep text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS food_allergies text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS previous_experience text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS motivation text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS observation text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS emergency_contact text;

-- Student evaluations: type column
ALTER TABLE public.student_evaluations ADD COLUMN IF NOT EXISTS type text;

-- Workout logs: weight column
ALTER TABLE public.workout_logs ADD COLUMN IF NOT EXISTS weight numeric;
