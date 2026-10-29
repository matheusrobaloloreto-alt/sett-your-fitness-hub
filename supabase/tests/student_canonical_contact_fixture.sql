-- All rows synthetic. No remote data, credential or provider integration.
create schema auth;
create schema commercial_private;
create type public.app_role as enum('master','admin','coordinator','trainer','student');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_setting('role',true))$$;
create table public.companies(id uuid primary key);
create table public.company_members(user_id uuid,company_id uuid);
create table public.user_roles(user_id uuid,role public.app_role);
create function public.has_role(u uuid,r public.app_role) returns boolean language sql stable as $$select exists(select 1 from user_roles where user_id=u and role=r)$$;
create function public.is_company_staff(u uuid,c uuid) returns boolean language sql stable security definer as $$select public.has_role(u,'master') or (exists(select 1 from company_members where user_id=u and company_id=c) and exists(select 1 from user_roles where user_id=u and role in ('admin','trainer','coordinator')))$$;
create table public.students(
 id uuid primary key,company_id uuid references public.companies,user_id uuid,assigned_trainer_id uuid,
 phone text,whatsapp text,country_code text,updated_at timestamptz not null default now(),
 weekly_contact_recipient_key text,weekly_contact_recipient_generation bigint not null default 0,weekly_contact_enabled boolean not null default false,
 full_name text not null,email text,birth_date date,cpf text,cep text,address text,address_number text,neighborhood text,city text,state text,status text check(status in ('active','inactive','interested')),notes text,
 weekly_workout_goal integer default 3,gender text,height_cm numeric,
 internal_fixture_value text default 'must-not-return'
);
create table public.whatsapp_chats(id uuid primary key,company_id uuid,student_id uuid,remote_jid text,instance_id text);
create table public.fixture_consent(student_id uuid,recipient_key text,generation bigint);
insert into companies values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into company_members values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
insert into user_roles values('10000000-0000-0000-0000-000000000001','admin'),('10000000-0000-0000-0000-000000000002','trainer'),('10000000-0000-0000-0000-000000000003','student');
-- Insert legacy ambiguity BEFORE applying any new guards.
insert into students(id,company_id,user_id,phone,whatsapp,country_code,full_name,status,weekly_contact_recipient_generation,weekly_contact_enabled) values
('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','11911112222','11933334444','BR','Fixture one','active',4,true),
('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',null,'11955556666','11955556666','BR','Fixture two','active',2,false),
('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',null,'11977778888','11977778888','BR','Fixture other tenant','active',1,false),
('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',null,null,null,null,'Fixture unknown country','active',0,false);
insert into whatsapp_chats values
('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','5511933334444@s.whatsapp.net','fixture'),
('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',null,'5511911112222@s.whatsapp.net','fixture');
insert into fixture_consent values('20000000-0000-0000-0000-000000000001',null,4);
create table public.fixture_before as select * from students;
-- ORIGINAL_HELPERS
create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at:=now();return new;end$$;
create trigger update_students_updated_at before update on students for each row execute function update_updated_at_column();
create trigger track_weekly_contact_recipient_generation before insert or update on students for each row execute function track_weekly_contact_recipient_generation();
create trigger zz_prevent_student_self_privilege_escalation before update on students for each row execute function prevent_student_self_privilege_escalation();
create trigger trg_link_student_existing_whatsapp_chats after insert or update of company_id,whatsapp,phone on students for each row execute function link_student_to_existing_whatsapp_chats();
create trigger trg_link_whatsapp_chat before insert or update of remote_jid,company_id on whatsapp_chats for each row execute function link_whatsapp_chat_to_student();
alter table students enable row level security;
create policy staff on students for all to authenticated using (public.is_company_staff(auth.uid(),company_id)) with check(public.is_company_staff(auth.uid(),company_id));
create policy own on students for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant usage on schema public,auth to authenticated,service_role;
grant select,insert,update on students,whatsapp_chats to authenticated,service_role;
grant select on company_members,user_roles to authenticated;
