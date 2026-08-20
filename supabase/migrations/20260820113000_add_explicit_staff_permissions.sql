-- Per-person operational grants. These are intentionally separate from
-- role_permissions: enabling a trainer here must never widen every trainer in
-- the company.
create table if not exists public.staff_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  enabled boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_permissions_known_permission
    check (permission in ('company_dashboard_full')),
  constraint staff_permissions_company_user_permission_key
    unique (company_id, user_id, permission)
);

create index if not exists staff_permissions_user_lookup_idx
  on public.staff_permissions (user_id, company_id, permission)
  where enabled;

alter table public.staff_permissions enable row level security;

drop policy if exists "Staff reads own explicit permissions" on public.staff_permissions;
create policy "Staff reads own explicit permissions"
on public.staff_permissions for select to authenticated
using (
  user_id = auth.uid()
  and public.is_company_staff(auth.uid(), company_id)
);

drop policy if exists "Company admins read explicit permissions" on public.staff_permissions;
create policy "Company admins read explicit permissions"
on public.staff_permissions for select to authenticated
using (
  public.has_role(auth.uid(), 'master'::public.app_role)
  or (
    public.is_company_staff(auth.uid(), company_id)
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

drop policy if exists "Company admins insert explicit permissions" on public.staff_permissions;
create policy "Company admins insert explicit permissions"
on public.staff_permissions for insert to authenticated
with check (
  (
    public.has_role(auth.uid(), 'master'::public.app_role)
    or (
      public.is_company_staff(auth.uid(), company_id)
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  and exists (
    select 1
    from public.company_members target
    where target.company_id = staff_permissions.company_id
      and target.user_id = staff_permissions.user_id
  )
  and granted_by = auth.uid()
);

drop policy if exists "Company admins update explicit permissions" on public.staff_permissions;
create policy "Company admins update explicit permissions"
on public.staff_permissions for update to authenticated
using (
  public.has_role(auth.uid(), 'master'::public.app_role)
  or (
    public.is_company_staff(auth.uid(), company_id)
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  )
)
with check (
  (
    public.has_role(auth.uid(), 'master'::public.app_role)
    or (
      public.is_company_staff(auth.uid(), company_id)
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  and exists (
    select 1
    from public.company_members target
    where target.company_id = staff_permissions.company_id
      and target.user_id = staff_permissions.user_id
  )
  and granted_by = auth.uid()
);

create or replace function public.touch_staff_permissions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_staff_permissions_updated_at()
from public, anon, authenticated;

drop trigger if exists touch_staff_permissions_updated_at on public.staff_permissions;
create trigger touch_staff_permissions_updated_at
before update on public.staff_permissions
for each row execute function public.touch_staff_permissions_updated_at();

grant select, insert, update on public.staff_permissions to authenticated;
