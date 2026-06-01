
-- 1) training_cycles write policies
CREATE POLICY "Admin company insert" ON public.training_cycles
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin company update" ON public.training_cycles
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.company_id = get_user_company_id(auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin company delete" ON public.training_cycles
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.company_id = get_user_company_id(auth.uid())));

-- 2) flow_sessions write policies
CREATE POLICY "Admin company insert" ON public.flow_sessions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin company update" ON public.flow_sessions
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin company delete" ON public.flow_sessions
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())));

-- 3) automation_flow_steps write policies
CREATE POLICY "Admin company insert" ON public.automation_flow_steps
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin company update" ON public.automation_flow_steps
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin company delete" ON public.automation_flow_steps
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM automation_flows f WHERE f.id = flow_id AND f.company_id = get_user_company_id(auth.uid())));

-- 4) exercise_muscle_targets: restrict global writes to master only
DROP POLICY IF EXISTS "Company users insert exercise targets" ON public.exercise_muscle_targets;
DROP POLICY IF EXISTS "Company users update exercise targets" ON public.exercise_muscle_targets;
DROP POLICY IF EXISTS "Company users delete exercise targets" ON public.exercise_muscle_targets;

CREATE POLICY "Company users insert exercise targets" ON public.exercise_muscle_targets
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM exercise_library el
  WHERE el.id = exercise_id
    AND el.is_global = false
    AND el.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Company users update exercise targets" ON public.exercise_muscle_targets
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM exercise_library el
  WHERE el.id = exercise_id
    AND el.is_global = false
    AND el.company_id = get_user_company_id(auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM exercise_library el
  WHERE el.id = exercise_id
    AND el.is_global = false
    AND el.company_id = get_user_company_id(auth.uid())
));

CREATE POLICY "Company users delete exercise targets" ON public.exercise_muscle_targets
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM exercise_library el
  WHERE el.id = exercise_id
    AND el.is_global = false
    AND el.company_id = get_user_company_id(auth.uid())
));

-- 5) platform_settings: anon can only read the global (null) row
DROP POLICY IF EXISTS "Anon can read platform settings" ON public.platform_settings;
CREATE POLICY "Anon can read global platform settings" ON public.platform_settings
FOR SELECT TO anon
USING (company_id IS NULL);

-- 6) Revoke EXECUTE from public/authenticated on trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_anamnesis_company_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_workout_exercise_muscle_group() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_trainer_assignment_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_training_cycles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_enrollment_company_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_training_cycles(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_training_cycles() FROM PUBLIC, anon, authenticated;
