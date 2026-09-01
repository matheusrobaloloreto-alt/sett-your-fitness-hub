-- Influenciador(a) is an operational classification, not a paid enrollment.
-- Existing plans remain standard and keep every current payment/enrollment gate.

alter table public.plans
  add column if not exists plan_kind text not null default 'standard';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.plans'::regclass
      and conname = 'plans_plan_kind_check'
  ) then
    alter table public.plans
      add constraint plans_plan_kind_check
      check (plan_kind in ('standard', 'influencer'));
  end if;
end;
$$;

comment on column public.plans.plan_kind is
  'Operational contract. influencer activates/classifies without enrollment, trainer, dates or payment.';

create unique index if not exists plans_one_influencer_per_company_uidx
  on public.plans (company_id)
  where company_id is not null and plan_kind = 'influencer';

insert into public.student_categories (company_id, name, color, sort_order)
select
  company.id,
  'Influenciador(a)',
  '#8b5cf6',
  coalesce((
    select max(category.sort_order) + 1
    from public.student_categories category
    where category.company_id = company.id
  ), 0)
from public.companies company
where company.slug = 'bn-performance-training'
  and not exists (
    select 1
    from public.student_categories category
    where category.company_id = company.id
      and lower(btrim(category.name)) = lower('Influenciador(a)')
  );

-- Reuse the BN operational plan when it already exists. No other tenant is seeded.
with bn_plan_candidate as (
  select distinct on (plan.company_id) plan.id
  from public.plans plan
  join public.companies company on company.id = plan.company_id
  where company.slug = 'bn-performance-training'
    and (
      plan.plan_kind = 'influencer'
      or lower(btrim(plan.name)) in ('plano influ', lower('Influenciador(a)'))
    )
  order by plan.company_id, (plan.plan_kind = 'influencer') desc, plan.created_at, plan.id
)
update public.plans plan
set name = 'Influenciador(a)',
    description = coalesce(plan.description, 'Classificação operacional sem matrícula ou cobrança.'),
    price = 0,
    is_active = true,
    plan_kind = 'influencer',
    updated_at = now()
from bn_plan_candidate candidate
where plan.id = candidate.id;

insert into public.plans (
  company_id,
  name,
  description,
  price,
  duration_days,
  duration_weeks,
  cycle_duration_days,
  is_active,
  plan_kind
)
select
  company.id,
  'Influenciador(a)',
  'Classificação operacional sem matrícula ou cobrança.',
  0,
  30,
  4,
  30,
  true,
  'influencer'
from public.companies company
where company.slug = 'bn-performance-training'
  and not exists (
    select 1
    from public.plans plan
    where plan.company_id = company.id
      and plan.plan_kind = 'influencer'
  );

create or replace function public.classify_influencer_student(
  _student_id uuid,
  _plan_id uuid
)
returns table (
  student_id uuid,
  plan_id uuid,
  category_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_plan public.plans%rowtype;
  v_category_id uuid;
begin
  if _student_id is null or _plan_id is null then
    raise exception using errcode = '22023', message = 'Aluno e plano são obrigatórios.';
  end if;

  select student.*
    into v_student
  from public.students student
  where student.id = _student_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Aluno não encontrado.';
  end if;

  if not public.is_company_staff(auth.uid(), v_student.company_id) then
    raise exception using errcode = '42501', message = 'Sem permissão para classificar este aluno.';
  end if;

  select plan.*
    into v_plan
  from public.plans plan
  where plan.id = _plan_id
  for share;

  if not found
    or v_plan.company_id is distinct from v_student.company_id
    or v_plan.plan_kind <> 'influencer'
    or v_plan.is_active is distinct from true then
    raise exception using errcode = '23514', message = 'Plano Influenciador(a) inválido para a empresa do aluno.';
  end if;

  -- Serialize on-demand category creation inside the already validated tenant.
  perform pg_advisory_xact_lock(hashtextextended(v_student.company_id::text || ':influencer-category', 0));

  select category.id
    into v_category_id
  from public.student_categories category
  where category.company_id = v_student.company_id
    and lower(btrim(category.name)) = lower('Influenciador(a)')
  order by category.created_at
  limit 1;

  if v_category_id is null then
    insert into public.student_categories (company_id, name, color, sort_order)
    values (
      v_student.company_id,
      'Influenciador(a)',
      '#8b5cf6',
      coalesce((
        select max(category.sort_order) + 1
        from public.student_categories category
        where category.company_id = v_student.company_id
      ), 0)
    )
    returning id into v_category_id;
  end if;

  update public.students
  set selected_plan_id = v_plan.id,
      category_id = v_category_id,
      status = 'active',
      sales_stage = 'active',
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = v_student.id
    and company_id = v_student.company_id;

  return query
  select v_student.id, v_plan.id, v_category_id, 'active'::text;
end;
$$;

revoke all on function public.classify_influencer_student(uuid, uuid) from public, anon;
grant execute on function public.classify_influencer_student(uuid, uuid) to authenticated, service_role;
