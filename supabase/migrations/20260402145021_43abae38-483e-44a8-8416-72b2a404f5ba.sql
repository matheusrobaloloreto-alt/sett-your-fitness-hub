
ALTER TABLE public.student_evaluations
ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.enrollments
ADD COLUMN IF NOT EXISTS financial_notes text,
ADD COLUMN IF NOT EXISTS payment_date date,
ADD COLUMN IF NOT EXISTS payment_method text;
