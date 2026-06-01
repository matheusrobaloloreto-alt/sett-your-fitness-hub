
CREATE TABLE public.workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id),
  session_date date DEFAULT CURRENT_DATE,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_seconds integer,
  total_volume numeric DEFAULT 0,
  total_sets_completed integer DEFAULT 0,
  total_sets_prescribed integer DEFAULT 0,
  status text DEFAULT 'in_progress',
  notes text,
  exercises_summary jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student reads own sessions" ON public.workout_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = workout_sessions.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Student inserts own sessions" ON public.workout_sessions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = workout_sessions.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Student updates own sessions" ON public.workout_sessions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = workout_sessions.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Company scoped select" ON public.workout_sessions
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Master full access" ON public.workout_sessions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));
