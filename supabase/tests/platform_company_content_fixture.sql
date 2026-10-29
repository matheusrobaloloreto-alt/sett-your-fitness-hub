-- EMPTY disposable LOCAL database only. Synthetic dependency model; not a full schema replay.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key);
grant usage on schema auth to authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role',coalesce(nullif(current_setting('test.jwt_role',true),''),'authenticated')) $$;
create type public.app_role as enum ('admin','master','trainer','coordinator','student');
create table public.companies(id uuid primary key,is_active boolean default true);
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


create table public.content_test_features(company_id uuid primary key,enabled boolean not null);
create function public.company_feature_allowed(_company_id uuid,_feature text) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and _feature='hasAppearance' and coalesce((select enabled from public.content_test_features where company_id=_company_id),false) $$;
\ir ../migrations/20261028123147_governed_platform_company_content.sql
begin;
create function pg_temp.expect_error(statement text,code text) returns void language plpgsql as $$
declare actual text; begin
 begin execute statement; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 if actual is distinct from code then raise exception 'Expected %, got %: %',code,actual,statement; end if;
end $$;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into public.companies(id) values('00000000-0000-0000-0000-000000000010'),('00000000-0000-0000-0000-000000000020');
insert into public.company_members values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000004');
insert into public.user_roles values('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','student'),('00000000-0000-0000-0000-000000000003','master'),('00000000-0000-0000-0000-000000000004','admin');
insert into public.content_test_features values('00000000-0000-0000-0000-000000000010',true),('00000000-0000-0000-0000-000000000020',true);
insert into public.students(id,company_id,user_id) values('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002');
insert into public.workout_sessions(id,student_id,company_id,status,session_date) values('00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','completed',current_date);
insert into public.xp_events(student_id,company_id,event_type,xp_amount,source_id,notes) values('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','legacy',17,'00000000-0000-0000-0000-000000000070','untouched');
set role authenticated;
set local test.uid='00000000-0000-0000-0000-000000000003';
do $$ declare d jsonb; begin
 d:=public.get_platform_content_editor()->'document';
 d:=jsonb_set(d,'{cms,hero_title}','"CMS synthetic"');
 d:=jsonb_set(d,'{experience,xp_workout}','77');
 perform public.save_platform_content(d,0,false);
 assert public.get_public_platform_content() is null,'Draft leak';
 perform pg_temp.expect_error(format('select public.save_platform_content(%L,0,false)',d),'PT409');
 perform pg_temp.expect_error(format('select public.save_platform_content(%L,1,false)',jsonb_set(d,'{cms,support_url}','"javascript:alert(1)"')),'22023');
 perform public.save_platform_content(d,1,true);
 assert public.get_public_platform_content()->>'hero_title'='CMS synthetic','Public consumer mismatch';
 -- Later draft must not replace the published version.
 perform public.save_platform_content(jsonb_set(d,'{cms,hero_title}','"Unpublished"'),2,false);
 assert public.get_public_platform_content()->>'hero_title'='CMS synthetic';
 perform pg_temp.expect_error('select public.get_company_content(''00000000-0000-0000-0000-000000000010'')','42501');
end $$;
set local test.uid='00000000-0000-0000-0000-000000000002';
select pg_temp.expect_error('select public.get_platform_content_editor()','42501');
select pg_temp.expect_error('select public.get_company_content(''00000000-0000-0000-0000-000000000010'')','42501');
set local test.uid='00000000-0000-0000-0000-000000000004';
select pg_temp.expect_error('select public.get_company_content(''00000000-0000-0000-0000-000000000010'')','42501');
set local test.uid='00000000-0000-0000-0000-000000000001';
do $$ declare d jsonb; saved jsonb; begin
 d:=public.get_company_content('00000000-0000-0000-0000-000000000010')->'document';
 d:=jsonb_set(d,'{brand,name}','"Company A synthetic"');
 perform public.save_company_content('00000000-0000-0000-0000-000000000010',d,0);
 assert public.get_company_content('00000000-0000-0000-0000-000000000010')#>>'{document,brand,name}'='Company A synthetic';
 perform pg_temp.expect_error(format('select public.save_company_content(''00000000-0000-0000-0000-000000000010'',%L,0)',d),'PT409');
 perform pg_temp.expect_error(format('select public.save_company_content(''00000000-0000-0000-0000-000000000020'',%L,0)',d),'42501');
 perform public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{"brand":{"company_name":"Keep this company"},"prescription":{"beginner_max_weekly_sets":14}}',0);
 perform pg_temp.expect_error('select public.adopt_platform_experience_defaults(''00000000-0000-0000-0000-000000000010'',2,1,false)','22023');
 perform pg_temp.expect_error('select public.adopt_platform_experience_defaults(''00000000-0000-0000-0000-000000000010'',3,1,true)','PT409');
 perform public.adopt_platform_experience_defaults('00000000-0000-0000-0000-000000000010',2,1,true);
 assert public.get_student_experience_policy('00000000-0000-0000-0000-000000000030',null)->>'xp_workout'='77','Adopted XP not consumed';
 assert (select settings#>>'{brand,company_name}'='Keep this company' and settings#>>'{prescription,beginner_max_weekly_sets}'='14' from public.company_product_settings where company_id='00000000-0000-0000-0000-000000000010'),'Other settings changed';
 assert public.check_and_unlock_achievements('00000000-0000-0000-0000-000000000030')=0,'Historical workout unlocked prospective achievement';
 perform pg_temp.expect_error('select public.adopt_platform_experience_defaults(''00000000-0000-0000-0000-000000000010'',2,2,true)','PT409');
 perform pg_temp.expect_error('update public.company_content_studios set version=99','42501');
 perform pg_temp.expect_error('delete from public.platform_content_history','42501');
end $$;
reset role;
insert into public.workout_sessions(id,student_id,company_id,status,session_date) values('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000010','completed',current_date);
set role authenticated;
set local test.uid='00000000-0000-0000-0000-000000000002';
select public.award_company_xp('00000000-0000-0000-0000-000000000030','workout','00000000-0000-0000-0000-000000000051');
do $$ begin
 assert public.check_and_unlock_achievements('00000000-0000-0000-0000-000000000030')=1,'New achievement did not unlock';
 assert public.check_and_unlock_achievements('00000000-0000-0000-0000-000000000030')=0,'Duplicate unlock';
 assert (select xp_amount=77 from public.xp_events where source_id='00000000-0000-0000-0000-000000000051');
 assert (select xp_amount=17 and notes='untouched' from public.xp_events where source_id='00000000-0000-0000-0000-000000000070');
end $$;
reset role;
update public.content_test_features set enabled=false where company_id='00000000-0000-0000-0000-000000000010';
set role authenticated;
set local test.uid='00000000-0000-0000-0000-000000000001';
select pg_temp.expect_error('select public.get_company_content(''00000000-0000-0000-0000-000000000010'')','42501');
select pg_temp.expect_error('select public.get_platform_experience_defaults(''00000000-0000-0000-0000-000000000010'')','42501');
set role anon;
do $$ begin assert public.get_public_platform_content()->>'hero_title'='CMS synthetic'; end $$;
select pg_temp.expect_error('select * from public.platform_content_state','42501');
select pg_temp.expect_error('select public.get_platform_content_editor()','42501');
reset role;
rollback;
