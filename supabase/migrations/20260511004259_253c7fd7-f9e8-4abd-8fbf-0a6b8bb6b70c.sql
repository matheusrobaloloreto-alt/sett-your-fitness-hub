-- exercise_library: separate global (master-only) from company (admin-own)
DROP POLICY IF EXISTS "Admin company insert" ON public.exercise_library;
DROP POLICY IF EXISTS "Admin company update" ON public.exercise_library;
DROP POLICY IF EXISTS "Admin company delete" ON public.exercise_library;

CREATE POLICY "Admin company insert own"
ON public.exercise_library FOR INSERT TO authenticated
WITH CHECK (
  is_global = false
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY "Admin company update own"
ON public.exercise_library FOR UPDATE TO authenticated
USING (
  is_global = false
  AND company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  is_global = false
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY "Admin company delete own"
ON public.exercise_library FOR DELETE TO authenticated
USING (
  is_global = false
  AND company_id = public.get_user_company_id(auth.uid())
);

-- form_fields: separate templates (master-only) from company-owned (admin-own)
DROP POLICY IF EXISTS "Admin company insert" ON public.form_fields;
DROP POLICY IF EXISTS "Admin company update" ON public.form_fields;
DROP POLICY IF EXISTS "Admin company delete" ON public.form_fields;

CREATE POLICY "Admin company insert own"
ON public.form_fields FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY "Admin company update own"
ON public.form_fields FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = public.get_user_company_id(auth.uid())
);

CREATE POLICY "Admin company delete own"
ON public.form_fields FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = public.get_user_company_id(auth.uid())
);