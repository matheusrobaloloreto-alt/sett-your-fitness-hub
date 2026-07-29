-- Gating do "fallback-first": refino por IA desligado por padrão (decisão do Matheus).
-- Aditivo e seguro (linhas existentes recebem o default).
ALTER TABLE public.company_ai_config
  ADD COLUMN IF NOT EXISTS ai_text_refinement_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_prescription_engine_v1 boolean NOT NULL DEFAULT true;;
