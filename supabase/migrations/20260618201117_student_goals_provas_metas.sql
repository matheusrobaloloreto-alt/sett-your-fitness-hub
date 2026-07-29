CREATE TABLE IF NOT EXISTS public.student_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'prova',        -- 'prova' | 'meta'
  target_date date NOT NULL,
  description text,
  metric text,
  status text NOT NULL DEFAULT 'upcoming',   -- 'upcoming' | 'done' | 'missed'
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_goals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_student_goals_company_date ON public.student_goals (company_id, target_date);
CREATE INDEX IF NOT EXISTS idx_student_goals_student ON public.student_goals (student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_goals TO authenticated;
GRANT ALL ON public.student_goals TO service_role;

DROP POLICY IF EXISTS master_all_student_goals ON public.student_goals;
CREATE POLICY master_all_student_goals ON public.student_goals FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'master'::app_role));

DROP POLICY IF EXISTS staff_student_goals ON public.student_goals;
CREATE POLICY staff_student_goals ON public.student_goals FOR ALL
  USING (company_id IN (SELECT student_goals.company_id FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = ANY (ARRAY['admin'::app_role, 'coordinator'::app_role, 'trainer'::app_role])));

DROP POLICY IF EXISTS student_read_student_goals ON public.student_goals;
CREATE POLICY student_read_student_goals ON public.student_goals FOR SELECT
  USING (student_id IN (SELECT students.id FROM students WHERE students.user_id = auth.uid()));;
