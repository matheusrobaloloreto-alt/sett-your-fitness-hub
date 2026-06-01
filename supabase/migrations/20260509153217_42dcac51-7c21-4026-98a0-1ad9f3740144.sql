
-- 1. Remove anon access to payments
DROP POLICY IF EXISTS "Anon can read payments" ON public.payments;
DROP POLICY IF EXISTS "Anon can insert payments" ON public.payments;

-- 2. Tighten exercise_muscle_targets - scope to company via exercise_library
DROP POLICY IF EXISTS "Insert exercise targets" ON public.exercise_muscle_targets;
DROP POLICY IF EXISTS "Delete exercise targets" ON public.exercise_muscle_targets;

CREATE POLICY "Company users insert exercise targets"
ON public.exercise_muscle_targets
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exercise_library el
    WHERE el.id = exercise_muscle_targets.exercise_id
      AND (el.company_id = public.get_user_company_id(auth.uid()) OR el.is_global = true)
  )
);

CREATE POLICY "Company users delete exercise targets"
ON public.exercise_muscle_targets
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exercise_library el
    WHERE el.id = exercise_muscle_targets.exercise_id
      AND (el.company_id = public.get_user_company_id(auth.uid()) OR el.is_global = true)
  )
);

CREATE POLICY "Company users update exercise targets"
ON public.exercise_muscle_targets
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exercise_library el
    WHERE el.id = exercise_muscle_targets.exercise_id
      AND (el.company_id = public.get_user_company_id(auth.uid()) OR el.is_global = true)
  )
);

-- 3. Realtime channel authorization - restrict subscriptions to user's company
-- Policy on realtime.messages restricts which topics a user can subscribe to.
-- Topic convention: "company:<company_id>" - clients must subscribe to their own company topic.
DROP POLICY IF EXISTS "Authenticated users read own company realtime" ON realtime.messages;

CREATE POLICY "Authenticated users read own company realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'company:' || public.get_user_company_id(auth.uid())::text
);
