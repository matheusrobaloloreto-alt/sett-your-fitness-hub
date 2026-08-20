-- Per-person operational grants. These are intentionally separate from
-- role_permissions: enabling a trainer here must never widen every trainer in
-- the company or grant write access to students who are not assigned to them.
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

-- A default ACL may grant new tables to browser roles. Remove it explicitly,
-- then add back read-only access; all writes go through the tenant-validating
-- RPC below.
revoke all on table public.staff_permissions from public, anon, authenticated;
grant select on table public.staff_permissions to authenticated;
grant all on table public.staff_permissions to service_role;

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

-- Remove the old direct-write policies if this migration is replayed after a
-- development version of the contract.
drop policy if exists "Company admins insert explicit permissions" on public.staff_permissions;
drop policy if exists "Company admins update explicit permissions" on public.staff_permissions;

create or replace function public.has_staff_permission(
  _company_id uuid,
  _permission text
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
    and _permission = 'company_dashboard_full'
    and exists (
      select 1
      from public.company_members cm
      join public.user_roles ur on ur.user_id = cm.user_id
      join public.staff_permissions sp
        on sp.company_id = cm.company_id
       and sp.user_id = cm.user_id
       and sp.permission = _permission
       and sp.enabled
      where cm.company_id = _company_id
        and cm.user_id = auth.uid()
        and ur.role = 'trainer'::public.app_role
    );
$$;

revoke all on function public.has_staff_permission(uuid, text)
from public, anon;
grant execute on function public.has_staff_permission(uuid, text)
to authenticated, service_role;

-- Read access may be widened by the individual dashboard grant. Management
-- access deliberately ignores that grant so a read-only dashboard permission
-- cannot become a cross-student write permission.
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
      or (
        public.is_company_staff(auth.uid(), _company_id)
        and (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          or public.has_role(auth.uid(), 'coordinator'::public.app_role)
          or public.has_staff_permission(_company_id, 'company_dashboard_full')
          or exists (
            select 1
            from public.students assigned
            where assigned.id = _student_id
              and assigned.company_id = _company_id
              and assigned.assigned_trainer_id = auth.uid()
          )
          or exists (
            select 1
            from public.enrollments e
            where e.student_id = _student_id
              and e.company_id = _company_id
              and e.trainer_id = auth.uid()
          )
        )
      )
    );
$$;

create or replace function public.can_manage_staff_student(
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
      or (
        public.is_company_staff(auth.uid(), _company_id)
        and (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          or public.has_role(auth.uid(), 'coordinator'::public.app_role)
          or exists (
            select 1
            from public.students assigned
            where assigned.id = _student_id
              and assigned.company_id = _company_id
              and assigned.assigned_trainer_id = auth.uid()
          )
          or exists (
            select 1
            from public.enrollments e
            where e.student_id = _student_id
              and e.company_id = _company_id
              and e.trainer_id = auth.uid()
          )
        )
      )
    );
$$;

revoke all on function public.can_read_staff_student(uuid, uuid)
from public, anon;
revoke all on function public.can_manage_staff_student(uuid, uuid)
from public, anon;
grant execute on function public.can_read_staff_student(uuid, uuid)
to authenticated, service_role;
grant execute on function public.can_manage_staff_student(uuid, uuid)
to authenticated, service_role;

create or replace function public.set_staff_permission(
  _company_id uuid,
  _user_id uuid,
  _permission text,
  _enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or _company_id is null or _user_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if _permission <> 'company_dashboard_full' then
    raise exception 'Unknown staff permission' using errcode = '22023';
  end if;

  if not (
    public.has_role(auth.uid(), 'master'::public.app_role)
    or (
      public.is_company_staff(auth.uid(), _company_id)
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.company_members cm
    where cm.company_id = _company_id
      and cm.user_id = _user_id
  ) then
    raise exception 'Target user is not a member of this company' using errcode = '23514';
  end if;

  if _enabled and not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role = 'trainer'::public.app_role
  ) then
    raise exception 'Only trainers can receive this permission' using errcode = '23514';
  end if;

  insert into public.staff_permissions (
    company_id, user_id, permission, enabled, granted_by
  ) values (
    _company_id, _user_id, _permission, _enabled, auth.uid()
  )
  on conflict (company_id, user_id, permission)
  do update set
    enabled = excluded.enabled,
    granted_by = auth.uid(),
    updated_at = now();

  return _enabled;
end;
$$;

revoke all on function public.set_staff_permission(uuid, uuid, text, boolean)
from public, anon;
grant execute on function public.set_staff_permission(uuid, uuid, text, boolean)
to authenticated, service_role;

create or replace function public.touch_staff_permissions_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
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

-- Replace the broad staff SELECT surface for the four dashboard data sources.
-- Student self-service policies remain untouched and are OR-combined normally.
drop policy if exists "Company staff manage students" on public.students;
drop policy if exists "Company staff read accessible students" on public.students;
drop policy if exists "Company staff insert students" on public.students;
drop policy if exists "Company staff update accessible students" on public.students;
drop policy if exists "Company staff delete accessible students" on public.students;
create policy "Company staff read accessible students"
on public.students for select to authenticated
using (public.can_read_staff_student(students.company_id, students.id));
create policy "Company staff insert students"
on public.students for insert to authenticated
with check (public.is_company_staff(auth.uid(), students.company_id));
create policy "Company staff update accessible students"
on public.students for update to authenticated
using (public.can_manage_staff_student(students.company_id, students.id))
with check (public.can_manage_staff_student(students.company_id, students.id));
create policy "Company staff delete accessible students"
on public.students for delete to authenticated
using (public.can_manage_staff_student(students.company_id, students.id));

drop policy if exists "Company staff manage enrollments" on public.enrollments;
drop policy if exists "Company staff read accessible enrollments" on public.enrollments;
drop policy if exists "Company staff insert accessible enrollments" on public.enrollments;
drop policy if exists "Company staff update accessible enrollments" on public.enrollments;
drop policy if exists "Company staff delete accessible enrollments" on public.enrollments;
create policy "Company staff read accessible enrollments"
on public.enrollments for select to authenticated
using (public.can_read_staff_student(enrollments.company_id, enrollments.student_id));
create policy "Company staff insert accessible enrollments"
on public.enrollments for insert to authenticated
with check (public.can_manage_staff_student(enrollments.company_id, enrollments.student_id));
create policy "Company staff update accessible enrollments"
on public.enrollments for update to authenticated
using (public.can_manage_staff_student(enrollments.company_id, enrollments.student_id))
with check (public.can_manage_staff_student(enrollments.company_id, enrollments.student_id));
create policy "Company staff delete accessible enrollments"
on public.enrollments for delete to authenticated
using (public.can_manage_staff_student(enrollments.company_id, enrollments.student_id));

drop policy if exists "Company staff manage training cycles" on public.training_cycles;
drop policy if exists "Company staff read accessible training cycles" on public.training_cycles;
drop policy if exists "Company staff insert accessible training cycles" on public.training_cycles;
drop policy if exists "Company staff update accessible training cycles" on public.training_cycles;
drop policy if exists "Company staff delete accessible training cycles" on public.training_cycles;
create policy "Company staff read accessible training cycles"
on public.training_cycles for select to authenticated
using (public.can_read_staff_student(training_cycles.company_id, training_cycles.student_id));
create policy "Company staff insert accessible training cycles"
on public.training_cycles for insert to authenticated
with check (public.can_manage_staff_student(training_cycles.company_id, training_cycles.student_id));
create policy "Company staff update accessible training cycles"
on public.training_cycles for update to authenticated
using (public.can_manage_staff_student(training_cycles.company_id, training_cycles.student_id))
with check (public.can_manage_staff_student(training_cycles.company_id, training_cycles.student_id));
create policy "Company staff delete accessible training cycles"
on public.training_cycles for delete to authenticated
using (public.can_manage_staff_student(training_cycles.company_id, training_cycles.student_id));

drop policy if exists "Company staff manage workouts" on public.workouts;
drop policy if exists "Company staff read accessible workouts" on public.workouts;
drop policy if exists "Company staff insert accessible workouts" on public.workouts;
drop policy if exists "Company staff update accessible workouts" on public.workouts;
drop policy if exists "Company staff delete accessible workouts" on public.workouts;
create policy "Company staff read accessible workouts"
on public.workouts for select to authenticated
using (exists (
  select 1
  from public.training_cycles tc
  where tc.id = workouts.cycle_id
    and tc.company_id = workouts.company_id
    and public.can_read_staff_student(tc.company_id, tc.student_id)
));
create policy "Company staff insert accessible workouts"
on public.workouts for insert to authenticated
with check (exists (
  select 1
  from public.training_cycles tc
  where tc.id = workouts.cycle_id
    and tc.company_id = workouts.company_id
    and public.can_manage_staff_student(tc.company_id, tc.student_id)
));
create policy "Company staff update accessible workouts"
on public.workouts for update to authenticated
using (exists (
  select 1
  from public.training_cycles tc
  where tc.id = workouts.cycle_id
    and tc.company_id = workouts.company_id
    and public.can_manage_staff_student(tc.company_id, tc.student_id)
))
with check (exists (
  select 1
  from public.training_cycles tc
  where tc.id = workouts.cycle_id
    and tc.company_id = workouts.company_id
    and public.can_manage_staff_student(tc.company_id, tc.student_id)
));
create policy "Company staff delete accessible workouts"
on public.workouts for delete to authenticated
using (exists (
  select 1
  from public.training_cycles tc
  where tc.id = workouts.cycle_id
    and tc.company_id = workouts.company_id
    and public.can_manage_staff_student(tc.company_id, tc.student_id)
));

-- A trainer with the explicit full-dashboard grant may read and resolve all
-- dashboard alerts for this company. Other trainers remain target-only.
drop policy if exists "admin alerts staff select" on public.admin_alerts;
create policy "admin alerts staff select"
on public.admin_alerts for select to authenticated
using (
  public.is_company_staff(auth.uid(), admin_alerts.company_id)
  and (
    admin_alerts.target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
    or public.has_staff_permission(admin_alerts.company_id, 'company_dashboard_full')
  )
);

drop policy if exists "admin alerts staff update" on public.admin_alerts;
create policy "admin alerts staff update"
on public.admin_alerts for update to authenticated
using (
  public.is_company_staff(auth.uid(), admin_alerts.company_id)
  and (
    admin_alerts.target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
    or public.has_staff_permission(admin_alerts.company_id, 'company_dashboard_full')
  )
)
with check (
  public.is_company_staff(auth.uid(), admin_alerts.company_id)
  and admin_alerts.company_id is not null
  and (
    admin_alerts.target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
    or public.has_staff_permission(admin_alerts.company_id, 'company_dashboard_full')
  )
  and (
    admin_alerts.target_user_id is null
    or exists (
      select 1 from public.company_members cm
      where cm.user_id = admin_alerts.target_user_id
        and cm.company_id = admin_alerts.company_id
    )
  )
  and (
    admin_alerts.student_id is null
    or exists (
      select 1 from public.students s
      where s.id = admin_alerts.student_id
        and s.company_id = admin_alerts.company_id
    )
  )
  and (
    admin_alerts.enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = admin_alerts.enrollment_id
        and e.company_id = admin_alerts.company_id
    )
  )
);
