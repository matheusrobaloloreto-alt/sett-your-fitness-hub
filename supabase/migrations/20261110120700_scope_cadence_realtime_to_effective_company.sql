-- Match the dashboard's effective company, including when a Master is
-- viewing another company. The actor portion must still match auth.uid().
alter policy "Staff read their dashboard cadence channel" on realtime.messages
using (
  split_part(realtime.topic(), ':', 3) = auth.uid()::text
  and case when realtime.topic() ~ '^dashboard-cadence:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}:[0-9a-f-]+$' then
    public.is_company_staff(auth.uid(), split_part(realtime.topic(), ':', 2)::uuid)
    and public.company_feature_allowed(split_part(realtime.topic(), ':', 2)::uuid, 'hasWhatsApp')
    and (
      public.has_role(auth.uid(), 'master'::public.app_role)
      or public.has_role(auth.uid(), 'admin'::public.app_role)
      or exists (
        select 1 from public.user_roles actor
        join public.role_permissions permission on permission.role = actor.role::text
          and permission.company_id = split_part(realtime.topic(), ':', 2)::uuid
        where actor.user_id = auth.uid() and actor.role in ('trainer', 'coordinator')
          and permission.module = 'whatsapp' and permission.enabled is true
      )
    )
  else false end
);
