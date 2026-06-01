DO $$
BEGIN
  -- workouts: update and delete
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admin company update' AND polrelid = 'workouts'::regclass) THEN
    EXECUTE 'CREATE POLICY "Admin company update" ON public.workouts FOR UPDATE TO authenticated
    USING (company_id = get_user_company_id(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admin company delete' AND polrelid = 'workouts'::regclass) THEN
    EXECUTE 'CREATE POLICY "Admin company delete" ON public.workouts FOR DELETE TO authenticated
    USING (company_id = get_user_company_id(auth.uid()))';
  END IF;

  -- workout_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admin company insert' AND polrelid = 'workout_logs'::regclass) THEN
    EXECUTE 'CREATE POLICY "Admin company insert" ON public.workout_logs FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM students s WHERE s.id = workout_logs.student_id AND s.company_id = get_user_company_id(auth.uid())))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admin company update' AND polrelid = 'workout_logs'::regclass) THEN
    EXECUTE 'CREATE POLICY "Admin company update" ON public.workout_logs FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM students s WHERE s.id = workout_logs.student_id AND s.company_id = get_user_company_id(auth.uid())))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Student manages own logs' AND polrelid = 'workout_logs'::regclass) THEN
    EXECUTE 'CREATE POLICY "Student manages own logs" ON public.workout_logs FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM students s WHERE s.id = workout_logs.student_id AND s.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM students s WHERE s.id = workout_logs.student_id AND s.user_id = auth.uid()))';
  END IF;

  -- workout_sessions
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admin company insert' AND polrelid = 'workout_sessions'::regclass) THEN
    EXECUTE 'CREATE POLICY "Admin company insert" ON public.workout_sessions FOR INSERT TO authenticated
    WITH CHECK (company_id = get_user_company_id(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Admin company update' AND polrelid = 'workout_sessions'::regclass) THEN
    EXECUTE 'CREATE POLICY "Admin company update" ON public.workout_sessions FOR UPDATE TO authenticated
    USING (company_id = get_user_company_id(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Student manages own sessions' AND polrelid = 'workout_sessions'::regclass) THEN
    EXECUTE 'CREATE POLICY "Student manages own sessions" ON public.workout_sessions FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM students s WHERE s.id = workout_sessions.student_id AND s.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM students s WHERE s.id = workout_sessions.student_id AND s.user_id = auth.uid()))';
  END IF;
END $$;