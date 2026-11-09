begin;

alter table public.public_payment_links
  add column renewal_of_enrollment_id uuid;

create unique index public_payment_links_renewal_enrollment_unique
  on public.public_payment_links (renewal_of_enrollment_id)
  where renewal_of_enrollment_id is not null;

create function public.get_or_create_renewal_payment_link(
  _student_id uuid,
  _company_id uuid,
  _actor_id uuid,
  _enrollment_id uuid default null
)
returns table (token uuid, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_enrollment_id uuid;
  source_enrollment_id uuid;
  existing_link public.public_payment_links%rowtype;
begin
  -- Serialize link creation with the paid enrollment lifecycle for this student.
  perform 1 from public.students s
  where s.id = _student_id and s.company_id = _company_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Aluno não encontrado na empresa.';
  end if;

  select e.id into current_enrollment_id
  from public.enrollments e
  where e.student_id = _student_id and e.company_id = _company_id
    and e.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by case e.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    e.created_at desc, e.id desc
  limit 1;

  source_enrollment_id := coalesce(_enrollment_id, current_enrollment_id);
  if source_enrollment_id is null then
    raise exception using errcode = 'P0002', message = 'Nenhuma matrícula disponível para renovar.';
  end if;

  select l.* into existing_link
  from public.public_payment_links l
  where l.renewal_of_enrollment_id = source_enrollment_id
    and l.student_id = _student_id and l.company_id = _company_id;

  if found then
    if existing_link.revoked_at is not null then
      raise exception using errcode = '23514', message = 'O link de renovação desta matrícula foi revogado.';
    end if;
    if existing_link.expires_at <= now() then
      if source_enrollment_id is distinct from current_enrollment_id then
        raise exception using errcode = '23514', message = 'Esta matrícula já foi substituída. Atualize a página.';
      end if;
      -- Keep the same checkout key so a pending or paid charge is still reused.
      update public.public_payment_links l
      set expires_at = now() + interval '30 days'
      where l.id = existing_link.id and l.revoked_at is null
      returning l.* into existing_link;
      if not found then
        raise exception using errcode = '23514', message = 'O link de renovação desta matrícula foi revogado.';
      end if;
    end if;
    return query select existing_link.token, existing_link.expires_at;
    return;
  end if;

  if source_enrollment_id is distinct from current_enrollment_id then
    raise exception using errcode = '23514', message = 'Esta matrícula já foi substituída. Atualize a página.';
  end if;

  return query
    insert into public.public_payment_links as l (
      student_id, company_id, created_by, renewal_of_enrollment_id
    ) values (_student_id, _company_id, _actor_id, source_enrollment_id)
    returning l.token, l.expires_at;
end;
$$;

revoke all on function public.get_or_create_renewal_payment_link(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_or_create_renewal_payment_link(uuid, uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
