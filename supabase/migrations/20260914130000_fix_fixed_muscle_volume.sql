-- Additive function replacement. Historical company overrides/target percentages
-- remain stored, but never determine newly calculated anatomical exposure.
-- Requires the canonical taxonomy migration in this release.

create or replace function public.get_effective_exercise_targets(
  p_student_id uuid,
  p_exercise_ids uuid[]
)
returns table(
  exercise_id uuid,
  muscle_group_id uuid,
  muscle_group_name text,
  role text,
  is_primary boolean,
  volume_percentage numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_student_user_id uuid;
begin
  select s.company_id, s.user_id into v_company_id, v_student_user_id
  from public.students s
  where s.id = p_student_id;
  if v_company_id is null then
    raise exception 'Aluno não encontrado' using errcode = 'P0002';
  end if;
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or (
       auth.uid() is distinct from v_student_user_id
       and not coalesce(public.is_company_staff(auth.uid(), v_company_id), false)
     )) then
    raise exception 'Acesso negado ao aluno informado' using errcode = '42501';
  end if;

  return query
  select
    emt.exercise_id,
    emt.muscle_group_id,
    public.volume_muscle_group_label(mg.name),
    coalesce(emt.role, case when emt.is_primary then 'primary' else 'secondary' end),
    coalesce(emt.role = 'primary', emt.is_primary),
    case when coalesce(emt.role = 'primary', emt.is_primary) then 100 else 50 end::numeric
  from public.exercise_muscle_targets emt
  join public.exercise_library el on el.id = emt.exercise_id
  join public.muscle_groups mg on mg.id = emt.muscle_group_id
  where emt.exercise_id = any(coalesce(p_exercise_ids, '{}'::uuid[]))
    and (el.is_global or el.company_id = v_company_id)
    and public.canonical_volume_muscle_group(mg.name) is not null;
end;
$$;

revoke all on function public.get_effective_exercise_targets(uuid, uuid[]) from public, anon;
grant execute on function public.get_effective_exercise_targets(uuid, uuid[]) to authenticated, service_role;

create or replace function public.get_weekly_volume(p_student_id uuid)
returns table(
  muscle_group text,
  primary_sets numeric,
  secondary_sets numeric,
  effective_sets numeric,
  min_recommended numeric,
  optimal_recommended numeric,
  max_recommended numeric,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_student_user_id uuid;
  v_cycle_id uuid;
begin
  select s.company_id, s.user_id into v_company_id, v_student_user_id
  from public.students s where s.id = p_student_id;
  if v_company_id is null then
    raise exception 'Aluno não encontrado' using errcode = 'P0002';
  end if;
  if auth.role() is distinct from 'service_role'
     and (auth.uid() is null or (
       auth.uid() is distinct from v_student_user_id
       and not coalesce(public.is_company_staff(auth.uid(), v_company_id), false)
     )) then
    raise exception 'Acesso negado ao aluno informado' using errcode = '42501';
  end if;

  select tc.id into v_cycle_id
  from public.training_cycles tc
  where tc.student_id = p_student_id
    and tc.status = 'active'
    and (tc.start_date is null or tc.start_date <= current_date)
    and (tc.end_date is null or tc.end_date >= current_date)
  order by tc.start_date desc nulls last, tc.created_at desc
  limit 1;

  return query
  with exercise_rows as (
    select entry.*
    from public.workout_exercise_entries entry
    join public.workouts w on w.id = entry.workout_id
    where w.cycle_id = v_cycle_id
      and w.company_id = v_company_id
      and w.superseded_at is null
  ),
  target_candidates as (
    select
      rows.workout_id,
      rows.exercise_order,
      rows.exercise_id,
      rows.sets,
      public.canonical_volume_muscle_group(mg.name) as group_name,
      coalesce(emt.role, case when emt.is_primary then 'primary' else 'secondary' end) as target_role,
      case when coalesce(emt.role = 'primary', emt.is_primary) then 1 else 0.5 end::numeric as exposure_factor
    from exercise_rows rows
    join public.exercise_muscle_targets emt on emt.exercise_id = rows.exercise_id
    join public.muscle_groups mg on mg.id = emt.muscle_group_id

    union all

    select
      rows.workout_id,
      rows.exercise_order,
      rows.exercise_id,
      rows.sets,
      public.canonical_volume_muscle_group(rows.direct_muscle_group),
      'primary',
      1::numeric
    from exercise_rows rows
    where rows.direct_muscle_group is not null
      and not exists (
        select 1 from public.exercise_muscle_targets emt
        join public.muscle_groups mg on mg.id = emt.muscle_group_id
        where emt.exercise_id = rows.exercise_id
          and public.canonical_volume_muscle_group(mg.name) is not null
      )
  ),
  -- Aliases/children collapsed to one canonical group per exercise occurrence.
  -- MAX prevents parent + child taxonomy rows from double-counting the same set.
  targeted as (
    select
      workout_id,
      exercise_order,
      exercise_id,
      max(sets) as sets,
      group_name,
      bool_or(target_role = 'primary') as is_primary,
      max(exposure_factor) as exposure_factor
    from target_candidates
    where group_name is not null and exposure_factor is not null
    group by workout_id, exercise_order, exercise_id, group_name
  ),
  actual as (
    select
      group_name,
      sum(case when is_primary then sets * exposure_factor else 0 end)::numeric as primary_total,
      sum(case when not is_primary then sets * exposure_factor else 0 end)::numeric as secondary_total
    from targeted
    group by group_name
  ),
  recommendations as (
    select
      public.canonical_volume_muscle_group(vr.muscle_group_name) as group_name,
      max(vr.min_sets)::numeric as min_sets,
      max(vr.optimal_sets)::numeric as optimal_sets,
      max(vr.max_sets)::numeric as max_sets
    from public.volume_recommendations vr
    where public.canonical_volume_muscle_group(vr.muscle_group_name) is not null
    group by public.canonical_volume_muscle_group(vr.muscle_group_name)
  )
  select
    coalesce(r.group_name, a.group_name),
    coalesce(a.primary_total, 0),
    coalesce(a.secondary_total, 0),
    coalesce(a.primary_total, 0) + coalesce(a.secondary_total, 0),
    r.min_sets,
    r.optimal_sets,
    r.max_sets,
    case
      when r.group_name is null then 'unconfigured'
      when coalesce(a.primary_total, 0) + coalesce(a.secondary_total, 0) < r.min_sets then 'low'
      when coalesce(a.primary_total, 0) + coalesce(a.secondary_total, 0) > r.max_sets then 'high'
      else 'optimal'
    end
  from recommendations r
  full outer join actual a on lower(a.group_name) = lower(r.group_name)
  order by coalesce(r.group_name, a.group_name);
end;
$$;

revoke all on function public.get_weekly_volume(uuid) from public, anon;
grant execute on function public.get_weekly_volume(uuid) to authenticated, service_role;

comment on function public.get_weekly_volume(uuid) is
  'Weekly fractional work-set exposure per canonical muscle group. LOAD remains a separate kg x reps metric.';
