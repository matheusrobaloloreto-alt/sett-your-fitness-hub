-- The first confirmed receipt starts both onboarding deadlines. Existing dates
-- derived from payment are deliberately excluded from the receipt history.
create table public.assessment_material_receipts (
  student_id uuid primary key references public.students(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  received_on date not null,
  material_reference text not null check (char_length(material_reference) between 3 and 200),
  assessment_due_on date not null check (assessment_due_on > received_on),
  first_prescription_due_on date not null check (first_prescription_due_on > received_on),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null
);

alter table public.assessment_material_receipts enable row level security;
revoke all on public.assessment_material_receipts from public, anon, authenticated, service_role;
grant select on public.assessment_material_receipts to authenticated;

create policy "Staff read onboarding receipts in their company"
  on public.assessment_material_receipts for select to authenticated
  using (public.can_manage_staff_student(company_id, student_id));

create function public.record_assessment_material_receipt(
  _company_id uuid,
  _student_id uuid,
  _received_on date,
  _material_reference text
)
returns setof public.assessment_material_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_reference text := btrim(coalesce(_material_reference, ''));
  v_student public.students%rowtype;
  v_receipt public.assessment_material_receipts%rowtype;
  v_calendar jsonb;
  v_timezone text;
  v_today date;
  v_prescription_days integer;
  v_assessment_due date;
  v_prescription_due date;
begin
  if v_actor is null or not public.can_manage_staff_student(_company_id, _student_id) then
    raise exception 'Você não tem permissão para registrar o material deste aluno.' using errcode = '42501';
  end if;

  select * into v_student
  from public.students
  where id = _student_id and company_id = _company_id
  for update;

  if not found then
    raise exception 'Aluno não encontrado nesta empresa.' using errcode = '42501';
  end if;

  select * into v_receipt from public.assessment_material_receipts
  where student_id = _student_id and company_id = _company_id;

  if found then
    if v_receipt.received_on is distinct from _received_on or v_receipt.material_reference is distinct from v_reference then
      raise exception 'Já existe um recebimento registrado. Confira os dados salvos.' using errcode = 'PT409';
    end if;
    return next v_receipt;
    return;
  end if;

  if v_student.sales_stage is distinct from 'active_onboarding' and not exists (
    select 1 from public.enrollments e
    where e.student_id = _student_id and e.company_id = _company_id
      and e.status in ('active', 'awaiting_training') and e.requires_explicit_training_start
      and e.training_start_date is null
  ) then
    raise exception 'O registro é feito durante a primeira avaliação do aluno.' using errcode = '23514';
  end if;

  select settings into v_calendar from public.company_agenda_availability where company_id = _company_id;
  v_timezone := coalesce(v_calendar->>'timezone', 'America/Sao_Paulo');
  v_today := (now() at time zone v_timezone)::date;

  if _received_on is null or not isfinite(_received_on)
    or _received_on > v_today or _received_on < date '2000-01-01' then
    raise exception 'Informe uma data válida de recebimento, até hoje.' using errcode = '22023';
  end if;
  if char_length(v_reference) not between 3 and 200 then
    raise exception 'Informe uma referência curta para o material recebido.' using errcode = '22023';
  end if;

  -- Preserve the existing company setting as the delivery SLA. The evaluation
  -- itself is due in two business days.
  select (settings #>> '{business,assessment_sla_business_days}')::integer
  into v_prescription_days
  from public.company_product_settings where company_id = _company_id;
  v_prescription_days := greatest(2, least(30, coalesce(v_prescription_days, 5)));

  with days as (
    select _received_on + offset_day as day
    from pg_catalog.generate_series(1, 700) as offsets(offset_day)
  ), business_days as (
    select d.day, row_number() over (order by d.day) as day_number
    from days d
    left join lateral (
      select value->'windows' as windows
      from pg_catalog.jsonb_array_elements(coalesce(v_calendar->'exceptions', '[]'::jsonb))
      where (value->>'date')::date = d.day
    ) exception_day on true
    where case
      when exception_day.windows is not null then pg_catalog.jsonb_array_length(exception_day.windows) > 0
      when coalesce(pg_catalog.jsonb_array_length(v_calendar->'weekly'), 0) = 0 then extract(isodow from d.day) < 6
      else exists (
        select 1 from pg_catalog.jsonb_array_elements(v_calendar->'weekly') as weekly
        where (weekly.value->>'weekday')::integer = extract(dow from d.day)
      )
    end
  )
  select max(day) filter (where day_number = 2), max(day) filter (where day_number = v_prescription_days)
  into v_assessment_due, v_prescription_due
  from business_days;

  if v_assessment_due is null or v_prescription_due is null then
    raise exception 'A agenda da empresa não tem dias úteis suficientes para calcular o prazo.' using errcode = '23514';
  end if;

  insert into public.assessment_material_receipts (
    company_id, student_id, received_on, material_reference, assessment_due_on, first_prescription_due_on, recorded_by
  ) values (
    _company_id, _student_id, _received_on, v_reference, v_assessment_due, v_prescription_due, v_actor
  ) returning * into v_receipt;

  return next v_receipt;
end;
$$;

revoke all on function public.record_assessment_material_receipt(uuid, uuid, date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_assessment_material_receipt(uuid, uuid, date, text) to authenticated;
