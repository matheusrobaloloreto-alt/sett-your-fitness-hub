-- Authorization rollback only; no student, enrollment or workout data is deleted.
drop trigger if exists student_staff_assignment_guard on public.students;
drop trigger if exists enrollment_staff_assignment_guard on public.enrollments;
drop function if exists public.enforce_student_staff_assignment();
drop function if exists public.get_company_student_staff_directory(uuid);
CREATE OR REPLACE FUNCTION public.enforce_enrollment_reference_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.plan_id is not null and not exists (
    select 1 from public.plans p
    where p.id = new.plan_id and p.company_id = new.company_id
  ) then
    raise exception 'Enrollment plan/company mismatch' using errcode = '23514';
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
$function$;
CREATE OR REPLACE FUNCTION public.can_manage_staff_student(_company_id uuid, _student_id uuid)
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
CREATE OR REPLACE FUNCTION public.reassign_student_trainer(_student_id uuid, _trainer_id uuid, _expected_trainer_id uuid)
 RETURNS TABLE(student_id uuid, previous_trainer_id uuid, trainer_id uuid, updated_enrollments integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not (
    public.has_role(v_actor, 'master'::public.app_role)
    or (
      public.is_company_staff(v_actor, v_company_id)
      and (
        public.has_role(v_actor, 'admin'::public.app_role)
        or public.has_role(v_actor, 'coordinator'::public.app_role)
      )
    )
  ) then
    raise exception 'Not authorized to reassign students' using errcode = '42501';
  end if;

  if v_previous_trainer_id is not distinct from _trainer_id then
    raise exception 'Student already assigned to this trainer' using errcode = '22023';
  end if;

  if v_previous_trainer_id is distinct from _expected_trainer_id then
    raise exception 'Student assignment changed; reload before reassigning' using errcode = '40001';
  end if;

  if not exists (
    select 1
      from public.company_members cm
      join public.user_roles ur on ur.user_id = cm.user_id
     where cm.company_id = v_company_id
       and cm.user_id = _trainer_id
       and ur.role = 'trainer'::public.app_role
  ) then
    raise exception 'Destination trainer is not active in this company' using errcode = '23514';
  end if;

  update public.students as s
     set assigned_trainer_id = _trainer_id,
         updated_at = now()
   where s.id = _student_id
     and s.company_id = v_company_id;

  update public.enrollments as e
     set trainer_id = _trainer_id,
         updated_at = now()
   where e.student_id = _student_id
     and e.company_id = v_company_id
     and e.status in ('active', 'awaiting_training', 'awaiting_renewal', 'trial');

  get diagnostics v_updated_enrollments = row_count;

  return query
  select _student_id, v_previous_trainer_id, _trainer_id, v_updated_enrollments;
end;
$function$;
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
        or (student_id is not null and public.can_manage_staff_student(company_id, student_id))
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


drop function if exists public.can_manage_staff_student_financial(uuid, uuid);

