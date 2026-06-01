
-- Add missing columns that the frontend code expects

-- Companies: is_active
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Students: missing fields
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS address_number text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS selected_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;

-- Plans: duration_weeks (alias for frontend)
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS duration_weeks integer DEFAULT 4;

-- Exercise library: missing fields
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS video_path text;
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS muscle_group text;

-- Anamnesis: version and structured fields
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS modalities text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS training_days text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS available_days text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS session_duration text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS goals text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS health_conditions text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS medications text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS injuries text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS surgeries text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS pain_areas text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS physical_activity_level text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS sleep_quality text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS stress_level text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS nutrition_habits text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS water_intake text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS smoking text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS alcohol text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS additional_notes text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS restrictions text;
ALTER TABLE public.anamnesis ADD COLUMN IF NOT EXISTS experience_level text;

-- Enrollments: payment_status
ALTER TABLE public.enrollments ADD COLUMN IF NOT EXISTS payment_status text;

-- Payments: missing fields  
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS billing_type text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS value numeric;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_url text;

-- Training cycles: company_id for queries
ALTER TABLE public.training_cycles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
