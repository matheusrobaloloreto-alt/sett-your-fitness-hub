
-- 1. workout_feedback table
CREATE TABLE public.workout_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  company_id uuid NOT NULL,
  workout_session_id uuid,
  difficulty smallint CHECK (difficulty BETWEEN 1 AND 10),
  energy smallint CHECK (energy BETWEEN 1 AND 5),
  pain_areas jsonb DEFAULT '[]'::jsonb,
  notes text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workout_feedback_student ON public.workout_feedback(student_id, created_at DESC);
CREATE INDEX idx_workout_feedback_company_unread ON public.workout_feedback(company_id) WHERE read_at IS NULL;

ALTER TABLE public.workout_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student inserts own workout feedback"
ON public.workout_feedback FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = workout_feedback.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Student reads own workout feedback"
ON public.workout_feedback FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = workout_feedback.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Company scoped select"
ON public.workout_feedback FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company members update"
ON public.workout_feedback FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Master full access"
ON public.workout_feedback FOR ALL TO authenticated
USING (has_role(auth.uid(), 'master'::app_role))
WITH CHECK (has_role(auth.uid(), 'master'::app_role));

-- 2. cycle_feedback table
CREATE TABLE public.cycle_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  company_id uuid NOT NULL,
  enrollment_id uuid,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  what_worked text,
  what_to_improve text,
  renewal_intent text CHECK (renewal_intent IN ('yes','talk','no')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cycle_feedback_student ON public.cycle_feedback(student_id, created_at DESC);
CREATE INDEX idx_cycle_feedback_company_unread ON public.cycle_feedback(company_id) WHERE read_at IS NULL;

ALTER TABLE public.cycle_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student inserts own cycle feedback"
ON public.cycle_feedback FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = cycle_feedback.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Student reads own cycle feedback"
ON public.cycle_feedback FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = cycle_feedback.student_id AND s.user_id = auth.uid()));

CREATE POLICY "Company scoped select"
ON public.cycle_feedback FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company members update"
ON public.cycle_feedback FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Master full access"
ON public.cycle_feedback FOR ALL TO authenticated
USING (has_role(auth.uid(), 'master'::app_role))
WITH CHECK (has_role(auth.uid(), 'master'::app_role));

-- 3. weekly goal column
ALTER TABLE public.students ADD COLUMN weekly_workout_goal smallint NOT NULL DEFAULT 3 CHECK (weekly_workout_goal BETWEEN 1 AND 7);

-- Allow student to update own weekly_workout_goal
CREATE POLICY "Student updates own weekly goal"
ON public.students FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
