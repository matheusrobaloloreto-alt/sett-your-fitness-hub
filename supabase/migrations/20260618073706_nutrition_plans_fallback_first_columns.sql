-- Alinha o schema de nutrition_plans com o que ai-nutrition-meals lê/escreve e com o motor
-- determinístico (fallback-first). Tudo aditivo e nullable — não quebra dados existentes.
ALTER TABLE public.nutrition_plans
  ADD COLUMN IF NOT EXISTS meals jsonb,
  ADD COLUMN IF NOT EXISTS target_calories numeric,
  ADD COLUMN IF NOT EXISTS target_protein_g numeric,
  ADD COLUMN IF NOT EXISTS target_carbs_g numeric,
  ADD COLUMN IF NOT EXISTS target_fat_g numeric,
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS context_dietary_restrictions text,
  ADD COLUMN IF NOT EXISTS ai_rationale text;;
