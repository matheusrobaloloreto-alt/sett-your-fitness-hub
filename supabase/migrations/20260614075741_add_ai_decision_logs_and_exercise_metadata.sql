CREATE TABLE IF NOT EXISTS public.ai_decision_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('prescricao', 'avaliacao', 'bnito')),
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_company_created ON public.ai_decision_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_student_created ON public.ai_decision_logs(student_id, created_at DESC) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_decision_logs_source ON public.ai_decision_logs(source);
ALTER TABLE public.ai_decision_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_decision_logs TO authenticated;
GRANT ALL ON public.ai_decision_logs TO service_role;
DROP POLICY IF EXISTS "Company members read ai decision logs" ON public.ai_decision_logs;
CREATE POLICY "Company members read ai decision logs" ON public.ai_decision_logs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
DROP POLICY IF EXISTS "Master full access ai decision logs" ON public.ai_decision_logs;
CREATE POLICY "Master full access ai decision logs" ON public.ai_decision_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE TABLE IF NOT EXISTS public.exercise_metadata (
  exercise_id uuid PRIMARY KEY REFERENCES public.exercise_library(id) ON DELETE CASCADE,
  contraindications text[] NOT NULL DEFAULT '{}'::text[],
  regressions text[] NOT NULL DEFAULT '{}'::text[],
  progressions text[] NOT NULL DEFAULT '{}'::text[],
  equivalent_substitutes uuid[] NOT NULL DEFAULT '{}'::uuid[],
  pain_limitation_tags text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exercise_metadata_contraindications ON public.exercise_metadata USING gin (contraindications);
CREATE INDEX IF NOT EXISTS idx_exercise_metadata_pain_limitation_tags ON public.exercise_metadata USING gin (pain_limitation_tags);
CREATE INDEX IF NOT EXISTS idx_exercise_metadata_equivalent_substitutes ON public.exercise_metadata USING gin (equivalent_substitutes);
ALTER TABLE public.exercise_metadata ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_metadata TO authenticated;
GRANT ALL ON public.exercise_metadata TO service_role;
DROP POLICY IF EXISTS "Company members read exercise metadata" ON public.exercise_metadata;
CREATE POLICY "Company members read exercise metadata" ON public.exercise_metadata FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercise_library exercise WHERE exercise.id = exercise_metadata.exercise_id AND (exercise.is_global = true OR exercise.company_id = public.get_user_company_id(auth.uid()))));
DROP POLICY IF EXISTS "Company staff manage owned exercise metadata" ON public.exercise_metadata;
CREATE POLICY "Company staff manage owned exercise metadata" ON public.exercise_metadata FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercise_library exercise WHERE exercise.id = exercise_metadata.exercise_id AND exercise.company_id = public.get_user_company_id(auth.uid()) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'coordinator'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercise_library exercise WHERE exercise.id = exercise_metadata.exercise_id AND exercise.company_id = public.get_user_company_id(auth.uid()) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'coordinator'::app_role))));
DROP POLICY IF EXISTS "Master full access exercise metadata" ON public.exercise_metadata;
CREATE POLICY "Master full access exercise metadata" ON public.exercise_metadata FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));
DROP TRIGGER IF EXISTS update_exercise_metadata_updated_at ON public.exercise_metadata;
CREATE TRIGGER update_exercise_metadata_updated_at BEFORE UPDATE ON public.exercise_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
