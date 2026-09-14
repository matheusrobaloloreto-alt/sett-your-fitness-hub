-- Hotfix: troca atomica de professor sem recriar aluno ou matricula.
-- Mantem students.assigned_trainer_id e enrollments.trainer_id consistentes.

drop function if exists public.reassign_student_trainer(uuid, uuid);
drop function if exists public.reassign_student_trainer(uuid, uuid, uuid);

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
set search_path = public
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
$$;

revoke all on function public.reassign_student_trainer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reassign_student_trainer(uuid, uuid, uuid) to authenticated, service_role;
