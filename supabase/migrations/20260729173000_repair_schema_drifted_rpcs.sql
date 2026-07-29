-- Repair RPCs created against superseded table shapes.
-- Every SECURITY DEFINER function below performs explicit tenant authorization.

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
    if not exists (
      select 1 from public.referrals r where r.referral_code = v_candidate
      union all
      select 1 from public.students s where s.referral_code = v_candidate
    ) then
      return v_candidate;
    end if;
  end loop;

  return v_base || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
end;
$$;

create or replace function public.get_company_overview(p_company_id uuid)
returns table(
  total_students integer,
  active_students integer,
  trial_students integer,
  inactive_students integer,
  mrr numeric,
  new_students_this_month integer,
  new_students_last_month integer,
  churned_this_month integer,
  pending_payments integer,
  overdue_payments integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
  v_last_month_start date := (date_trunc('month', current_date) - interval '1 month')::date;
  v_last_month_end date := (date_trunc('month', current_date) - interval '1 day')::date;
begin
  if auth.role() <> 'service_role'
     and not public.has_role(auth.uid(), 'master'::app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = auth.uid() and cm.company_id = p_company_id
     ) then
    raise exception 'Acesso negado à empresa informada' using errcode = '42501';
  end if;

  return query
  with stu as (
    select s.id, s.created_at::date as created_date
    from public.students s
    where s.company_id = p_company_id
  ),
  enrollment_data as (
    select
      e.student_id,
      lower(coalesce(e.status, '')) as status,
      lower(coalesce(e.payment_status, '')) as payment_status,
      e.updated_at::date as updated_date,
      e.end_date,
      coalesce(p.price, 0)::numeric as plan_price
    from public.enrollments e
    left join public.plans p on p.id = e.plan_id
    where e.student_id in (select stu.id from stu)
  )
  select
    (select count(*)::integer from stu),
    (select count(distinct ed.student_id)::integer from enrollment_data ed where ed.status = 'active'),
    (select count(distinct ed.student_id)::integer from enrollment_data ed where ed.status = 'trial'),
    (select count(*)::integer from stu s
      where not exists (
        select 1 from enrollment_data ed
        where ed.student_id = s.id and ed.status in ('active', 'trial', 'awaiting_training')
      )),
    coalesce((select sum(ed.plan_price) from enrollment_data ed where ed.status = 'active'), 0),
    (select count(*)::integer from stu s where s.created_date >= v_month_start),
    (select count(*)::integer from stu s
      where s.created_date between v_last_month_start and v_last_month_end),
    (select count(distinct ed.student_id)::integer
      from enrollment_data ed
      where ed.status in ('inactive', 'cancelled', 'canceled')
        and coalesce(ed.end_date, ed.updated_date) >= v_month_start),
    (select count(*)::integer from enrollment_data ed where ed.payment_status = 'pending'),
    (select count(*)::integer from enrollment_data ed where ed.payment_status = 'overdue');
end;
$$;

create or replace function public.get_student_active_challenges(p_student_id uuid)
returns table(
  challenge_id uuid,
  name text,
  description text,
  emoji text,
  cover_image_url text,
  challenge_type text,
  goal_value numeric,
  prize_description text,
  starts_at date,
  ends_at date,
  days_remaining integer,
  is_joined boolean,
  my_score numeric,
  my_rank integer,
  total_participants integer
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
  select s.company_id, s.user_id
    into v_company_id, v_student_user_id
  from public.students s
  where s.id = p_student_id;

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
  with ranked as (
    select
      cp.challenge_id as ranked_challenge_id,
      cp.student_id as ranked_student_id,
      row_number() over (
        partition by cp.challenge_id
        order by cp.current_score desc nulls last, cp.joined_at asc
      )::integer as ranked_position,
      coalesce(cp.current_score, 0)::numeric as ranked_score
    from public.challenge_participants cp
  )
  select
    c.id,
    c.name,
    c.description,
    c.emoji,
    c.cover_image_url,
    c.challenge_type,
    c.goal_value,
    c.prize_description,
    c.starts_at,
    c.ends_at,
    greatest(0, c.ends_at - current_date)::integer,
    exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = c.id and cp.student_id = p_student_id
    ),
    coalesce((
      select r.ranked_score from ranked r
      where r.ranked_challenge_id = c.id and r.ranked_student_id = p_student_id
    ), 0),
    coalesce((
      select r.ranked_position from ranked r
      where r.ranked_challenge_id = c.id and r.ranked_student_id = p_student_id
    ), 0),
    (select count(*)::integer from public.challenge_participants cp where cp.challenge_id = c.id)
  from public.challenges c
  where c.company_id = v_company_id
    and coalesce(c.is_active, false)
    and c.ends_at >= current_date
  order by c.ends_at asc;
end;
$$;

create or replace function public.get_injury_stats(p_company_id uuid)
returns table(
  total_reports integer,
  pending_count integer,
  high_severity_count integer,
  resolved_last_30d integer,
  top_region text,
  avg_resolution_days numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and not public.has_role(auth.uid(), 'master'::app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = auth.uid() and cm.company_id = p_company_id
     ) then
    raise exception 'Acesso negado à empresa informada' using errcode = '42501';
  end if;

  return query
  select
    count(*)::integer,
    count(*) filter (where ir.status in ('pending', 'analyzing', 'analyzed'))::integer,
    count(*) filter (where ir.ai_severity >= 4)::integer,
    count(*) filter (
      where ir.status = 'resolved' and ir.resolved_at >= now() - interval '30 days'
    )::integer,
    (
      select ir2.region
      from public.injury_reports ir2
      where ir2.company_id = p_company_id
      group by ir2.region
      order by count(*) desc, ir2.region
      limit 1
    ),
    round(
      avg(extract(epoch from (ir.resolved_at - ir.created_at)) / 86400.0)
        filter (where ir.status = 'resolved' and ir.resolved_at is not null),
      1
    )
  from public.injury_reports ir
  where ir.company_id = p_company_id;
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
      coalesce(we_match.exercise_name, el.name, 'Exercício ' || (coalesce(wl.exercise_index, 0) + 1)) as resolved_name,
      wl.created_at,
      wl.weight,
      wl.reps_done
    from public.workout_logs wl
    left join lateral (
      select we.exercise_id, we.exercise_name
      from public.workout_exercises we
      where we.workout_id = wl.workout_id
      order by abs(coalesce(we.exercise_order, 0) - coalesce(wl.exercise_index, 0))
      limit 1
    ) we_match on true
    left join public.exercise_library el on el.id = we_match.exercise_id
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

create or replace function public.get_monthly_volume(
  p_student_id uuid,
  p_months integer default 6
)
returns table(
  month_start date,
  total_volume numeric,
  total_sets integer,
  sessions_count integer
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
  select
    date_trunc('month', wl.created_at)::date,
    round(coalesce(sum(wl.weight * wl.reps_done), 0)::numeric, 0),
    count(*)::integer,
    count(distinct (
      wl.workout_id,
      coalesce(wl.session_date, wl.created_at::date)
    ))::integer
  from public.workout_logs wl
  where wl.student_id = p_student_id
    and coalesce(wl.completed, true)
    and wl.weight is not null
    and wl.reps_done is not null
    and wl.created_at >= now() - make_interval(months => greatest(coalesce(p_months, 6), 1))
  group by date_trunc('month', wl.created_at)
  order by date_trunc('month', wl.created_at);
end;
$$;

create or replace function public.get_monthly_growth(
  p_company_id uuid,
  p_months integer default 12
)
returns table(
  month_start date,
  new_students integer,
  active_students integer,
  churned integer,
  mrr_at_end numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and not public.has_role(auth.uid(), 'master'::app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = auth.uid() and cm.company_id = p_company_id
     ) then
    raise exception 'Acesso negado à empresa informada' using errcode = '42501';
  end if;

  return query
  with months as (
    select generate_series(
      date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_months, 12), 1) - 1),
      date_trunc('month', current_date),
      interval '1 month'
    )::date as m_start
  )
  select
    m.m_start,
    (
      select count(*)::integer
      from public.students s
      where s.company_id = p_company_id
        and s.created_at >= m.m_start
        and s.created_at < m.m_start + interval '1 month'
    ),
    (
      select count(distinct e.student_id)::integer
      from public.enrollments e
      where e.company_id = p_company_id
        and coalesce(e.start_date, e.created_at::date) < m.m_start + interval '1 month'
        and (e.end_date is null or e.end_date >= m.m_start)
    ),
    (
      select count(distinct e.student_id)::integer
      from public.enrollments e
      where e.company_id = p_company_id
        and lower(coalesce(e.status, '')) in ('inactive', 'cancelled', 'canceled')
        and coalesce(e.end_date, e.updated_at::date) >= m.m_start
        and coalesce(e.end_date, e.updated_at::date) < m.m_start + interval '1 month'
    ),
    coalesce((
      select sum(coalesce(p.price, 0))::numeric
      from public.enrollments e
      left join public.plans p on p.id = e.plan_id
      where e.company_id = p_company_id
        and coalesce(e.start_date, e.created_at::date) < m.m_start + interval '1 month'
        and (e.end_date is null or e.end_date >= m.m_start)
    ), 0)
  from months m
  order by m.m_start;
end;
$$;

create or replace function public.get_revenue_breakdown(
  p_company_id uuid,
  p_months integer default 1
)
returns table(
  plan_name text,
  active_subscribers integer,
  monthly_revenue numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and not public.has_role(auth.uid(), 'master'::app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = auth.uid() and cm.company_id = p_company_id
     ) then
    raise exception 'Acesso negado à empresa informada' using errcode = '42501';
  end if;

  return query
  select
    p.name,
    count(distinct e.student_id)::integer,
    (count(distinct e.student_id)::numeric * coalesce(p.price, 0))::numeric
  from public.plans p
  join public.enrollments e on e.plan_id = p.id
  join public.students s on s.id = e.student_id
  where p.company_id = p_company_id
    and s.company_id = p_company_id
    and lower(coalesce(e.status, '')) = 'active'
    and (
      coalesce(p_months, 1) <= 0
      or e.created_at >= now() - make_interval(months => greatest(p_months, 1))
      or e.start_date is null
      or e.start_date <= current_date
    )
  group by p.id, p.name, p.price
  order by (count(distinct e.student_id)::numeric * coalesce(p.price, 0)) desc;
end;
$$;

create or replace function public.get_inadimplencia(p_company_id uuid)
returns table(
  student_id uuid,
  student_name text,
  plan_name text,
  amount numeric,
  due_date date,
  days_overdue integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and not public.has_role(auth.uid(), 'master'::app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = auth.uid() and cm.company_id = p_company_id
     ) then
    raise exception 'Acesso negado à empresa informada' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.full_name,
    p.name,
    coalesce(pay.value, pay.amount, p.price, 0)::numeric,
    pay.due_date,
    greatest(0, current_date - pay.due_date)::integer
  from public.payments pay
  join public.students s on s.id = pay.student_id
  left join public.enrollments e on e.id = pay.enrollment_id
  left join public.plans p on p.id = e.plan_id
  where s.company_id = p_company_id
    and pay.company_id = p_company_id
    and lower(coalesce(pay.status, pay.invoice_status, '')) in ('overdue', 'pending')
    and pay.due_date is not null
    and pay.due_date <= current_date
  order by pay.due_date asc, s.full_name;
end;
$$;

create or replace function public.apply_template_to_student(
  p_template_id uuid,
  p_student_id uuid,
  p_cycle_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.workout_templates%rowtype;
  v_company_id uuid;
  v_student_user_id uuid;
  v_enrollment_id uuid;
  v_cycle_id uuid;
  v_workout_id uuid;
  v_template_workout record;
  v_json_workout jsonb;
  v_exercises jsonb;
begin
  select s.company_id, s.user_id into v_company_id, v_student_user_id
  from public.students s where s.id = p_student_id;
  if v_company_id is null then
    raise exception 'Aluno não encontrado' using errcode = 'P0002';
  end if;
  if auth.role() <> 'service_role'
     and not public.has_role(auth.uid(), 'master'::app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = auth.uid() and cm.company_id = v_company_id
     ) then
    raise exception 'Acesso negado ao aluno informado' using errcode = '42501';
  end if;

  select wt.* into v_template
  from public.workout_templates wt
  where wt.id = p_template_id
    and (wt.company_id is null or wt.company_id = v_company_id);
  if not found then
    raise exception 'Template não encontrado para esta empresa' using errcode = 'P0002';
  end if;

  select e.id into v_enrollment_id
  from public.enrollments e
  where e.student_id = p_student_id
    and lower(coalesce(e.status, '')) in ('active', 'awaiting_training', 'trial')
  order by
    case when lower(coalesce(e.status, '')) = 'active' then 0 else 1 end,
    e.created_at desc
  limit 1;

  insert into public.training_cycles (
    student_id,
    company_id,
    enrollment_id,
    name,
    objective,
    duration_weeks,
    start_date,
    end_date,
    status,
    workouts
  ) values (
    p_student_id,
    v_company_id,
    v_enrollment_id,
    coalesce(p_cycle_name, v_template.name || ' - ' || to_char(current_date, 'DD/MM/YYYY')),
    v_template.goal,
    greatest(coalesce(v_template.weeks_duration, 6), 1),
    current_date,
    current_date + (greatest(coalesce(v_template.weeks_duration, 6), 1) * 7 - 1),
    'active',
    coalesce(v_template.workouts, '[]'::jsonb)
  )
  returning id into v_cycle_id;

  for v_template_workout in
    select tw.*
    from public.template_workouts tw
    where tw.template_id = p_template_id
    order by tw.day_order, tw.created_at
  loop
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'exercise_id', twe.exercise_id,
        'name', el.name,
        'sets', twe.sets,
        'reps', twe.reps,
        'rest_seconds', twe.rest_seconds,
        'notes', twe.notes,
        'order', twe.exercise_order
      ) order by twe.exercise_order
    ), '[]'::jsonb)
    into v_exercises
    from public.template_workout_exercises twe
    left join public.exercise_library el on el.id = twe.exercise_id
    where twe.template_workout_id = v_template_workout.id;

    insert into public.workouts (
      cycle_id, company_id, name, title, description, notes,
      day_of_week, sort_order, exercises, created_by
    ) values (
      v_cycle_id, v_company_id, v_template_workout.name, v_template_workout.name,
      v_template_workout.focus, v_template_workout.notes,
      v_template_workout.day_order, v_template_workout.day_order, v_exercises, auth.uid()
    )
    returning id into v_workout_id;

    insert into public.workout_exercises (
      workout_id, exercise_id, exercise_name, exercise_order,
      sets, reps, rest_seconds, notes
    )
    select
      v_workout_id, twe.exercise_id, el.name, twe.exercise_order,
      twe.sets, twe.reps, twe.rest_seconds, twe.notes
    from public.template_workout_exercises twe
    left join public.exercise_library el on el.id = twe.exercise_id
    where twe.template_workout_id = v_template_workout.id
    order by twe.exercise_order;
  end loop;

  if not exists (select 1 from public.workouts w where w.cycle_id = v_cycle_id)
     and jsonb_typeof(coalesce(v_template.workouts, '[]'::jsonb)) = 'array' then
    for v_json_workout in
      select value from jsonb_array_elements(v_template.workouts)
    loop
      insert into public.workouts (
        cycle_id, company_id, name, title, description,
        day_of_week, sort_order, exercises, created_by
      ) values (
        v_cycle_id,
        v_company_id,
        coalesce(v_json_workout->>'name', v_json_workout->>'title', 'Treino'),
        coalesce(v_json_workout->>'title', v_json_workout->>'name', 'Treino'),
        v_json_workout->>'description',
        nullif(v_json_workout->>'day_of_week', '')::integer,
        coalesce(nullif(v_json_workout->>'sort_order', '')::integer, 0),
        coalesce(v_json_workout->'exercises', '[]'::jsonb),
        auth.uid()
      );
    end loop;
  end if;

  update public.workout_templates
  set uses_count = coalesce(uses_count, 0) + 1,
      updated_at = now()
  where id = p_template_id;

  return v_cycle_id;
end;
$$;

drop function if exists public.get_content_feed(uuid, text, integer, integer);
create function public.get_content_feed(
  p_student_id uuid,
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid,
  title text,
  excerpt text,
  cover_image_url text,
  content_type text,
  category text,
  difficulty text,
  tags text[],
  reading_time_min integer,
  video_duration_min integer,
  is_featured boolean,
  published_at timestamptz,
  views_count integer,
  likes_count integer,
  user_liked boolean,
  user_saved boolean,
  user_viewed boolean
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
  select
    cp.id,
    cp.title,
    cp.excerpt,
    cp.cover_image_url,
    cp.content_type,
    cp.category,
    cp.difficulty,
    coalesce(cp.tags, '{}'::text[]),
    coalesce(cp.reading_time_min, 0),
    coalesce(cp.video_duration_min, 0),
    coalesce(cp.is_featured, false),
    cp.published_at,
    coalesce(cp.views_count, 0),
    coalesce(cp.likes_count, 0),
    exists (
      select 1 from public.content_interactions ci
      where ci.post_id = cp.id and ci.student_id = p_student_id and ci.interaction_type = 'like'
    ),
    exists (
      select 1 from public.content_interactions ci
      where ci.post_id = cp.id and ci.student_id = p_student_id and ci.interaction_type = 'save'
    ),
    exists (
      select 1 from public.content_interactions ci
      where ci.post_id = cp.id and ci.student_id = p_student_id and ci.interaction_type = 'view'
    )
  from public.content_posts cp
  where coalesce(cp.is_published, false)
    and (cp.company_id is null or cp.company_id = v_company_id)
    and (p_category is null or cp.category = p_category)
  order by coalesce(cp.is_featured, false) desc, cp.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

drop function if exists public.get_community_feed(uuid, integer, integer);
create function public.get_community_feed(
  p_student_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid,
  author_student_id uuid,
  author_name text,
  content text,
  image_url text,
  post_type text,
  is_pinned boolean,
  likes_count integer,
  comments_count integer,
  user_liked boolean,
  created_at timestamptz
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
  select
    post.id,
    post.author_student_id,
    author.full_name,
    post.content,
    post.image_url,
    post.post_type,
    coalesce(post.is_pinned, false),
    coalesce(post.likes_count, 0),
    coalesce(post.comments_count, 0),
    exists (
      select 1 from public.community_likes cl
      where cl.post_id = post.id and cl.student_id = p_student_id
    ),
    post.created_at
  from public.community_posts post
  left join public.students author on author.id = post.author_student_id
  where post.company_id = v_company_id
    and not coalesce(post.is_hidden, false)
  order by coalesce(post.is_pinned, false) desc, post.created_at desc
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
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
      coalesce(we_match.exercise_name, el.name, 'Exercício ' || (coalesce(wl.exercise_index, 0) + 1)) as resolved_name,
      wl.weight::numeric as load,
      wl.reps_done as reps,
      wl.created_at,
      round(wl.weight::numeric * (1 + wl.reps_done::numeric / 30), 1) as estimated
    from public.workout_logs wl
    left join lateral (
      select we.exercise_id, we.exercise_name
      from public.workout_exercises we
      where we.workout_id = wl.workout_id
      order by abs(coalesce(we.exercise_order, 0) - coalesce(wl.exercise_index, 0))
      limit 1
    ) we_match on true
    left join public.exercise_library el on el.id = we_match.exercise_id
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
  select
    r.resolved_name,
    r.load,
    r.reps,
    r.estimated,
    r.created_at
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
    and (tc.status = 'active' or tc.status is null)
    and (tc.start_date is null or tc.start_date <= current_date)
    and (tc.end_date is null or tc.end_date >= current_date)
  order by tc.start_date desc nulls last, tc.created_at desc
  limit 1;

  return query
  with actual as (
    select
      mg.name as group_name,
      sum(
        case when coalesce(emt.is_primary, emt.role = 'primary')
          then coalesce(we.sets, 0) else 0 end
      )::numeric as primary_total,
      sum(
        case when not coalesce(emt.is_primary, emt.role = 'primary')
          then coalesce(we.sets, 0) * coalesce(emt.volume_percentage, 0.5)
          else 0 end
      )::numeric as secondary_total
    from public.workouts w
    join public.workout_exercises we on we.workout_id = w.id
    join public.exercise_muscle_targets emt on emt.exercise_id = we.exercise_id
    join public.muscle_groups mg on mg.id = emt.muscle_group_id
    where w.cycle_id = v_cycle_id
    group by mg.name
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

revoke all on function public.get_company_overview(uuid) from anon;
revoke all on function public.get_student_active_challenges(uuid) from anon;
revoke all on function public.get_injury_stats(uuid) from anon;
revoke all on function public.get_load_progression(uuid, integer) from anon;
revoke all on function public.get_monthly_volume(uuid, integer) from anon;
revoke all on function public.get_monthly_growth(uuid, integer) from anon;
revoke all on function public.get_revenue_breakdown(uuid, integer) from anon;
revoke all on function public.get_inadimplencia(uuid) from anon;
revoke all on function public.apply_template_to_student(uuid, uuid, text) from anon;
revoke all on function public.get_content_feed(uuid, text, integer, integer) from anon;
revoke all on function public.get_community_feed(uuid, integer, integer) from anon;
revoke all on function public.get_personal_records(uuid) from anon;
revoke all on function public.get_weekly_volume(uuid) from anon;

grant execute on function public.generate_referral_code(text) to authenticated, service_role;
grant execute on function public.get_company_overview(uuid) to authenticated, service_role;
grant execute on function public.get_student_active_challenges(uuid) to authenticated, service_role;
grant execute on function public.get_injury_stats(uuid) to authenticated, service_role;
grant execute on function public.get_load_progression(uuid, integer) to authenticated, service_role;
grant execute on function public.get_monthly_volume(uuid, integer) to authenticated, service_role;
grant execute on function public.get_monthly_growth(uuid, integer) to authenticated, service_role;
grant execute on function public.get_revenue_breakdown(uuid, integer) to authenticated, service_role;
grant execute on function public.get_inadimplencia(uuid) to authenticated, service_role;
grant execute on function public.apply_template_to_student(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.get_content_feed(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.get_community_feed(uuid, integer, integer) to authenticated, service_role;
grant execute on function public.get_personal_records(uuid) to authenticated, service_role;
grant execute on function public.get_weekly_volume(uuid) to authenticated, service_role;
