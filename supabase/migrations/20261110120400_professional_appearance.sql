-- Staff need the effective permissions to render the panel. Only an admin
-- of that company or a master can grant/revoke permissions.
drop policy "Company staff manage role permissions" on public.role_permissions;

create policy "Company staff read role permissions" on public.role_permissions
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));

create policy "Company admins manage role permissions" on public.role_permissions
for all to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  and public.is_company_staff(auth.uid(), company_id)
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  and public.is_company_staff(auth.uid(), company_id)
);

alter table public.platform_settings
  add column professional_appearance jsonb not null default '{}'::jsonb
  check (jsonb_typeof(professional_appearance) = 'object');

comment on column public.platform_settings.professional_appearance is
  'Company dashboard section order and professional panel effects. Empty object uses application defaults.';

-- Match the module grant on all company appearance writes. Existing SELECT
-- policies and the separate Master policy still apply.
create function public.can_edit_company_appearance(_company_id uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select public.is_company_staff(auth.uid(), _company_id) and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or exists (
      select from public.role_permissions permission
      where permission.company_id = _company_id
        and permission.module = 'appearance'
        and permission.enabled
        and (
          (permission.role = 'coordinator' and public.has_role(auth.uid(), 'coordinator'::public.app_role))
          or (permission.role = 'trainer' and public.has_role(auth.uid(), 'trainer'::public.app_role))
        )
    )
  );
$$;

revoke all on function public.can_edit_company_appearance(uuid) from public, anon;
grant execute on function public.can_edit_company_appearance(uuid) to authenticated;

drop policy "Company staff insert platform settings" on public.platform_settings;
drop policy "Company staff update platform settings" on public.platform_settings;

create policy "Authorized staff insert platform settings" on public.platform_settings
for insert to authenticated
with check (public.can_edit_company_appearance(company_id));

create policy "Authorized staff update platform settings" on public.platform_settings
for update to authenticated
using (public.can_edit_company_appearance(company_id))
with check (public.can_edit_company_appearance(company_id));
