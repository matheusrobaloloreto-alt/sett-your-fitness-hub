-- Reconcile stale staff identities, prevent duplicate open enrollments, and
-- make analytics understand both normalized and JSON-backed workout exercises.

-- Exact, audited identity replacements in BN Performance Training.
update public.students
set assigned_trainer_id = case assigned_trainer_id
  when '3e3520e7-94f4-43bc-955d-814cd3415696'::uuid
    then 'db3f1b19-7971-4c53-9eb6-f7bd4dc0bb1d'::uuid
  when 'd55b9d3b-d083-4438-b641-8b8ca95416a0'::uuid
    then 'db3f1b19-7971-4c53-9eb6-f7bd4dc0bb1d'::uuid
  when '88c72814-4f6f-4b2f-b681-985495676b5f'::uuid
    then '5453d080-e64e-43dc-ae14-50a37e5633b3'::uuid
  else assigned_trainer_id
end
where assigned_trainer_id in (
  '3e3520e7-94f4-43bc-955d-814cd3415696'::uuid,
  'd55b9d3b-d083-4438-b641-8b8ca95416a0'::uuid,
  '88c72814-4f6f-4b2f-b681-985495676b5f'::uuid
);

update public.enrollments
set trainer_id = case trainer_id
  when '3e3520e7-94f4-43bc-955d-814cd3415696'::uuid
    then 'db3f1b19-7971-4c53-9eb6-f7bd4dc0bb1d'::uuid
  when 'd55b9d3b-d083-4438-b641-8b8ca95416a0'::uuid
    then 'db3f1b19-7971-4c53-9eb6-f7bd4dc0bb1d'::uuid
  when '88c72814-4f6f-4b2f-b681-985495676b5f'::uuid
    then '5453d080-e64e-43dc-ae14-50a37e5633b3'::uuid
  else trainer_id
end
where trainer_id in (
  '3e3520e7-94f4-43bc-955d-814cd3415696'::uuid,
  'd55b9d3b-d083-4438-b641-8b8ca95416a0'::uuid,
  '88c72814-4f6f-4b2f-b681-985495676b5f'::uuid
);

-- Keep historical profiles/assignment history, but do not expose memberships
-- or roles for users that no longer exist in Auth.
delete from public.company_members cm
where not exists (select 1 from auth.users au where au.id = cm.user_id);

delete from public.user_roles ur
where not exists (select 1 from auth.users au where au.id = ur.user_id);

-- Merge overlapping operational enrollments, favoring the newest active row.
do $$
declare
  v_group record;
  v_keeper uuid;
  v_plan uuid;
  v_trainer uuid;
  v_company uuid;
  v_start date;
  v_end date;
begin
  for v_group in
    select e.student_id
    from public.enrollments e
    where lower(coalesce(e.status, '')) in ('active', 'trial', 'awaiting_training')
    group by e.student_id
    having count(*) > 1
  loop
    select e.id
      into v_keeper
    from public.enrollments e
    where e.student_id = v_group.student_id
      and lower(coalesce(e.status, '')) in ('active', 'trial', 'awaiting_training')
    order by
      case lower(coalesce(e.status, ''))
        when 'active' then 0
        when 'trial' then 1
        else 2
      end,
      e.created_at desc
    limit 1;

    select
      (array_agg(e.plan_id order by (e.plan_id is not null) desc, e.created_at desc))[1],
      (array_agg(e.trainer_id order by (e.trainer_id is not null) desc, e.created_at desc))[1],
      (array_agg(e.company_id order by (e.company_id is not null) desc, e.created_at desc))[1],
      min(e.start_date),
      max(e.end_date)
      into v_plan, v_trainer, v_company, v_start, v_end
    from public.enrollments e
    where e.student_id = v_group.student_id
      and lower(coalesce(e.status, '')) in ('active', 'trial', 'awaiting_training');

    update public.enrollments
    set plan_id = coalesce(plan_id, v_plan),
        trainer_id = coalesce(trainer_id, v_trainer),
        company_id = coalesce(company_id, v_company),
        start_date = coalesce(least(start_date, v_start), start_date, v_start),
        end_date = coalesce(greatest(end_date, v_end), end_date, v_end),
        updated_at = now()
    where id = v_keeper;

    update public.enrollments
    set status = 'inactive',
        notes = concat_ws(
          E'\n',
          nullif(notes, ''),
          'Matrícula consolidada automaticamente em ' || v_keeper::text
        ),
        updated_at = now()
    where student_id = v_group.student_id
      and id <> v_keeper
      and lower(coalesce(status, '')) in ('active', 'trial', 'awaiting_training');
  end loop;
end;
$$;

create unique index if not exists enrollments_one_open_per_student_idx
  on public.enrollments(student_id)
  where lower(coalesce(status, '')) in ('active', 'trial', 'awaiting_training');

-- Restore referential guarantees for operational staff references.
alter table public.company_members
  drop constraint if exists company_members_user_id_fkey;
alter table public.company_members
  add constraint company_members_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.user_roles
  drop constraint if exists user_roles_user_id_fkey;
alter table public.user_roles
  add constraint user_roles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.students
  drop constraint if exists students_assigned_trainer_id_fkey;
alter table public.students
  add constraint students_assigned_trainer_id_fkey
  foreign key (assigned_trainer_id) references auth.users(id) on delete set null;

alter table public.enrollments
  drop constraint if exists enrollments_trainer_id_fkey;
alter table public.enrollments
  add constraint enrollments_trainer_id_fkey
  foreign key (trainer_id) references auth.users(id) on delete set null;

-- Empty cycles are planning placeholders, not active prescriptions. Some
-- historical environments stored an additional JSON snapshot directly on the
-- cycle; preserve it when that drift-only column exists.
do $empty_cycles$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_cycles'
      and column_name = 'workouts'
  ) then
    execute $sql$
      update public.training_cycles tc
      set status = 'pending',
          delivery_status = coalesce(tc.delivery_status, 'pending')
      where lower(coalesce(tc.status, '')) = 'active'
        and (tc.start_date is null or tc.start_date <= current_date)
        and tc.prescribed_offline_at is null
        and (
          tc.workouts is null
          or jsonb_typeof(tc.workouts) <> 'array'
          or jsonb_array_length(tc.workouts) = 0
        )
        and not exists (
          select 1 from public.workouts w where w.cycle_id = tc.id
        )
    $sql$;
  else
    update public.training_cycles tc
    set status = 'pending',
        delivery_status = coalesce(tc.delivery_status, 'pending')
    where lower(coalesce(tc.status, '')) = 'active'
      and (tc.start_date is null or tc.start_date <= current_date)
      and tc.prescribed_offline_at is null
      and not exists (
        select 1 from public.workouts w where w.cycle_id = tc.id
      );
  end if;
end;
$empty_cycles$;

-- Canonical internal projection. Current production workouts use exercises
-- JSON; normalized rows remain supported only where that optional table was
-- actually installed. Dynamic DDL avoids making a fresh replay depend on
-- production-only schema drift.
do $workout_entries$
declare
  v_normalized_select text := '';
  v_json_filter text := '';
begin
  if to_regclass('public.workout_exercises') is not null then
    v_normalized_select := $sql$
      select
        we.workout_id,
        we.exercise_id,
        coalesce(we.exercise_name, el.name) as exercise_name,
        coalesce(we.sets, 0)::numeric as sets,
        coalesce(we.exercise_order, 0)::integer as exercise_order,
        el.muscle_group as direct_muscle_group
      from public.workout_exercises we
      left join public.exercise_library el on el.id = we.exercise_id
      union all
    $sql$;
    v_json_filter := $sql$
      where not exists (
        select 1 from public.workout_exercises normalized
        where normalized.workout_id = w.id
      )
    $sql$;
  end if;

  execute
    'create or replace view public.workout_exercise_entries '
    || 'with (security_invoker = true) as '
    || v_normalized_select
    || $sql$
      select
        w.id as workout_id,
        case
          when item.exercise->>'exercise_id'
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (item.exercise->>'exercise_id')::uuid
          else null
        end as exercise_id,
        coalesce(
          item.exercise->>'exercise_name',
          item.exercise->>'name',
          el.name
        ) as exercise_name,
        coalesce(
          nullif(substring(coalesce(item.exercise->>'sets', '') from '[0-9]+'), '')::numeric,
          0
        ) as sets,
        (item.ordinality - 1)::integer as exercise_order,
        coalesce(item.exercise->>'muscle_group', el.muscle_group) as direct_muscle_group
      from public.workouts w
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(w.exercises) = 'array' then w.exercises
          else '[]'::jsonb
        end
      ) with ordinality as item(exercise, ordinality)
      left join public.exercise_library el
        on el.id = case
          when item.exercise->>'exercise_id'
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (item.exercise->>'exercise_id')::uuid
          else null
        end
    $sql$
    || v_json_filter;
end;
$workout_entries$;

revoke all on public.workout_exercise_entries from public, anon, authenticated;
grant select on public.workout_exercise_entries to service_role;

create or replace function public.generate_referral_code(p_full_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_attempt integer;
begin
  v_base := upper(regexp_replace(coalesce(p_full_name, ''), '[^[:alnum:]]', '', 'g'));
  v_base := rpad(left(v_base, 4), 4, 'X');

  for v_attempt in 1..20 loop
    v_candidate := v_base || lpad(floor(random() * 10000)::integer::text, 4, '0');
    if to_regclass('public.referrals') is null then
      if not exists (
        select 1 from public.students s where s.referral_code = v_candidate
      ) then
        return v_candidate;
      end if;
    else
      if not exists (
        select 1 from public.referrals r where r.referral_code = v_candidate
        union all
        select 1 from public.students s where s.referral_code = v_candidate
      ) then
        return v_candidate;
      end if;
    end if;
  end loop;

  return v_base || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
end;
$$;

create or replace function public.get_load_progression(
  p_student_id uuid,
  p_months integer default 6
)
returns table(
  exercise_name text,
  month_start date,
  max_load numeric,
  max_reps integer,
  estimated_1rm numeric
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

  return query
  with entries as (
    select
      coalesce(
        exercise_match.exercise_name,
        'Exercício ' || (coalesce(wl.exercise_index, 0) + 1)
      ) as resolved_name,
      wl.created_at,
      wl.weight,
      wl.reps_done
    from public.workout_logs wl
    left join lateral (
      select entry.exercise_name
      from public.workout_exercise_entries entry
      where entry.workout_id = wl.workout_id
      order by abs(entry.exercise_order - coalesce(wl.exercise_index, 0))
      limit 1
    ) exercise_match on true
    where wl.student_id = p_student_id
      and coalesce(wl.completed, true)
      and wl.weight is not null
      and wl.weight > 0
      and wl.reps_done is not null
      and wl.created_at >= now() - make_interval(months => greatest(coalesce(p_months, 6), 1))
  ),
  top_exercises as (
    select e.resolved_name
    from entries e
    group by e.resolved_name
    order by count(*) desc, e.resolved_name
    limit 8
  ),
  monthly as (
    select
      e.resolved_name,
      date_trunc('month', e.created_at)::date as bucket_month,
      max(e.weight)::numeric as bucket_load,
      max(e.reps_done)::integer as bucket_reps
    from entries e
    where e.resolved_name in (select te.resolved_name from top_exercises te)
    group by e.resolved_name, date_trunc('month', e.created_at)
  )
  select
    m.resolved_name,
    m.bucket_month,
    m.bucket_load,
    m.bucket_reps,
    round(m.bucket_load * (1 + m.bucket_reps::numeric / 30), 1)
  from monthly m
  order by m.resolved_name, m.bucket_month;
end;
$$;

create or replace function public.get_personal_records(p_student_id uuid)
returns table(
  exercise_name text,
  max_load numeric,
  reps_at_max integer,
  estimated_1rm numeric,
  achieved_at timestamptz
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

  return query
  with entries as (
    select
      coalesce(
        exercise_match.exercise_name,
        'Exercício ' || (coalesce(wl.exercise_index, 0) + 1)
      ) as resolved_name,
      wl.weight::numeric as load,
      wl.reps_done as reps,
      wl.created_at,
      round(wl.weight::numeric * (1 + wl.reps_done::numeric / 30), 1) as estimated
    from public.workout_logs wl
    left join lateral (
      select entry.exercise_name
      from public.workout_exercise_entries entry
      where entry.workout_id = wl.workout_id
      order by abs(entry.exercise_order - coalesce(wl.exercise_index, 0))
      limit 1
    ) exercise_match on true
    where wl.student_id = p_student_id
      and coalesce(wl.completed, true)
      and wl.weight is not null
      and wl.weight > 0
      and wl.reps_done is not null
  ),
  ranked as (
    select
      e.*,
      row_number() over (
        partition by e.resolved_name
        order by e.estimated desc, e.created_at desc
      ) as position
    from entries e
  )
  select r.resolved_name, r.load, r.reps, r.estimated, r.created_at
  from ranked r
  where r.position = 1
  order by r.estimated desc nulls last
  limit 12;
end;
$$;

drop function if exists public.get_weekly_volume(uuid);
create function public.get_weekly_volume(p_student_id uuid)
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
  targeted as (
    select
      rows.exercise_id,
      mg.name as group_name,
      rows.sets,
      coalesce(emt.is_primary, emt.role = 'primary') as is_primary,
      coalesce(emt.volume_percentage, 0.5)::numeric as volume_weight
    from exercise_rows rows
    join public.exercise_muscle_targets emt on emt.exercise_id = rows.exercise_id
    join public.muscle_groups mg on mg.id = emt.muscle_group_id

    union all

    select
      rows.exercise_id,
      rows.direct_muscle_group,
      rows.sets,
      true,
      1::numeric
    from exercise_rows rows
    where rows.direct_muscle_group is not null
      and not exists (
        select 1 from public.exercise_muscle_targets emt
        where emt.exercise_id = rows.exercise_id
      )
  ),
  actual as (
    select
      t.group_name,
      sum(case when t.is_primary then t.sets else 0 end)::numeric as primary_total,
      sum(case when not t.is_primary then t.sets * t.volume_weight else 0 end)::numeric
        as secondary_total
    from targeted t
    where t.group_name is not null
    group by t.group_name
  )
  select
    vr.muscle_group_name,
    coalesce(a.primary_total, 0),
    coalesce(a.secondary_total, 0),
    coalesce(a.primary_total, 0) + coalesce(a.secondary_total, 0),
    vr.min_sets::numeric,
    vr.optimal_sets::numeric,
    vr.max_sets::numeric,
    case
      when coalesce(a.primary_total, 0) + coalesce(a.secondary_total, 0) < vr.min_sets then 'low'
      when coalesce(a.primary_total, 0) + coalesce(a.secondary_total, 0) > vr.max_sets then 'high'
      else 'optimal'
    end
  from public.volume_recommendations vr
  left join actual a on lower(a.group_name) = lower(vr.muscle_group_name)
  order by vr.muscle_group_name;
end;
$$;

revoke all on function public.get_weekly_volume(uuid) from anon;
grant execute on function public.get_weekly_volume(uuid) to authenticated, service_role;
