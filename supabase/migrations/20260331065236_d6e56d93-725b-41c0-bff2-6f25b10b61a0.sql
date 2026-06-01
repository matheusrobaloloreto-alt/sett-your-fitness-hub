CREATE POLICY "Admin reads company member roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coordinator'::app_role))
  AND user_id IN (
    SELECT cm.user_id FROM public.company_members cm
    WHERE cm.company_id = get_user_company_id(auth.uid())
  )
);