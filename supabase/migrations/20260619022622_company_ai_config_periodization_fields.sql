ALTER TABLE public.company_ai_config
  ADD COLUMN IF NOT EXISTS periodization_doctrine text,
  ADD COLUMN IF NOT EXISTS strength_endurance_integration text;;
