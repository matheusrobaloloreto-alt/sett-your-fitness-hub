-- Flags da anamnese "viva"/condicional: gateiam os blocos por modalidade.
-- Quem já tem nutri / assessoria, ou não pratica a modalidade, pula o bloco correspondente.
ALTER TABLE public.student_anamneses
  ADD COLUMN IF NOT EXISTS wants_strength    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wants_running     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wants_cycling     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wants_swimming    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wants_nutrition   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_nutritionist  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_endurance_coach boolean NOT NULL DEFAULT false,
  -- registra quais blocos foram realmente exibidos (a IA sabe o que foi/não foi coletado)
  ADD COLUMN IF NOT EXISTS shown_blocks      text[] NOT NULL DEFAULT '{}'::text[];;
