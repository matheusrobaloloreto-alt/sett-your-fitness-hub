CREATE TABLE IF NOT EXISTS public.company_exercise_volumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  exercise_id uuid NOT NULL,
  muscle_group_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'primary',
  volume_percentage numeric NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, exercise_id, muscle_group_id)
);

ALTER TABLE public.company_exercise_volumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master full access" ON public.company_exercise_volumes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Company scoped select" ON public.company_exercise_volumes
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company members insert" ON public.company_exercise_volumes
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company members update" ON public.company_exercise_volumes
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company members delete" ON public.company_exercise_volumes
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE TRIGGER update_company_exercise_volumes_updated_at
  BEFORE UPDATE ON public.company_exercise_volumes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_cev_company_exercise ON public.company_exercise_volumes(company_id, exercise_id);