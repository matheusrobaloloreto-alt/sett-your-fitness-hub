DROP POLICY IF EXISTS "Anon can read students"   ON public.students;
DROP POLICY IF EXISTS "Anon can insert students" ON public.students;
DROP POLICY IF EXISTS "Anon can update students" ON public.students;
DROP POLICY IF EXISTS "Anon can read enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Anon can read companies"   ON public.companies;
DROP POLICY IF EXISTS "Anon can insert anamnesis" ON public.anamnesis;
DROP POLICY IF EXISTS "Anon can read plans"        ON public.plans;
DROP POLICY IF EXISTS "Anon can read form fields"  ON public.form_fields;