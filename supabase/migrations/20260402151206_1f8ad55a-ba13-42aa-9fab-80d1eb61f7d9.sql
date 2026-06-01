
-- Force recalculation by doing a two-step update (set to null then back)
-- First, save current values
CREATE TEMP TABLE _tmp_training_dates AS
SELECT id, training_start_date FROM public.enrollments
WHERE training_start_date IS NOT NULL AND plan_id IS NOT NULL;

-- Set to null (trigger won't fire since training_start_date is null)
UPDATE public.enrollments e
SET training_start_date = NULL
FROM _tmp_training_dates t
WHERE e.id = t.id;

-- Set back to original (trigger fires with NEW != OLD)
UPDATE public.enrollments e
SET training_start_date = t.training_start_date
FROM _tmp_training_dates t
WHERE e.id = t.id;

DROP TABLE _tmp_training_dates;
