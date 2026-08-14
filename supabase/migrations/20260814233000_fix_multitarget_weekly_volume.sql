-- Correct multi-target weekly-set accounting without changing existing data.
-- Historical volume_percentage uses two scales: 0..1 (fraction) and >1 (percent).
-- This migration normalizes both at read time and gives company overrides precedence.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercise_muscle_targets_volume_percentage_domain'
  ) then
    alter table public.exercise_muscle_targets
      add constraint exercise_muscle_targets_volume_percentage_domain
      check (volume_percentage >= 0 and volume_percentage <= 100) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'exercise_muscle_targets_role_domain'
  ) then
    alter table public.exercise_muscle_targets
      add constraint exercise_muscle_targets_role_domain
      check (role in ('primary', 'secondary')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'exercise_muscle_targets_role_coherence'
  ) then
    alter table public.exercise_muscle_targets
      add constraint exercise_muscle_targets_role_coherence
      check ((role = 'primary') is not distinct from is_primary) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'company_exercise_volumes_percentage_domain'
  ) then
    alter table public.company_exercise_volumes
      add constraint company_exercise_volumes_percentage_domain
      check (volume_percentage >= 0 and volume_percentage <= 100) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'company_exercise_volumes_role_domain'
  ) then
    alter table public.company_exercise_volumes
      add constraint company_exercise_volumes_role_domain
      check (role in ('primary', 'secondary')) not valid;
  end if;
end
$$;

create or replace function public.canonical_volume_muscle_group(p_group text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  group_key text := lower(trim(coalesce(p_group, '')));
begin
  if group_key = '' then return null; end if;
  if group_key in ('costas', 'dorsal') then return 'Costas'; end if;
  if group_key in ('peito', 'peitoral') then return 'Peito'; end if;
  if group_key like '%glúteo%' or group_key like '%gluteo%' then return 'Glúteos'; end if;
  if group_key like '%deltoide%' or group_key like '%ombro%' then return 'Ombros'; end if;
  if group_key in ('core', 'abdômen', 'abdomen', 'abdominais') then return 'Abdômen'; end if;
  if group_key like '%panturr%' then return 'Panturrilhas'; end if;
  if group_key like '%posterior%' or group_key like '%isquio%' then return 'Posterior de coxa'; end if;
  if group_key like '%quadri%' then return 'Quadríceps'; end if;
  if group_key like '%bíceps%' or group_key like '%biceps%' then return 'Bíceps'; end if;
  if group_key like '%tríceps%' or group_key like '%triceps%' then return 'Tríceps'; end if;
  if group_key like '%trapéz%' or group_key like '%trapez%' then return 'Trapézio'; end if;
  if group_key like '%antebra%' then return 'Antebraço'; end if;
  return trim(p_group);
end;
$$;

revoke all on function public.canonical_volume_muscle_group(text) from public, anon;
grant execute on function public.canonical_volume_muscle_group(text) to authenticated, service_role;

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
  if auth.role() <> 'service_role'
     and auth.uid() is distinct from v_student_user_id
     and not public.has_role(auth.uid(), 'master'::app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = auth.uid() and cm.company_id = v_company_id
     ) then
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
  ),
  target_candidates as (
    select
      rows.workout_id,
      rows.exercise_order,
      rows.exercise_id,
      rows.sets,
      public.canonical_volume_muscle_group(mg.name) as group_name,
      coalesce(cev.role, emt.role, case when emt.is_primary then 'primary' else 'secondary' end) as target_role,
      case
        when coalesce(cev.volume_percentage, emt.volume_percentage) between 0 and 1
          then coalesce(cev.volume_percentage, emt.volume_percentage)::numeric
        when coalesce(cev.volume_percentage, emt.volume_percentage) > 1
          and coalesce(cev.volume_percentage, emt.volume_percentage) <= 100
          then (coalesce(cev.volume_percentage, emt.volume_percentage) / 100.0)::numeric
        else null
      end as exposure_factor
    from exercise_rows rows
    join public.exercise_muscle_targets emt on emt.exercise_id = rows.exercise_id
    join public.muscle_groups mg on mg.id = emt.muscle_group_id
    left join public.company_exercise_volumes cev
      on cev.company_id = v_company_id
     and cev.exercise_id = emt.exercise_id
     and cev.muscle_group_id = emt.muscle_group_id

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
        where emt.exercise_id = rows.exercise_id
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

revoke all on function public.get_weekly_volume(uuid) from anon;
grant execute on function public.get_weekly_volume(uuid) to authenticated, service_role;

comment on function public.get_weekly_volume(uuid) is
  'Weekly fractional work-set exposure per canonical muscle group. LOAD remains a separate kg x reps metric.';
