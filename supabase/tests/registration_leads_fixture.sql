-- Run only in a disposable, empty PostgreSQL database with ON_ERROR_STOP=1.
-- Synthetic schema isolates this RPC from production data and auth services.
begin;
create role anon;
create role authenticated;
create schema auth;
create type public.app_role as enum ('master', 'admin', 'coordinator', 'trainer');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.auth_uid', true), '')::uuid;
$$;
create function public.is_company_staff(uuid, uuid) returns boolean language sql stable as $$
  select $2 = nullif(current_setting('test.company_id', true), '')::uuid;
$$;
create function public.has_role(uuid, public.app_role) returns boolean language sql stable as $$
  select coalesce(current_setting('test.master', true), '') = 'true';
$$;
create function public.can_manage_staff_student(uuid, uuid) returns boolean language sql stable as $$
  select $1 = nullif(current_setting('test.company_id', true), '')::uuid
    and coalesce(current_setting('test.manage', true), '') = 'true';
$$;
create table public.students (
  id uuid primary key, company_id uuid not null, status text, sales_stage text,
  updated_at timestamptz default now(), full_name text, email text
);
create table public.leads (
  id uuid primary key, company_id uuid not null, stage text,
  converted_to_student_id uuid, updated_at timestamptz default now(),
  pre_registration_answers jsonb, contact_outcome text
);
create table public.enrollments (
  id uuid primary key, company_id uuid not null, student_id uuid not null, status text
);

\ir ../migrations/20261009172654_registration_dormant_leads.sql

create function pg_temp.expect_error(_statement text, _code text) returns void language plpgsql as $$
declare v_code text;
begin
  begin
    execute _statement;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
  end;
  if v_code is distinct from _code then
    raise exception 'Expected SQLSTATE %, received % for %', _code, v_code, _statement;
  end if;
end;
$$;

set local test.auth_uid = '00000000-0000-0000-0000-000000000001';
set local test.company_id = '00000000-0000-0000-0000-000000000010';
set local test.manage = 'true';

insert into public.students(id, company_id, status, sales_stage, full_name, email) values
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'pending', 'payment_pending', 'Fixture', 'fixture@example.invalid'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010', 'inactive', 'lost', 'Historical', null);
insert into public.leads(id, company_id, stage, pre_registration_answers, contact_outcome) values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000010', 'fiscal_registration', '{"objective":"saude"}', 'follow_up');

set local role authenticated;
select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'payment_pending', 'lost');
select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'lost', 'contacted');
select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000021', 'lost', 'contacted');
select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'lead', '00000000-0000-0000-0000-000000000030', 'fiscal_registration_pending', 'lost');
select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'lead', '00000000-0000-0000-0000-000000000030', 'lost', 'contacted');
reset role;

do $$
begin
  assert (select status = 'pending' and sales_stage = 'contacted' and email = 'fixture@example.invalid'
    from public.students where id = '00000000-0000-0000-0000-000000000020'), 'Student status/data changed';
  assert (select status = 'inactive' and sales_stage = 'contacted'
    from public.students where id = '00000000-0000-0000-0000-000000000021'), 'Historical archive not recoverable';
  assert (select stage = 'contacted' and pre_registration_answers = '{"objective":"saude"}'::jsonb
    and contact_outcome = 'follow_up' from public.leads), 'Lead data changed';
  assert (select count(*) = 2 from public.students), 'Student deleted or duplicated';
  assert (select count(*) = 1 from public.leads), 'Lead deleted or duplicated';
  assert not has_function_privilege('anon', 'public.set_registration_lead_stage(uuid,text,uuid,text,text)', 'execute'), 'Anonymous RPC access';
end;
$$;

do $$
declare v_status text; v_stage text;
begin
  foreach v_status in array array['active', 'awaiting_training', 'awaiting_renewal', 'trial'] loop
    update public.students set status = v_status, sales_stage = 'contacted' where id = '00000000-0000-0000-0000-000000000020';
    perform pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'contacted', 'lost')$q$, '23514');
    assert (select sales_stage = 'contacted' and status = v_status from public.students where id = '00000000-0000-0000-0000-000000000020'), 'Operational profile downgraded';
  end loop;
  foreach v_stage in array array['active', 'active_onboarding'] loop
    update public.students set status = 'pending', sales_stage = v_stage where id = '00000000-0000-0000-0000-000000000020';
    perform pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'contacted', 'lost')$q$, '23514');
  end loop;
  update public.students set status = 'interested', sales_stage = 'contacted' where id = '00000000-0000-0000-0000-000000000020';
  foreach v_status in array array['active', 'awaiting_training', 'awaiting_renewal', 'trial'] loop
    insert into public.enrollments values ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', v_status);
    perform pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'contacted', 'lost')$q$, '23514');
    assert (select sales_stage = 'contacted' from public.students where id = '00000000-0000-0000-0000-000000000020'), 'Stale student status bypassed enrollment protection';
    delete from public.enrollments;
  end loop;
end;
$$;

-- Reject stale UI, mismatched tenant, converted lead and invalid targets.
select pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'interested', 'lost')$q$, '40001');
select pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000099', 'student', '00000000-0000-0000-0000-000000000020', 'contacted', 'lost')$q$, '42501');
select pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000099', 'lead', '00000000-0000-0000-0000-000000000030', 'contacted', 'lost')$q$, '42501');
select pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'lead', '00000000-0000-0000-0000-000000000030', 'contacted', 'active')$q$, '22023');
update public.leads set converted_to_student_id = '00000000-0000-0000-0000-000000000020';
select pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'lead', '00000000-0000-0000-0000-000000000030', 'contacted', 'lost')$q$, '23514');
set local test.manage = 'false';
select pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'contacted', 'lost')$q$, '42501');
set local test.auth_uid = '';
select pg_temp.expect_error($q$select public.set_registration_lead_stage('00000000-0000-0000-0000-000000000010', 'student', '00000000-0000-0000-0000-000000000020', 'contacted', 'lost')$q$, '28000');

rollback;
\echo 'Registration Leads SQL fixture passed (all synthetic data rolled back).'
