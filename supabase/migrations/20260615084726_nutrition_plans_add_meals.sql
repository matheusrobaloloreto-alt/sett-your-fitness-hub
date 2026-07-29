-- Plano de refeições prático (por refeição) individualizado pela anamnese. O conteúdo é preenchido
-- pela edge ai-nutrition-plan (lane Codex). Shape esperado pelo app:
-- [{ meal, time, focus, eat: text[], go_easy: text[], note }]
ALTER TABLE public.nutrition_plans ADD COLUMN IF NOT EXISTS meals jsonb;;
