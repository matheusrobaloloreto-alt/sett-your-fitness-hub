
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NULL,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  icon text DEFAULT 'trophy',
  xp_reward integer NOT NULL DEFAULT 50,
  criteria_type text NOT NULL,
  criteria_value integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read achievements" ON public.achievements FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Admin company insert achievements" ON public.achievements FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'coordinator'::app_role)));
CREATE POLICY "Admin company update achievements" ON public.achievements FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'coordinator'::app_role)));
CREATE POLICY "Admin company delete achievements" ON public.achievements FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'coordinator'::app_role)));
CREATE POLICY "Master full access achievements" ON public.achievements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)) WITH CHECK (has_role(auth.uid(),'master'::app_role));
CREATE TRIGGER update_achievements_updated_at BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.student_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  company_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, achievement_id)
);
CREATE INDEX idx_student_achievements_student ON public.student_achievements(student_id);
CREATE INDEX idx_student_achievements_company ON public.student_achievements(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_achievements TO authenticated;
GRANT ALL ON public.student_achievements TO service_role;
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Student reads own achievements" ON public.student_achievements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM students s WHERE s.id = student_achievements.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Company scoped select achievements" ON public.student_achievements FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Master full access student_achievements" ON public.student_achievements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)) WITH CHECK (has_role(auth.uid(),'master'::app_role));

CREATE TABLE public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  company_id uuid NOT NULL,
  event_type text NOT NULL,
  xp_amount integer NOT NULL,
  source_id uuid NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_xp_events_student ON public.xp_events(student_id);
CREATE INDEX idx_xp_events_company ON public.xp_events(company_id);
CREATE UNIQUE INDEX idx_xp_events_unique_source ON public.xp_events(student_id, event_type, source_id) WHERE source_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xp_events TO authenticated;
GRANT ALL ON public.xp_events TO service_role;
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Student reads own xp" ON public.xp_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM students s WHERE s.id = xp_events.student_id AND s.user_id = auth.uid()));
CREATE POLICY "Company scoped select xp" ON public.xp_events FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Master full access xp_events" ON public.xp_events FOR ALL TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)) WITH CHECK (has_role(auth.uid(),'master'::app_role));

CREATE OR REPLACE FUNCTION public.award_xp(
  _student_id uuid, _event_type text, _xp_amount integer,
  _source_id uuid DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_id uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.students WHERE id = _student_id;
  IF v_company IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.xp_events (student_id, company_id, event_type, xp_amount, source_id, notes)
  VALUES (_student_id, v_company, _event_type, _xp_amount, _source_id, _notes)
  ON CONFLICT DO NOTHING RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements(_student_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid; v_workouts integer; v_externals integer; v_cycles integer;
  v_unlocked integer := 0; a record; v_meets boolean; v_new_id uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.students WHERE id = _student_id;
  IF v_company IS NULL THEN RETURN 0; END IF;
  SELECT count(*) INTO v_workouts FROM public.workout_sessions WHERE student_id = _student_id AND status = 'completed';
  SELECT count(*) INTO v_externals FROM public.external_activities WHERE student_id = _student_id;
  SELECT count(*) INTO v_cycles FROM public.training_cycles tc JOIN public.enrollments e ON e.id = tc.enrollment_id
    WHERE e.student_id = _student_id AND tc.status = 'completed';
  FOR a IN SELECT * FROM public.achievements
    WHERE is_active = true AND (company_id IS NULL OR company_id = v_company)
      AND NOT EXISTS (SELECT 1 FROM public.student_achievements sa WHERE sa.student_id = _student_id AND sa.achievement_id = achievements.id)
  LOOP
    v_meets := false;
    IF a.criteria_type = 'workouts_total' AND v_workouts >= a.criteria_value THEN v_meets := true;
    ELSIF a.criteria_type = 'external_total' AND v_externals >= a.criteria_value THEN v_meets := true;
    ELSIF a.criteria_type = 'cycles_completed' AND v_cycles >= a.criteria_value THEN v_meets := true;
    END IF;
    IF v_meets THEN
      INSERT INTO public.student_achievements (student_id, company_id, achievement_id)
      VALUES (_student_id, v_company, a.id) ON CONFLICT DO NOTHING RETURNING id INTO v_new_id;
      IF v_new_id IS NOT NULL THEN
        PERFORM public.award_xp(_student_id, 'achievement', a.xp_reward, a.id, a.title);
        v_unlocked := v_unlocked + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_unlocked;
END; $$;

CREATE OR REPLACE FUNCTION public.get_student_rank(_student_id uuid)
RETURNS TABLE (rank_position bigint, total_students bigint, xp bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_xp bigint;
BEGIN
  SELECT company_id INTO v_company FROM public.students WHERE id = _student_id;
  IF v_company IS NULL THEN RETURN; END IF;
  SELECT COALESCE(sum(xp_amount), 0) INTO v_xp FROM public.xp_events WHERE student_id = _student_id;
  RETURN QUERY
  WITH totals AS (
    SELECT s.id AS sid, COALESCE(sum(x.xp_amount), 0) AS total_xp
    FROM public.students s LEFT JOIN public.xp_events x ON x.student_id = s.id
    WHERE s.company_id = v_company GROUP BY s.id
  )
  SELECT (SELECT count(*) + 1 FROM totals t WHERE t.total_xp > v_xp)::bigint,
         (SELECT count(*) FROM totals)::bigint, v_xp;
END; $$;

INSERT INTO public.achievements (company_id, code, title, description, icon, xp_reward, criteria_type, criteria_value) VALUES
(NULL,'first_workout','Primeiro treino','Concluiu o primeiro treino na plataforma.','flame',25,'workouts_total',1),
(NULL,'workouts_10','10 treinos','Concluiu 10 treinos.','dumbbell',75,'workouts_total',10),
(NULL,'workouts_50','50 treinos','Cinquenta sessões registradas.','medal',250,'workouts_total',50),
(NULL,'workouts_100','100 treinos','Marca dos 100 treinos.','trophy',500,'workouts_total',100),
(NULL,'first_external','Saiu da musculação','Registrou a primeira atividade externa.','bike',25,'external_total',1),
(NULL,'external_20','20 atividades externas','Vinte atividades fora da musculação.','route',150,'external_total',20),
(NULL,'cycle_done','Ciclo completo','Fechou o primeiro ciclo de treino.','check-circle',200,'cycles_completed',1),
(NULL,'cycle_4','4 ciclos completos','Consistência: quatro ciclos fechados.','crown',600,'cycles_completed',4);
