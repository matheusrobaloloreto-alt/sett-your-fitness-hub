-- ============================================================================
-- MIGRAÇÃO: Sistema de Prescrições Integradas BN Performance Training
-- Rodar no Supabase SQL Editor
-- ============================================================================

-- ── 1. Tabela de Anamnese Única ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_anamneses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  company_id            UUID NOT NULL REFERENCES companies(id),

  -- Dados pessoais (complementam students)
  age                   INT,
  body_fat_percent      DECIMAL(5,2),

  -- Objetivo e perfil de treino
  objective             TEXT,          -- emagrecimento | hipertrofia | performance
  activity_level        TEXT,          -- sedentario | leve | moderado | muito_ativo | extremo
  is_endurance_athlete  BOOLEAN DEFAULT FALSE,
  training_modality     TEXT,          -- ex: "corrida + musculação"
  days_per_week_strength INT,
  days_per_week_cardio   INT,
  session_duration_min   INT,
  equipment             TEXT,
  experience_months     INT,

  -- Especifico corrida/cardio
  sport                 TEXT,          -- corrida | ciclismo | natacao | triathlon
  fcmax                 INT,
  fcrep                 INT,
  current_volume_weekly DECIMAL,       -- km ou horas/semana
  cardio_goal           TEXT,          -- ex: "Maratona em 12 semanas"

  -- Saúde e bem-estar
  stress_score          INT CHECK (stress_score BETWEEN 0 AND 10),
  sleep_quality         INT CHECK (sleep_quality BETWEEN 0 AND 10),
  injuries              TEXT,

  -- Nutrição
  food_restrictions     TEXT,
  budget_food           TEXT,          -- economico | moderado | premium
  meals_per_day         INT DEFAULT 5,
  has_kitchen           BOOLEAN DEFAULT TRUE,

  -- Observações livres
  notes                 TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT student_anamneses_unique UNIQUE (student_id)
);

-- ── 2. Tabela de Planos Integrados (vínculo entre prescrições) ────────────
-- Agrupa as prescrições de um mesmo ciclo de periodização
CREATE TABLE IF NOT EXISTS prescription_bundles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  anamnese_id           UUID REFERENCES student_anamneses(id),

  -- Referências para as prescrições geradas neste bundle
  training_cycle_id     UUID REFERENCES training_cycles(id),
  running_plan_id       UUID REFERENCES running_plans(id),
  nutrition_plan_id     UUID REFERENCES nutrition_plans(id),

  -- Modalities selecionadas
  has_strength          BOOLEAN DEFAULT FALSE,
  has_cardio            BOOLEAN DEFAULT FALSE,
  has_nutrition         BOOLEAN DEFAULT FALSE,

  status                TEXT DEFAULT 'active',  -- active | archived
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE student_anamneses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anamneses_company_access" ON student_anamneses
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "bundles_company_access" ON prescription_bundles
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM company_members WHERE user_id = auth.uid()
    )
  );

-- RLS para o portal do aluno ver sua própria anamnese
CREATE POLICY "students_read_own_anamnese" ON student_anamneses
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- ── 4. Índices ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_anamneses_student   ON student_anamneses(student_id);
CREATE INDEX IF NOT EXISTS idx_anamneses_company   ON student_anamneses(company_id);
CREATE INDEX IF NOT EXISTS idx_bundles_student     ON prescription_bundles(student_id);
CREATE INDEX IF NOT EXISTS idx_bundles_company     ON prescription_bundles(company_id);

-- ── 5. Colunas extras em running_plans (se ainda não existirem) ───────────
ALTER TABLE running_plans
  ADD COLUMN IF NOT EXISTS anamnese_id UUID REFERENCES student_anamneses(id),
  ADD COLUMN IF NOT EXISTS bundle_id   UUID REFERENCES prescription_bundles(id);

ALTER TABLE training_cycles
  ADD COLUMN IF NOT EXISTS anamnese_id UUID REFERENCES student_anamneses(id),
  ADD COLUMN IF NOT EXISTS bundle_id   UUID REFERENCES prescription_bundles(id);

ALTER TABLE nutrition_plans
  ADD COLUMN IF NOT EXISTS anamnese_id UUID REFERENCES student_anamneses(id),
  ADD COLUMN IF NOT EXISTS bundle_id   UUID REFERENCES prescription_bundles(id);

-- ── 6. Notificar schema cache ─────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

