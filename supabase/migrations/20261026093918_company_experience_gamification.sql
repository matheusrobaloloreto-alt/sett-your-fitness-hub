-- Policies affect future events only. Existing XP, awards and rankings are never rewritten.
create function public.company_experience_settings(_company_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select (public.company_product_settings_defaults() -> 'experience')
    || coalesce((select settings -> 'experience' from public.company_product_settings where company_id = _company_id), '{}');
$$;
revoke all on function public.company_experience_settings(uuid) from public, anon, authenticated;

-- Students need their own authorized projection: they are not necessarily company_members.
create function public.get_student_experience_policy(_student_id uuid default null,_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_company uuid := _company_id; v_user uuid;
  v_internal boolean := coalesce(auth.jwt()->>'role','') = 'service_role'
    or (session_user in ('postgres','supabase_admin') and current_setting('role',true) in ('none','postgres','supabase_admin'));
begin
  if auth.uid() is null and not v_internal then raise exception 'Authentication required' using errcode = '42501'; end if;
  if _student_id is not null then
    select company_id,user_id into v_company,v_user from public.students where id = _student_id;
    if _company_id is not null and _company_id is distinct from v_company then
      raise exception 'Student company mismatch' using errcode = '42501';
    end if;
    if v_company is null or (not v_internal and v_user is distinct from auth.uid() and not public.is_company_staff(auth.uid(),v_company)) then
      raise exception 'Student access denied' using errcode = '42501';
    end if;
  end if;
  if v_company is null or (not v_internal and not (public.is_company_staff(auth.uid(),v_company)
    or exists(select 1 from public.students where user_id = auth.uid() and company_id = v_company))) then
    raise exception 'Company access denied' using errcode = '42501';
  end if;
  return public.company_experience_settings(v_company);
end;
$$;
revoke all on function public.get_student_experience_policy(uuid,uuid) from public,anon;
grant execute on function public.get_student_experience_policy(uuid,uuid) to authenticated,service_role;

create function public.get_student_achievement_catalog(_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_company uuid;
begin
  perform public.get_student_experience_policy(_student_id,null);
  select company_id into v_company from public.students where id = _student_id;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.criteria_value,a.id) from public.achievements a
    where (a.company_id is null or a.company_id = v_company) and (a.is_active or exists(
      select 1 from public.student_achievements sa where sa.achievement_id = a.id and sa.student_id = _student_id and sa.company_id = v_company))), '[]');
end;
$$;
revoke all on function public.get_student_achievement_catalog(uuid) from public,anon;
grant execute on function public.get_student_achievement_catalog(uuid) to authenticated;

create or replace function public.get_student_rank(_student_id uuid)
returns table(rank_position bigint,total_students bigint,xp bigint)
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_company uuid; v_policy jsonb;
begin
  v_policy := public.get_student_experience_policy(_student_id,null);
  if not (v_policy->>'gamification_enabled')::boolean then return; end if;
  select company_id into v_company from public.students where id = _student_id;
  return query with totals as (
    select s.id,coalesce(sum(x.xp_amount),0)::bigint as total from public.students s
      left join public.xp_events x on x.student_id = s.id and x.company_id = s.company_id
      where s.company_id = v_company group by s.id
  ) select (select count(*)+1 from totals where total > own.total)::bigint,
    (select count(*) from totals)::bigint,own.total from totals own where own.id = _student_id;
end;
$$;
revoke all on function public.get_student_rank(uuid) from public,anon;
grant execute on function public.get_student_rank(uuid) to authenticated,service_role;

create or replace function public.get_monthly_leaderboard(_company_id uuid,_month date default current_date)
returns table(top3 jsonb,caller jsonb) language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_policy jsonb; v_month date := date_trunc('month',coalesce(_month,current_date))::date;
begin
  v_policy := public.get_student_experience_policy(null,_company_id);
  if not (v_policy->>'gamification_enabled')::boolean then
    return query select '[]'::jsonb,jsonb_build_object('rank',null,'xp',0,'total_participantes',0); return;
  end if;
  return query with totals as (
    select s.id,s.user_id,s.full_name,coalesce(sum(x.xp_amount) filter(where x.created_at >= v_month and x.created_at < v_month+interval '1 month'),0)::bigint as xp
    from public.students s left join public.xp_events x on x.student_id=s.id and x.company_id=s.company_id
    where s.company_id=_company_id and coalesce(s.status,'') <> 'inactive' group by s.id,s.user_id,s.full_name
  ), ranked as (select *,dense_rank() over(order by xp desc,full_name,id)::integer as rank from totals)
  select coalesce((select jsonb_agg(jsonb_build_object('display_name',public.private_display_name(r.full_name),'xp',r.xp,'rank',r.rank) order by r.rank)
    from (select * from ranked order by rank limit 3) r),'[]'::jsonb),
    coalesce((select jsonb_build_object('rank',r.rank,'xp',r.xp,'total_participantes',(select count(*) from ranked)) from ranked r where user_id=auth.uid() order by id limit 1),
      jsonb_build_object('rank',null,'xp',0,'total_participantes',(select count(*) from ranked)));
end;
$$;
revoke all on function public.get_monthly_leaderboard(uuid,date) from public,anon;
grant execute on function public.get_monthly_leaderboard(uuid,date) to authenticated,service_role;

alter table public.xp_events add column if not exists policy_version integer;
alter table public.xp_events add column if not exists policy_snapshot jsonb;
-- Browser roles cannot bypass the validated RPC, even if an old permissive policy remains.
revoke insert, update, delete, truncate on public.xp_events, public.student_achievements from public, authenticated, anon;
revoke insert, update, delete, truncate on public.achievements from public, authenticated, anon;

create or replace function public.award_xp(
  _student_id uuid, _event_type text, _xp_amount integer,
  _source_id uuid default null, _notes text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_company uuid;
  v_user uuid;
  v_policy jsonb;
  v_version integer;
  v_amount integer;
  v_id uuid;
  v_internal boolean := coalesce(auth.jwt()->>'role','') = 'service_role'
    or (session_user in ('postgres','supabase_admin') and current_setting('role',true) in ('none','postgres','supabase_admin'));
  v_week date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date - 7;
  v_days integer;
  v_goal integer;
  v_configured boolean;
begin
  select company_id, user_id, greatest(1,least(7,coalesce(weekly_workout_goal,3)))
    into v_company,v_user,v_goal from public.students where id = _student_id;
  if v_company is null or (not v_internal and (auth.uid() is null or
    (auth.uid() is distinct from v_user and not public.is_company_staff(auth.uid(), v_company)))) then
    raise exception 'Student access denied' using errcode = '42501';
  end if;
  if _source_id is null then raise exception 'XP source required' using errcode = '22023'; end if;
  v_policy := public.company_experience_settings(v_company);
  select version, settings #> '{experience,weekly_consistency_xp}' is not null
    into v_version,v_configured from public.company_product_settings where company_id = v_company;
  -- _xp_amount is retained only for legacy RPC callers. It never determines the award.
  if _event_type = 'workout' then
    if not exists(select 1 from public.workout_sessions where id = _source_id and student_id = _student_id and company_id = v_company and status = 'completed') then
      raise exception 'Completed workout source required' using errcode = '42501';
    end if;
    v_amount := (v_policy ->> 'xp_workout')::integer;
  elsif _event_type = 'external_activity' then
    if not exists(select 1 from public.external_activities where id = _source_id and student_id = _student_id and company_id = v_company) then
      raise exception 'Activity source mismatch' using errcode = '42501';
    end if;
    v_amount := (v_policy ->> 'xp_external_activity')::integer;
  elsif _event_type = 'achievement' then
    select a.xp_reward into v_amount from public.achievements a
      join public.student_achievements sa on sa.achievement_id = a.id and sa.student_id = _student_id and sa.company_id = v_company
      where a.id = _source_id and (a.company_id is null or a.company_id = v_company)
        and a.criteria_type in ('workouts_total','external_total','cycles_completed');
    if v_amount is null then raise exception 'Earned achievement required' using errcode = '42501'; end if;
  elsif _event_type = 'weekly_consistency' and v_internal then
    if _source_id <> public.weekly_consistency_source_id(_student_id,v_week) then
      raise exception 'Only the last closed week can receive new consistency XP' using errcode = '22023';
    end if;
    select count(distinct coalesce(session_date,(completed_at at time zone 'America/Sao_Paulo')::date,(started_at at time zone 'America/Sao_Paulo')::date))::int
      into v_days from public.workout_sessions where student_id = _student_id and company_id = v_company and status = 'completed'
        and coalesce(session_date,(completed_at at time zone 'America/Sao_Paulo')::date,(started_at at time zone 'America/Sao_Paulo')::date) >= v_week
        and coalesce(session_date,(completed_at at time zone 'America/Sao_Paulo')::date,(started_at at time zone 'America/Sao_Paulo')::date) < v_week + 7;
    if v_days < v_goal then return null; end if;
    if coalesce(v_configured,false) then
      v_amount := (v_policy ->> 'weekly_consistency_xp')::int;
    else
      -- Keep legacy company/global base+extra scoring until the new policy is explicitly saved.
      select greatest(0,coalesce(c.weekly_goal_met_xp,g.weekly_goal_met_xp,40))
        + greatest(0,v_days-v_goal)*greatest(0,coalesce(c.weekly_extra_day_xp,g.weekly_extra_day_xp,10)) into v_amount
      from (select 1) singleton
      left join public.xp_settings c on c.company_id = v_company and c.is_active
      left join public.xp_settings g on g.company_id is null and g.is_active;
    end if;
  else raise exception 'Unsupported XP event' using errcode = '42501';
  end if;
  if not (v_policy ->> 'gamification_enabled')::boolean or v_amount = 0 then return null; end if;
  if v_amount < 0 or v_amount > 10000 then raise exception 'Invalid server XP policy' using errcode = '22023'; end if;
  insert into public.xp_events(student_id,company_id,event_type,xp_amount,source_id,notes,policy_version,policy_snapshot)
    values(_student_id,v_company,_event_type,v_amount,_source_id,left(_notes,500),v_version,v_policy)
    on conflict do nothing returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.award_xp(uuid,text,integer,uuid,text) from public,anon;
grant execute on function public.award_xp(uuid,text,integer,uuid,text) to authenticated,service_role;

create function public.award_company_xp(_student_id uuid,_event_type text,_source_id uuid)
returns uuid language plpgsql security invoker set search_path = public,pg_temp as $$
begin
  if _event_type not in ('workout','external_activity') then
    raise exception 'Unsupported student XP event' using errcode = '22023';
  end if;
  return public.award_xp(_student_id,_event_type,0,_source_id,null);
end;
$$;
revoke all on function public.award_company_xp(uuid,text,uuid) from public,anon;
grant execute on function public.award_company_xp(uuid,text,uuid) to authenticated,service_role;

create or replace function public.award_weekly_consistency(_week_start date default (date_trunc('week', now() at time zone 'America/Sao_Paulo')::date - 7))
returns table(student_id uuid,company_id uuid,week_start date,trained_days integer,weekly_goal integer,xp_awarded integer,xp_event_id uuid)
language plpgsql security definer set search_path = public,pg_temp as $$
declare
  v_week date := date_trunc('week',now() at time zone 'America/Sao_Paulo')::date - 7;
  r record;
  v_id uuid;
begin
  if not (coalesce(auth.jwt()->>'role','') = 'service_role' or
    (session_user in ('postgres','supabase_admin') and current_setting('role',true) in ('none','postgres','supabase_admin'))) then
    raise exception 'Backend job only' using errcode = '42501';
  end if;
  if date_trunc('week',coalesce(_week_start,v_week))::date <> v_week then
    raise exception 'Only the last closed week can receive new consistency XP' using errcode = '22023';
  end if;
  for r in
    select s.id,s.company_id,greatest(1,least(7,coalesce(s.weekly_workout_goal,3)))::int as goal,
      count(distinct coalesce(w.session_date,(w.completed_at at time zone 'America/Sao_Paulo')::date,(w.started_at at time zone 'America/Sao_Paulo')::date))::int as days
    from public.students s join public.workout_sessions w on w.student_id = s.id and w.company_id = s.company_id
    where s.status <> 'inactive' and w.status = 'completed'
      and coalesce(w.session_date,(w.completed_at at time zone 'America/Sao_Paulo')::date,(w.started_at at time zone 'America/Sao_Paulo')::date) >= v_week
      and coalesce(w.session_date,(w.completed_at at time zone 'America/Sao_Paulo')::date,(w.started_at at time zone 'America/Sao_Paulo')::date) < v_week+7
    group by s.id,s.company_id,s.weekly_workout_goal
  loop
    if r.days < r.goal then continue; end if;
    v_id := public.award_xp(r.id,'weekly_consistency',0,public.weekly_consistency_source_id(r.id,v_week),null);
    if v_id is not null then
      student_id := r.id; company_id := r.company_id; week_start := v_week; trained_days := r.days; weekly_goal := r.goal;
      select xp_amount into xp_awarded from public.xp_events where id = v_id;
      xp_event_id := v_id; return next;
    end if;
  end loop;
end;
$$;
-- Existing pg_cron owner can execute. Browser roles retain no execution privilege.
revoke all on function public.award_weekly_consistency(date) from public,anon,authenticated;
grant execute on function public.award_weekly_consistency(date) to service_role;

create or replace function public.check_and_unlock_achievements(_student_id uuid)
returns integer language plpgsql security definer set search_path = public,pg_temp as $$
declare
  v_company uuid; v_user uuid; v_workouts int; v_external int; v_cycles int;
  v_id uuid; v_count int := 0; a record;
  v_internal boolean := coalesce(auth.jwt()->>'role','') = 'service_role'
    or (session_user in ('postgres','supabase_admin') and current_setting('role',true) in ('none','postgres','supabase_admin'));
begin
  select company_id,user_id into v_company,v_user from public.students where id = _student_id;
  if v_company is null or (not v_internal and (auth.uid() is null or
    (auth.uid() is distinct from v_user and not public.is_company_staff(auth.uid(),v_company)))) then
    raise exception 'Student access denied' using errcode = '42501';
  end if;
  if not (public.company_experience_settings(v_company)->>'gamification_enabled')::boolean then return 0; end if;
  select count(*) into v_workouts from public.workout_sessions where student_id = _student_id and company_id = v_company and status = 'completed';
  select count(*) into v_external from public.external_activities where student_id = _student_id and company_id = v_company;
  select count(*) into v_cycles from public.training_cycles tc join public.enrollments e on e.id = tc.enrollment_id and e.company_id = tc.company_id
    where e.student_id = _student_id and tc.company_id = v_company and tc.status = 'completed';
  for a in select * from public.achievements where is_active and (company_id is null or company_id = v_company)
    and criteria_type in ('workouts_total','external_total','cycles_completed')
  loop
    if (a.criteria_type = 'workouts_total' and v_workouts >= a.criteria_value)
      or (a.criteria_type = 'external_total' and v_external >= a.criteria_value)
      or (a.criteria_type = 'cycles_completed' and v_cycles >= a.criteria_value) then
      insert into public.student_achievements(student_id,company_id,achievement_id) values(_student_id,v_company,a.id)
        on conflict do nothing returning id into v_id;
      if v_id is not null then
        perform public.award_xp(_student_id,'achievement',0,a.id,a.title);
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.check_and_unlock_achievements(uuid) from public,anon;
grant execute on function public.check_and_unlock_achievements(uuid) to authenticated,service_role;

create table public.company_achievement_history(
  id bigint generated always as identity primary key, company_id uuid not null references public.companies(id),
  achievement_id uuid not null, definition jsonb not null, changed_by uuid not null, changed_at timestamptz not null default now()
);
alter table public.company_achievement_history enable row level security;
revoke all on public.company_achievement_history from public,anon,authenticated;
grant select on public.company_achievement_history to authenticated;
create policy company_achievement_history_read on public.company_achievement_history for select to authenticated using (
  public.has_role(auth.uid(),'master'::public.app_role) or (public.has_role(auth.uid(),'admin'::public.app_role) and exists(
    select 1 from public.company_members cm where cm.user_id = auth.uid() and cm.company_id = company_achievement_history.company_id))
);

create function public.save_company_achievement(_company_id uuid,_definition jsonb,_achievement_id uuid default null,_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare v_row public.achievements; v_key text;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'master'::public.app_role) or
    (public.has_role(auth.uid(),'admin'::public.app_role) and exists(select 1 from public.company_members where user_id = auth.uid() and company_id = _company_id))) then
    raise exception 'Achievement configuration access denied' using errcode = '42501';
  end if;
  if _company_id is null or _definition is null or jsonb_typeof(_definition) <> 'object' then
    raise exception 'Invalid achievement object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(_definition) loop
    if v_key not in ('code','title','description','criteria_type','criteria_value','xp_reward','is_active') then
      raise exception 'Unknown achievement field' using errcode = '22023';
    end if;
  end loop;
  if not (_definition ?& array['code','title','description','criteria_type','criteria_value','xp_reward','is_active'])
    or jsonb_typeof(_definition->'code') <> 'string' or (_definition->>'code') !~ '^[a-z][a-z0-9_]{1,63}$'
    or jsonb_typeof(_definition->'title') <> 'string' or length(trim(_definition->>'title')) not between 1 and 120
    or jsonb_typeof(_definition->'description') <> 'string' or length(_definition->>'description') > 1000
    or jsonb_typeof(_definition->'criteria_type') <> 'string' or (_definition->>'criteria_type') not in ('workouts_total','external_total','cycles_completed')
    or jsonb_typeof(_definition->'criteria_value') <> 'number' or jsonb_typeof(_definition->'xp_reward') <> 'number'
    or jsonb_typeof(_definition->'is_active') <> 'boolean' then
    raise exception 'Invalid achievement fields or criteria' using errcode = '22023';
  end if;
  if (_definition->>'criteria_value')::numeric <> trunc((_definition->>'criteria_value')::numeric)
    or (_definition->>'criteria_value')::numeric not between 1 and 10000
    or (_definition->>'xp_reward')::numeric <> trunc((_definition->>'xp_reward')::numeric)
    or (_definition->>'xp_reward')::numeric not between 0 and 10000 then
    raise exception 'Invalid achievement goal or reward' using errcode = '22023';
  end if;
  if _achievement_id is not null then
    select * into v_row from public.achievements where id = _achievement_id and company_id = _company_id for update;
    if not found then raise exception 'Achievement tenant mismatch' using errcode = '42501'; end if;
    if v_row.code is distinct from _definition->>'code' then raise exception 'Achievement code is immutable' using errcode = '22023'; end if;
    if v_row.updated_at is distinct from _expected_updated_at then raise exception 'Achievement version conflict' using errcode = 'PT409'; end if;
    update public.achievements set title = trim(_definition->>'title'), description = _definition->>'description',
      criteria_type = _definition->>'criteria_type', criteria_value = (_definition->>'criteria_value')::int,
      xp_reward = (_definition->>'xp_reward')::int, is_active = (_definition->>'is_active')::boolean,
      updated_at = clock_timestamp() where id = _achievement_id returning * into v_row;
  else
    insert into public.achievements(company_id,code,title,description,criteria_type,criteria_value,xp_reward,is_active)
      values(_company_id,_definition->>'code',trim(_definition->>'title'),_definition->>'description',_definition->>'criteria_type',
        (_definition->>'criteria_value')::int,(_definition->>'xp_reward')::int,(_definition->>'is_active')::boolean) returning * into v_row;
  end if;
  insert into public.company_achievement_history(company_id,achievement_id,definition,changed_by)
    values(_company_id,v_row.id,to_jsonb(v_row),auth.uid());
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.save_company_achievement(uuid,jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.save_company_achievement(uuid,jsonb,uuid,timestamptz) to authenticated;

-- Retain the existing dashboard's audited tenant joins; only substitute policy constants.
do $migration$
declare v_sql text; v_old text;
begin
  if to_regprocedure('public.get_company_dashboard_snapshot(uuid)') is null then return; end if;
  select pg_get_functiondef('public.get_company_dashboard_snapshot(uuid)'::regprocedure) into v_old;
  v_sql := replace(v_old,'_result jsonb;', '_result jsonb; _experience jsonb := public.company_experience_settings(_company_id);');
  v_sql := replace(v_sql,'r.training_days >= 10', 'r.training_days >= (_experience->>''risk_no_workout_days'')::int');
  v_sql := replace(v_sql,'r.training_days>=10', 'r.training_days>=(_experience->>''risk_no_workout_days'')::int');
  v_sql := replace(v_sql,'_today+7', '_today+(_experience->>''renewal_notice_days'')::int');
  v_sql := replace(v_sql,'_today+30', '_today+(_experience->>''renewal_notice_days'')::int');
  v_sql := replace(v_sql,'days_left between 0 and 7', 'days_left between 0 and (_experience->>''renewal_notice_days'')::int');
  v_sql := replace(v_sql,'r.cycle_days<=7', 'r.cycle_days<=(_experience->>''renewal_notice_days'')::int');
  v_sql := replace(v_sql,'''risco'' else ''ativo'' end as status', '''risco'' when r.cycle_days <= (_experience->>''renewal_notice_days'')::int then ''renovacao'' else ''ativo'' end as status');
  if v_sql = v_old or position('_experience jsonb' in v_sql) = 0 then
    raise exception 'Dashboard definition changed; manual experience integration required';
  end if;
  execute v_sql;
end;
$migration$;
