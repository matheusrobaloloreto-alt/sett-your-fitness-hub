CREATE TABLE IF NOT EXISTS public.cycle_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  cycle_id uuid REFERENCES public.training_cycles(id) ON DELETE SET NULL,
  nps smallint,                       -- 0-10 (recomendaria o treinador?)
  goals_aligned boolean,              -- objetivos seguem alinhados?
  wants_adjustment boolean,           -- quer algum ajuste?
  adjustment_notes text,              -- o ajuste pedido (ex.: reduzir tempo de treino)
  effort_score smallint,              -- como foi a percepção de esforço/carga (0-10)
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT false,   -- o professor já aplicou/revisou na próxima prescrição
  created_at timestamptz NOT NULL DEFAULT now()
);
-- `cycle_feedback` already existed in the original schema with the legacy
-- rating fields. Reconcile the NPS extension when CREATE TABLE is a no-op.
ALTER TABLE public.cycle_feedback
  ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES public.training_cycles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nps smallint,
  ADD COLUMN IF NOT EXISTS goals_aligned boolean,
  ADD COLUMN IF NOT EXISTS wants_adjustment boolean,
  ADD COLUMN IF NOT EXISTS adjustment_notes text,
  ADD COLUMN IF NOT EXISTS effort_score smallint,
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS applied boolean NOT NULL DEFAULT false;

ALTER TABLE public.cycle_feedback ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_cycle_feedback_student ON public.cycle_feedback (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cycle_feedback_company ON public.cycle_feedback (company_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cycle_feedback TO authenticated;
GRANT ALL ON public.cycle_feedback TO service_role;

DROP POLICY IF EXISTS master_all_cycle_feedback ON public.cycle_feedback;
CREATE POLICY master_all_cycle_feedback ON public.cycle_feedback FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'master'::app_role));

DROP POLICY IF EXISTS staff_cycle_feedback ON public.cycle_feedback;
CREATE POLICY staff_cycle_feedback ON public.cycle_feedback FOR ALL
  USING (company_id IN (SELECT cycle_feedback.company_id FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'coordinator'::app_role, 'trainer'::app_role])));

DROP POLICY IF EXISTS student_read_cycle_feedback ON public.cycle_feedback;
CREATE POLICY student_read_cycle_feedback ON public.cycle_feedback FOR SELECT
  USING (student_id IN (SELECT students.id FROM students WHERE students.user_id = auth.uid()));

DROP POLICY IF EXISTS student_insert_cycle_feedback ON public.cycle_feedback;
CREATE POLICY student_insert_cycle_feedback ON public.cycle_feedback FOR INSERT
  WITH CHECK (student_id IN (SELECT students.id FROM students WHERE students.user_id = auth.uid()));;
