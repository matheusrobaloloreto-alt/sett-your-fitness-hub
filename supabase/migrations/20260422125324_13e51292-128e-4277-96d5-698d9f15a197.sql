-- Fix Ludmila's enrollment: set end_date based on plan duration. Trainer left NULL by user request.
UPDATE public.enrollments e
SET end_date = e.start_date + (COALESCE(p.duration_days, p.duration_weeks * 7, 30) - 1) * INTERVAL '1 day'
FROM public.plans p
WHERE e.plan_id = p.id
  AND e.id = 'df9fad52-5312-4d87-857a-eb634c29f6a0'
  AND e.end_date IS NULL;