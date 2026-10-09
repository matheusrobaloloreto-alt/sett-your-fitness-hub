-- Historical enrollments remain available, but only one overlapping term may be operational.
create or replace function public.guard_enrollment_term_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.start_date is null or new.end_date is null or new.end_date < new.start_date then
    raise exception using errcode = '23514', message = 'Datas da matrícula inválidas.';
  end if;

  if new.status = 'completed' or (
    tg_op = 'UPDATE'
    and old.start_date is not distinct from new.start_date
    and old.end_date is not distinct from new.end_date
    and old.student_id is not distinct from new.student_id
    and old.company_id is not distinct from new.company_id
    and (
      new.status = 'inactive'
      or (
        old.status in ('active', 'awaiting_training', 'awaiting_renewal', 'trial')
        and new.status in ('active', 'awaiting_training', 'awaiting_renewal', 'trial')
      )
    )
  ) then
    return new;
  end if;

  perform 1 from public.students where id = new.student_id and company_id = new.company_id for update;
  if exists (
    select 1 from public.enrollments other
    where other.student_id = new.student_id
      and other.company_id = new.company_id
      and other.id <> new.id
      and other.status <> 'completed'
      and other.start_date <= new.end_date
      and new.start_date <= other.end_date
  ) then
    raise exception using errcode = '23514',
      message = 'Já existe uma matrícula com datas sobrepostas para este aluno. Conclua ou corrija a matrícula anterior antes de continuar.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_enrollment_term_overlap() from public, anon, authenticated;
drop trigger if exists zz_guard_enrollment_term_overlap on public.enrollments;
create trigger zz_guard_enrollment_term_overlap
before insert or update of student_id, company_id, start_date, end_date, status
on public.enrollments
for each row execute function public.guard_enrollment_term_overlap();

create or replace function public.set_student_enrollment_status(
  _enrollment_id uuid, _status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.enrollments%rowtype;
begin
  if _status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'Status permitido: ativo ou inativo.';
  end if;
  if auth.uid() is null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '28000', message = 'Autenticação obrigatória.';
  end if;

  select * into v_target from public.enrollments where id = _enrollment_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Matrícula não encontrada.';
  end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
     and not public.can_manage_staff_student(v_target.company_id, v_target.student_id) then
    raise exception using errcode = '42501', message = 'Sem permissão para alterar esta matrícula.';
  end if;

  perform 1 from public.students
  where id = v_target.student_id and company_id = v_target.company_id for update;
  select * into v_target from public.enrollments where id = _enrollment_id for update;
  if v_target.status not in ('active', 'inactive') then
    raise exception using errcode = '23514',
      message = 'Apenas matrículas ativas ou inativas podem ser alternadas manualmente.';
  end if;
  if v_target.status = _status then return; end if;

  if _status = 'active' then
    if exists (
      select 1 from public.enrollments other
      where other.student_id = v_target.student_id
        and other.company_id = v_target.company_id
        and other.id <> v_target.id
        and other.status = 'inactive'
        and other.start_date <= v_target.end_date
        and v_target.start_date <= other.end_date
    ) then
      raise exception using errcode = '23514',
        message = 'Outra matrícula inativa tem datas sobrepostas. Revise o histórico antes de ativar.';
    end if;

    update public.enrollments other
    set status = 'completed'
    where other.student_id = v_target.student_id
      and other.company_id = v_target.company_id
      and other.id <> v_target.id
      and other.status in ('active', 'awaiting_training', 'awaiting_renewal')
      and other.start_date <= v_target.end_date
      and v_target.start_date <= other.end_date;
  end if;

  update public.enrollments set status = _status where id = v_target.id;
end;
$$;

revoke all on function public.set_student_enrollment_status(uuid, text) from public, anon;
grant execute on function public.set_student_enrollment_status(uuid, text) to authenticated, service_role;

-- A direct DELETE must never cascade into a prescribed cycle, payment or other history.
create or replace function public.guard_enrollment_delete_with_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference record;
  v_has_reference boolean;
begin
  if lower(coalesce(old.payment_status, '')) = 'paid' or old.payment_date is not null then
    raise exception using errcode = '23514',
      message = 'Esta matrícula registra pagamento e deve permanecer no histórico. Use Inativar.';
  end if;
  for v_reference in
    select constraint_row.conrelid::regclass as relation_name,
           attribute_row.attname as column_name
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.enrollments'::regclass
      and array_length(constraint_row.conkey, 1) = 1
  loop
    execute format('select exists(select 1 from %s where %I = $1)',
      v_reference.relation_name, v_reference.column_name)
      into v_has_reference using old.id;
    if v_has_reference then
      raise exception using errcode = '23514',
        message = 'Esta matrícula possui ciclos, pagamentos ou outro histórico vinculado. Não pode ser excluída; use Inativar.';
    end if;
  end loop;
  return old;
end;
$$;

revoke all on function public.guard_enrollment_delete_with_history() from public, anon, authenticated;
drop trigger if exists zz_guard_enrollment_delete_with_history on public.enrollments;
create trigger zz_guard_enrollment_delete_with_history
before delete on public.enrollments
for each row execute function public.guard_enrollment_delete_with_history();

create or replace function public.delete_empty_student_enrollment(_enrollment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target public.enrollments%rowtype;
begin
  if auth.uid() is null and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '28000', message = 'Autenticação obrigatória.';
  end if;
  select * into v_target from public.enrollments where id = _enrollment_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Matrícula não encontrada.';
  end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
     and not public.can_manage_staff_student(v_target.company_id, v_target.student_id) then
    raise exception using errcode = '42501', message = 'Sem permissão para excluir esta matrícula.';
  end if;

  perform 1 from public.students
  where id = v_target.student_id and company_id = v_target.company_id for update;
  delete from public.enrollments where id = _enrollment_id;
end;
$$;

revoke all on function public.delete_empty_student_enrollment(uuid) from public, anon;
grant execute on function public.delete_empty_student_enrollment(uuid) to authenticated, service_role;
