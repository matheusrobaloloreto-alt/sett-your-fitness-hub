-- Every trainer may read every student in their own company. Cross-company
-- access remains denied, and write access continues to use the stricter
-- can_manage_staff_student contract.
create or replace function public.can_read_staff_student(
  _company_id uuid,
  _student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and _company_id is not null
    and _student_id is not null
    and exists (
      select 1
      from public.students s
      where s.id = _student_id
        and s.company_id = _company_id
    )
    and (
      public.has_role(auth.uid(), 'master'::public.app_role)
      or public.is_company_staff(auth.uid(), _company_id)
    );
$$;

revoke all on function public.can_read_staff_student(uuid, uuid)
from public, anon;
grant execute on function public.can_read_staff_student(uuid, uuid)
to authenticated, service_role;

comment on function public.can_read_staff_student(uuid, uuid) is
  'Read-only company scope: authenticated staff can view every student in their company; writes use can_manage_staff_student.';

-- These read-only histories predate can_read_staff_student and still used the
-- management contract directly. Align them with the new company-wide view;
-- their write paths and RPC authorization remain unchanged.
drop policy if exists weekly_contact_consent_events_staff_read
on public.weekly_contact_consent_events;
create policy weekly_contact_consent_events_staff_read
on public.weekly_contact_consent_events for select to authenticated
using (public.can_read_staff_student(company_id, student_id));

drop policy if exists "intercycle delivery company staff read"
on public.intercycle_anamnesis_deliveries;
create policy "intercycle delivery company staff read"
on public.intercycle_anamnesis_deliveries for select to authenticated
using (public.can_read_staff_student(company_id, student_id));

drop policy if exists "intercycle invite company staff"
on public.intercycle_anamnesis_invites;
create policy "intercycle invite company staff"
on public.intercycle_anamnesis_invites for select to authenticated
using (public.can_read_staff_student(company_id, student_id));

drop policy if exists "intercycle answers company staff read"
on public.intercycle_anamneses;
create policy "intercycle answers company staff read"
on public.intercycle_anamneses for select to authenticated
using (public.can_read_staff_student(company_id, student_id));

drop policy if exists "intercycle waiver company staff read"
on public.intercycle_anamnesis_waivers;
create policy "intercycle waiver company staff read"
on public.intercycle_anamnesis_waivers for select to authenticated
using (public.can_read_staff_student(company_id, student_id));

-- Older permissive FOR ALL child policies can follow the students SELECT
-- policy through parent lookups. Restrictive mutation policies keep those
-- writes assigned while leaving company-wide SELECT access available.
create or replace function public.is_student_owner(
  _user_id uuid,
  _company_id uuid,
  _student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    _user_id is not null
    and _company_id is not null
    and _student_id is not null
    and exists (
      select 1
      from public.students s
      where s.id = _student_id
        and s.company_id = _company_id
        and s.user_id = _user_id
    );
$$;

revoke all on function public.is_student_owner(uuid, uuid, uuid)
from public, anon;
grant execute on function public.is_student_owner(uuid, uuid, uuid)
to authenticated, service_role;

do $$
declare
  _table text;
  _guard text := $guard$
    public.has_role(auth.uid(), 'master'::public.app_role)
    or (
      company_id is not null
      and public.is_company_staff(auth.uid(), company_id)
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'coordinator'::public.app_role)
        or (
          student_id is not null
          and public.can_manage_staff_student(company_id, student_id)
        )
      )
    )
    or (
      student_id is not null
      and public.is_student_owner(auth.uid(), company_id, student_id)
    )
  $guard$;
begin
  for _table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'company_id'
          and a.attnum > 0 and not a.attisdropped
      )
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'student_id'
          and a.attnum > 0 and not a.attisdropped
      )
  loop
    execute format('drop policy if exists %I on public.%I', 'Assigned staff insert guard', _table);
    execute format('drop policy if exists %I on public.%I', 'Assigned staff update guard', _table);
    execute format('drop policy if exists %I on public.%I', 'Assigned staff delete guard', _table);

    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
      'Assigned staff insert guard', _table, _guard
    );
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
      'Assigned staff update guard', _table, _guard, _guard
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
      'Assigned staff delete guard', _table, _guard
    );
  end loop;
end;
$$;
