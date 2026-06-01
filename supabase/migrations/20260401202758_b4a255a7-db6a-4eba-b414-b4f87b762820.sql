ALTER TABLE public.exercise_muscle_targets 
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS volume_percentage numeric NOT NULL DEFAULT 100;

-- Migrate existing data
UPDATE public.exercise_muscle_targets 
SET role = CASE WHEN is_primary = true THEN 'primary' ELSE 'secondary' END,
    volume_percentage = CASE WHEN is_primary = true THEN 100 ELSE 50 END;