-- EMPTY disposable LOCAL database only. Synthetic dependency model; not a full schema replay.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
grant usage on schema auth to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role',coalesce(nullif(current_setting('test.jwt_role',true),''),'authenticated')) $$;
create type public.app_role as enum ('admin','master','trainer','coordinator','student');
create table public.companies(id uuid primary key);
create table public.company_members(company_id uuid,user_id uuid);
create table public.user_roles(user_id uuid,role public.app_role);
create function public.has_role(_user_id uuid,_role public.app_role) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create function public.is_company_staff(_user_id uuid,_company_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.has_role(_user_id,'master') or exists(select 1 from public.company_members cm join public.user_roles ur on ur.user_id=cm.user_id where cm.user_id=_user_id and cm.company_id=_company_id and ur.role in ('admin','trainer','coordinator')) $$;
create table public.students(id uuid primary key,company_id uuid,user_id uuid,weekly_workout_goal int default 3,status text default 'active',full_name text default 'Synthetic Student');
create function public.private_display_name(_name text) returns text language sql immutable as $$ select split_part(_name,' ',1) || ' S.' $$;
create table public.workout_sessions(id uuid primary key,student_id uuid,company_id uuid,status text,session_date date,completed_at timestamptz,started_at timestamptz);
create table public.external_activities(id uuid primary key,student_id uuid,company_id uuid);
create table public.enrollments(id uuid primary key,student_id uuid,company_id uuid);
create table public.training_cycles(id uuid primary key,enrollment_id uuid,company_id uuid,status text);
create table public.xp_events(id uuid primary key default gen_random_uuid(),student_id uuid,company_id uuid,event_type text,xp_amount int,source_id uuid,notes text,created_at timestamptz default now(),unique(student_id,event_type,source_id));
create table public.achievements(id uuid primary key default gen_random_uuid(),company_id uuid,code text,title text,description text,criteria_type text,criteria_value int,xp_reward int,is_active boolean,updated_at timestamptz default now(),unique(company_id,code));
create table public.student_achievements(id uuid primary key default gen_random_uuid(),student_id uuid,company_id uuid,achievement_id uuid,earned_at timestamptz default now(),unique(student_id,achievement_id));
create table public.xp_settings(company_id uuid,weekly_goal_met_xp int,weekly_extra_day_xp int,is_active boolean);
insert into public.xp_settings values(null,40,10,true);
create function public.weekly_consistency_source_id(uuid,date) returns uuid language sql immutable as $$ select md5($1::text || ':weekly_consistency:' || $2::text)::uuid $$;
grant select on public.company_members,public.user_roles,public.students,public.xp_events,public.student_achievements,public.achievements to authenticated;
\ir ../migrations/20261026092601_company_product_settings.sql
\ir ../migrations/20261026093918_company_experience_gamification.sql

create function pg_temp.expect_error(statement text,code text) returns void language plpgsql as $$
declare actual text; begin
  begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
  if actual is distinct from code then raise exception 'Expected %, received %: %',code,actual,statement; end if;
end $$;
insert into public.companies values('00000000-0000-0000-0000-000000000010'),('00000000-0000-0000-0000-000000000020');
insert into public.company_members values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001');
insert into public.user_roles values('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','student');
insert into public.students(id,company_id,user_id,weekly_workout_goal,status) values
 ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002',1,'active'),
 ('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000003',1,'active');
insert into public.workout_sessions values
 ('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','completed',current_date,now(),now()),
 ('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','active',current_date,null,now()),
 ('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000020','completed',current_date,now(),now());
insert into public.external_activities values('00000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010');
insert into public.external_activities values('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010');
-- A preexisting award deliberately uses a historical nondefault value; it must never change.
insert into public.xp_events(student_id,company_id,event_type,xp_amount,source_id,notes,created_at)
 values('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','workout',17,'00000000-0000-0000-0000-000000000070','legacy immutable',now()-interval '1 year');

set local role authenticated;
set local test.uid='00000000-0000-0000-0000-000000000001';
select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{"experience":{"xp_workout":75,"xp_external_activity":45,"weekly_consistency_xp":120}}',0);
select public.save_company_achievement('00000000-0000-0000-0000-000000000010','{"code":"first_workout","title":"Primeiro treino","description":"Synthetic","criteria_type":"workouts_total","criteria_value":1,"xp_reward":20,"is_active":true}');
select pg_temp.expect_error($q$select public.save_company_achievement('00000000-0000-0000-0000-000000000020','{"code":"bad","title":"Bad","description":"","criteria_type":"sql","criteria_value":1,"xp_reward":20,"is_active":true}')$q$,'42501');
select pg_temp.expect_error($q$select public.save_company_achievement('00000000-0000-0000-0000-000000000010','{"code":"bad","title":"Bad","description":"","criteria_type":"sql","criteria_value":1,"xp_reward":20,"is_active":true}')$q$,'22023');
set local test.uid='00000000-0000-0000-0000-000000000002';
do $$ begin
 assert (public.get_student_experience_policy('00000000-0000-0000-0000-000000000030',null)->>'xp_workout')::int=75;
end $$;
select pg_temp.expect_error($q$select public.get_student_experience_policy('00000000-0000-0000-0000-000000000040',null)$q$,'42501');
select public.award_company_xp('00000000-0000-0000-0000-000000000030','workout','00000000-0000-0000-0000-000000000050');
select public.award_xp('00000000-0000-0000-0000-000000000030','external_activity',999999,'00000000-0000-0000-0000-000000000060');
select public.check_and_unlock_achievements('00000000-0000-0000-0000-000000000030');
select pg_temp.expect_error($q$select public.award_company_xp('00000000-0000-0000-0000-000000000030','workout','00000000-0000-0000-0000-000000000051')$q$,'42501');
select pg_temp.expect_error($q$select public.award_company_xp('00000000-0000-0000-0000-000000000040','workout','00000000-0000-0000-0000-000000000052')$q$,'42501');
select pg_temp.expect_error($q$select public.award_company_xp('00000000-0000-0000-0000-000000000030','workout','00000000-0000-0000-0000-000000000052')$q$,'42501');
select pg_temp.expect_error($q$update public.xp_events set xp_amount=999999$q$,'42501');
select pg_temp.expect_error($q$delete from public.student_achievements$q$,'42501');
select pg_temp.expect_error($q$select * from public.award_weekly_consistency()$q$,'42501');
do $$ begin
 assert (select xp_amount=75 and policy_version=1 from public.xp_events where source_id='00000000-0000-0000-0000-000000000050');
 assert (select xp_amount=45 from public.xp_events where source_id='00000000-0000-0000-0000-000000000060');
 assert (select count(*)=1 from public.student_achievements);
end $$;
-- A settings edit cannot reprice the same source or rewrite legacy history.
set local test.uid='00000000-0000-0000-0000-000000000001';
select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{"experience":{"xp_workout":90,"weekly_consistency_xp":120}}',1);
select public.award_xp('00000000-0000-0000-0000-000000000030','workout',9999,'00000000-0000-0000-0000-000000000050');
select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{"experience":{"gamification_enabled":false}}',2);
select public.award_company_xp('00000000-0000-0000-0000-000000000030','external_activity','00000000-0000-0000-0000-000000000061');
select public.check_and_unlock_achievements('00000000-0000-0000-0000-000000000030');
do $$ declare a public.achievements; definition jsonb; begin
 assert (select count(*)=0 from public.get_student_rank('00000000-0000-0000-0000-000000000030'));
 assert (select top3='[]'::jsonb from public.get_monthly_leaderboard('00000000-0000-0000-0000-000000000010'));
 select * into a from public.achievements where code='first_workout';
 definition := jsonb_build_object('code',a.code,'title',a.title,'description',a.description,'criteria_type',a.criteria_type,'criteria_value',a.criteria_value,'xp_reward',500,'is_active',false);
 perform public.save_company_achievement(a.company_id,definition,a.id,a.updated_at);
 perform pg_temp.expect_error(format('select public.save_company_achievement(%L,%L::jsonb,%L,%L::timestamptz)',a.company_id,definition,a.id,a.updated_at),'PT409');
 assert (select count(*)=2 from public.company_achievement_history);
 assert jsonb_array_length(public.get_student_achievement_catalog('00000000-0000-0000-0000-000000000030'))=1;
end $$;
reset role;
do $$ begin
 assert (select xp_amount=75 from public.xp_events where source_id='00000000-0000-0000-0000-000000000050');
 assert (select xp_amount=17 and notes='legacy immutable' and policy_snapshot is null from public.xp_events where source_id='00000000-0000-0000-0000-000000000070');
 assert (select count(*)=1 from public.student_achievements);
 assert (select count(*)=0 from public.xp_events where source_id='00000000-0000-0000-0000-000000000061');
 assert (select xp_amount=20 from public.xp_events where event_type='achievement');
end $$;
-- The backend awards the configured closed week; another company keeps legacy base+extra.
update public.company_product_settings set settings=jsonb_set(settings,'{experience,gamification_enabled}','true');
update public.company_product_settings set settings=jsonb_set(settings,'{experience,weekly_consistency_xp}','120');
insert into public.workout_sessions(id,student_id,company_id,status,session_date,completed_at,started_at)
 select gen_random_uuid(),id,company_id,'completed',date_trunc('week',now() at time zone 'America/Sao_Paulo')::date-7,now()-interval '7 days',now()-interval '7 days' from public.students;
select * from public.award_weekly_consistency();
select * from public.award_weekly_consistency();
do $$ begin
 assert (select xp_amount=120 from public.xp_events where student_id='00000000-0000-0000-0000-000000000030' and event_type='weekly_consistency');
 assert (select xp_amount=40 from public.xp_events where student_id='00000000-0000-0000-0000-000000000040' and event_type='weekly_consistency');
 assert (select count(*)=2 from public.xp_events where event_type='weekly_consistency');
end $$;
rollback;
\echo 'Company experience SQL fixture passed; synthetic state rolled back.'
