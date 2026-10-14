-- Assignment is attribution/filtering, not authorization. Staff may manage
-- every student in their company; student ownership and tenant checks remain.
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
      select 1 from public.students s
      where s.id = _student_id and s.company_id = _company_id
    )
    and public.is_company_staff(auth.uid(), _company_id);
$$;

revoke all on function public.can_manage_staff_student(uuid, uuid) from public, anon;
grant execute on function public.can_manage_staff_student(uuid, uuid) to authenticated, service_role;
comment on function public.can_manage_staff_student(uuid, uuid) is
  'Company-wide student management for authenticated staff; assignment is attribution only. Exact student-company binding required. Master retains existing cross-company management.';

-- A departed professional's historical attribution must not block unrelated
-- enrollment edits. New references still pass both integrity and staff guards.
create or replace function public.enforce_enrollment_reference_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.plan_id is not null and not exists (
    select 1 from public.plans p
    where p.id = new.plan_id and p.company_id = new.company_id
  ) then
    raise exception 'Enrollment plan/company mismatch' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.trainer_id is not distinct from old.trainer_id
     and new.company_id is not distinct from old.company_id then
    return new;
  end if;
  if new.trainer_id is not null
     and not public.has_role(new.trainer_id, 'master'::public.app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = new.trainer_id and cm.company_id = new.company_id
     ) then
    raise exception 'Enrollment trainer/company mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_enrollment_reference_integrity() from public, anon, authenticated;

create or replace function public.reassign_student_trainer(
  _student_id uuid,
  _trainer_id uuid,
  _expected_trainer_id uuid
)
returns table (
  student_id uuid,
  previous_trainer_id uuid,
  trainer_id uuid,
  updated_enrollments integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_company_id uuid;
  v_previous_trainer_id uuid;
  v_updated_enrollments integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select s.company_id, s.assigned_trainer_id
    into v_company_id, v_previous_trainer_id
    from public.students s
   where s.id = _student_id
   for update;

  if v_company_id is null then
    raise exception 'Student not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_staff_student(v_company_id, _student_id) then
    raise exception 'Not authorized to reassign students' using errcode = '42501';
  end if;

  if v_previous_trainer_id is not distinct from _trainer_id then
    raise exception 'Student already assigned to this trainer' using errcode = '22023';
  end if;
  if v_previous_trainer_id is distinct from _expected_trainer_id then
    raise exception 'Student assignment changed; reload before reassigning' using errcode = '40001';
  end if;

  if not exists (
    select 1 from public.company_members cm
    join public.user_roles ur on ur.user_id = cm.user_id
    where cm.company_id = v_company_id and cm.user_id = _trainer_id
      and ur.role in ('trainer'::public.app_role, 'coordinator'::public.app_role,
                      'admin'::public.app_role, 'master'::public.app_role)
  ) then
    raise exception 'Destination trainer is not active in this company' using errcode = '23514';
  end if;

  update public.students as s
     set assigned_trainer_id = _trainer_id, updated_at = now()
   where s.id = _student_id and s.company_id = v_company_id;

  update public.enrollments as e
     set trainer_id = _trainer_id, updated_at = now()
   where e.student_id = _student_id and e.company_id = v_company_id
     and e.status in ('active', 'awaiting_training', 'awaiting_renewal', 'trial');
  get diagnostics v_updated_enrollments = row_count;

  return query
  select _student_id, v_previous_trainer_id, _trainer_id, v_updated_enrollments;
end;
$$;

revoke all on function public.reassign_student_trainer(uuid, uuid, uuid) from public, anon;
grant execute on function public.reassign_student_trainer(uuid, uuid, uuid) to authenticated, service_role;

-- Direct REST updates must not bypass destination validation. Legacy unchanged
-- assignments are preserved; new assignments require a same-company staff user.
create or replace function public.enforce_student_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainer_id uuid;
begin
  if tg_table_name = 'students' then
    if tg_op = 'UPDATE' and new.assigned_trainer_id is not distinct from old.assigned_trainer_id
       and new.company_id is not distinct from old.company_id then
      return new;
    end if;
    v_trainer_id := new.assigned_trainer_id;
  else
    if tg_op = 'UPDATE' and new.trainer_id is not distinct from old.trainer_id
       and new.company_id is not distinct from old.company_id then
      return new;
    end if;
    v_trainer_id := new.trainer_id;
  end if;

  if v_trainer_id is not null and not exists (
    select 1 from public.company_members cm
    join public.user_roles ur on ur.user_id = cm.user_id
    where cm.company_id = new.company_id and cm.user_id = v_trainer_id
      and ur.role in ('trainer'::public.app_role, 'coordinator'::public.app_role,
                      'admin'::public.app_role, 'master'::public.app_role)
  ) then
    raise exception 'Assigned professional must be staff in this company' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_student_staff_assignment() from public, anon, authenticated;
grant execute on function public.enforce_student_staff_assignment() to service_role;

drop trigger if exists student_staff_assignment_guard on public.students;
create trigger student_staff_assignment_guard
after insert or update on public.students
for each row execute function public.enforce_student_staff_assignment();

drop trigger if exists enrollment_staff_assignment_guard on public.enrollments;
create trigger enrollment_staff_assignment_guard
after insert or update on public.enrollments
for each row execute function public.enforce_student_staff_assignment();

-- Trainers must see eligible destinations without gaining access to the raw
-- user_roles or profiles tables of other tenants.
create or replace function public.get_company_student_staff_directory(_company_id uuid)
returns table (user_id uuid, full_name text, roles text[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or _company_id is null
     or not public.is_company_staff(auth.uid(), _company_id) then
    raise exception 'Company staff access required' using errcode = '42501';
  end if;
  return query
    select cm.user_id, coalesce(max(p.full_name), 'Sem nome'),
           array_agg(distinct ur.role::text order by ur.role::text)
    from public.company_members cm
    join public.user_roles ur on ur.user_id = cm.user_id
    left join public.profiles p on p.user_id = cm.user_id
    where cm.company_id = _company_id
      and ur.role in ('trainer'::public.app_role, 'coordinator'::public.app_role,
                      'admin'::public.app_role, 'master'::public.app_role)
    group by cm.user_id
    order by coalesce(max(p.full_name), 'Sem nome'), cm.user_id;
end;
$$;

revoke all on function public.get_company_student_staff_directory(uuid) from public, anon;
grant execute on function public.get_company_student_staff_directory(uuid) to authenticated, service_role;

-- Preserve financial mutation permissions while student management is widened.
CREATE OR REPLACE FUNCTION public.can_manage_staff_student_financial(_company_id uuid, _student_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

revoke all on function public.can_manage_staff_student_financial(uuid, uuid) from public, anon;
grant execute on function public.can_manage_staff_student_financial(uuid, uuid) to authenticated, service_role;

do $financial_guards$
declare
  t text;
  guard text := $guard$
    public.has_role(auth.uid(), 'master'::public.app_role)
    or (
      company_id is not null and public.is_company_staff(auth.uid(), company_id)
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'coordinator'::public.app_role)
        or (student_id is not null and public.can_manage_staff_student_financial(company_id, student_id))
      )
    )
    or (student_id is not null and public.is_student_owner(auth.uid(), company_id, student_id))
  $guard$;
begin
  foreach t in array array['payments', 'payment_orphan_reconciliation_audit', 'payment_recovery_events']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'Assigned staff insert guard', t);
    execute format('drop policy if exists %I on public.%I', 'Assigned staff update guard', t);
    execute format('drop policy if exists %I on public.%I', 'Assigned staff delete guard', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)', 'Assigned staff insert guard', t, guard);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)', 'Assigned staff update guard', t, guard, guard);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (%s)', 'Assigned staff delete guard', t, guard);
  end loop;
end;
$financial_guards$;

