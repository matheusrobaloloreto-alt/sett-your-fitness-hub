-- psql -X -v ON_ERROR_STOP=1 -f this_file.sql against an EMPTY disposable LOCAL database.
-- This fixture models only the auth/tenant primitives used by this migration.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
create type public.app_role as enum ('master','admin','coordinator','trainer','student');
create table public.companies(id uuid primary key);
create table public.company_members(user_id uuid, company_id uuid);
create table public.user_roles(user_id uuid, role public.app_role);
grant usage on schema auth to authenticated;
grant select on public.company_members, public.user_roles to authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.auth_uid', true), '')::uuid;
$$;
create function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;
\ir ../migrations/20261026092601_company_product_settings.sql

create function pg_temp.expect_error(_statement text, _code text) returns void language plpgsql as $$
declare v_code text;
begin
  begin execute _statement;
  exception when others then get stacked diagnostics v_code = returned_sqlstate;
  end;
  if v_code is distinct from _code then
    raise exception 'Expected SQLSTATE %, received % for %', _code, v_code, _statement;
  end if;
end;
$$;

insert into public.companies values ('00000000-0000-0000-0000-000000000010'), ('00000000-0000-0000-0000-000000000020');
insert into public.company_members values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010'),
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000020');
insert into public.user_roles values
  ('00000000-0000-0000-0000-000000000001','admin'),
  ('00000000-0000-0000-0000-000000000002','trainer'),
  ('00000000-0000-0000-0000-000000000003','admin'),
  ('00000000-0000-0000-0000-000000000004','master');

-- Verify type, allowlist, template vocabulary, clinical/cadence hard caps and cross-field bounds.
do $$
declare v_bad jsonb;
begin
  assert public.validate_company_product_settings('{}') = public.company_product_settings_defaults();
  for v_bad in select value from jsonb_array_elements('[
    null, [], {"unknown":{}}, {"brand":{"api_key":"bad"}},
    {"messages":{"weekly_contact":"Oi {{senha}}"}},
    {"messages":{"weekly_contact":"Oi {{nome}"}},
    {"messages":{"weekly_contact":"Bearer synthetic-credential-value"}},
    {"contact_policy":{"max_weekly_contacts":3}},
    {"contact_policy":{"minimum_interval_hours":71}},
    {"contact_policy":{"no_workout_days":6}},
    {"contact_policy":{"no_workout_repeat_days":5}},
    {"contact_policy":{"cart_abandonment_hours":1}},
    {"contact_policy":{"weekdays":[]}}, {"contact_policy":{"weekdays":[1,1]}},
    {"contact_policy":{"weekdays":["1"]}}, {"contact_policy":{"weekdays":[1.5]}},
    {"contact_policy":{"start_hour":20,"end_hour":8}},
    {"contact_policy":{"timezone":"Invalid/Zone"}},
    {"prescription":{"first_week_volume_multiplier":1.1}},
    {"prescription":{"beginner_max_weekly_sets":22}},
    {"prescription":{"default_cadence":"evil"}},
    {"prescription":{"preferred_split":"unknown"}},
    {"business":{"assessment_sla_business_days":0}},
    {"notifications":{"daily_reminder_enabled":"true"}},
    {"experience":{"cadence_warning_hours":80,"cadence_critical_hours":10}},
    {"brand":{"terms_url":"javascript:alert(1)"}}, {"brand":{"support_email":"invalid"}}
  ]') loop
    perform pg_temp.expect_error(format('select public.validate_company_product_settings(%L::jsonb)', v_bad), '22023');
  end loop;
end;
$$;

do $$ begin
  assert public.validate_company_product_settings(public.company_product_settings_defaults()) = public.company_product_settings_defaults();
end $$;
set local test.auth_uid = '00000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ declare v_result jsonb; begin
  v_result := public.save_company_product_settings('00000000-0000-0000-0000-000000000010', '{"brand":{"company_name":"Synthetic A"}}', 0);
  assert (v_result ->> 'version')::int = 1;
  assert v_result #>> '{settings,brand,company_name}' = 'Synthetic A';
  assert v_result #>> '{settings,prescription,beginner_max_weekly_sets}' = '21';
end $$;
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{}',0)$q$, 'PT409');
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000020','{}',0)$q$, '42501');
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{"messages":{"weekly_contact":"{{secret}}"}}',1)$q$, '22023');
-- Independent 14 x 8 event/token contract, including bypass attempts through the save RPC.
do $$
declare
  v_event text; v_extra jsonb; v_variable text; v_input jsonb; v_code text; v_message text; v_result jsonb; v_allowed boolean;
  v_matrix jsonb := '{"weekly_contact":[],"pre_registration_confirmation":[],"fiscal_invite":["link"],"payment_link":["link"],"assessment_onboarding":["prazo","data"],"anamnesis_invite":["link"],"renewal_due":["link"],"renewal_overdue":["link"],"intercycle_invite":["link"],"first_contact":["profissional"],"daily_reminder_title":["link","data"],"daily_reminder_body":["link","data"],"new_workout_push_title":[],"new_workout_push_body":[]}'::jsonb;
begin
  for v_event, v_extra in select * from jsonb_each(v_matrix) loop
    foreach v_variable in array array['', E' \n\t '] loop
      v_code := null; v_message := null;
      begin
        perform public.save_company_product_settings('00000000-0000-0000-0000-000000000010',jsonb_build_object('messages',jsonb_build_object(v_event,v_variable)),1);
      exception when others then get stacked diagnostics v_code = returned_sqlstate, v_message = message_text;
      end;
      assert v_code = '22023' and v_message = 'messages.' || v_event || '.required';
      assert (select version = 1 from public.company_product_settings);
      assert (select count(*) = 1 from public.company_product_settings_history);
    end loop;
    foreach v_variable in array array['primeiro_nome','nome','empresa','link','prazo','profissional','email','data'] loop
      v_input := jsonb_build_object('messages', jsonb_build_object(v_event, '{{' || v_variable || '}}'));
      v_allowed := v_variable = any(array['primeiro_nome','nome','empresa']) or v_extra ? v_variable;
      v_code := null; v_message := null;
      begin
        v_result := public.save_company_product_settings('00000000-0000-0000-0000-000000000010',v_input,1);
        assert v_result #>> array['settings','messages',v_event] = '{{' || v_variable || '}}';
        assert (v_result ->> 'version')::integer = 2;
        -- Exercise a real successful save, then roll back only this synthetic case.
        raise exception 'fixture_allowed_rollback' using errcode='P0001';
      exception when others then get stacked diagnostics v_code = returned_sqlstate, v_message = message_text;
      end;
      if v_allowed then
        assert v_code = 'P0001' and v_message = 'fixture_allowed_rollback';
      else
        assert v_code = '22023';
        assert v_message = 'messages.' || v_event || '.variable.' || v_variable;
      end if;
      assert (select version = 1 from public.company_product_settings);
      assert (select count(*) = 1 from public.company_product_settings_history);
    end loop;
  end loop;
end $$;
select pg_temp.expect_error($q$update public.company_product_settings set settings = '{}'$q$, '42501');
select pg_temp.expect_error($q$delete from public.company_product_settings_history$q$, '42501');
select pg_temp.expect_error($q$insert into public.company_product_settings values ('00000000-0000-0000-0000-000000000020','{}',1,now(),'00000000-0000-0000-0000-000000000001')$q$, '42501');
do $$ begin
  assert (select count(*) = 1 from public.company_product_settings);
  assert (select count(*) = 1 from public.company_product_settings_history);
end $$;

-- Tenant B admin cannot read A or use A's version; trainer may read A but cannot write.
set local test.auth_uid = '00000000-0000-0000-0000-000000000003';
do $$ begin assert (select count(*) = 0 from public.company_product_settings); end $$;
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{}',1)$q$, '42501');
set local test.auth_uid = '00000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) = 1 from public.company_product_settings);
  assert (select count(*) = 0 from public.company_product_settings_history);
end $$;
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{}',1)$q$, '42501');
reset role;
update public.user_roles set role = 'coordinator' where user_id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{}',1)$q$, '42501');
reset role;
update public.user_roles set role = 'student' where user_id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{}',1)$q$, '42501');

-- Global master is the explicit platform exception; admin never gets this capability.
set local test.auth_uid = '00000000-0000-0000-0000-000000000004';
select public.save_company_product_settings('00000000-0000-0000-0000-000000000010', '{"brand":{"company_name":"Synthetic revised"}}', 1);
do $$ begin
  assert (select count(*) = 2 from public.company_product_settings_history);
  assert (select settings #>> '{brand,company_name}' = 'Synthetic A' from public.company_product_settings_history where version = 1);
  assert (select changed_by = '00000000-0000-0000-0000-000000000004'::uuid from public.company_product_settings_history where version = 2);
end $$;
set local test.auth_uid = '';
select pg_temp.expect_error($q$select public.save_company_product_settings('00000000-0000-0000-0000-000000000010','{}',2)$q$, '42501');
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.save_company_product_settings(uuid,jsonb,integer)','execute');
  assert not has_table_privilege('authenticated','public.company_product_settings','UPDATE');
  assert not has_table_privilege('authenticated','public.company_product_settings_history','INSERT');
  assert not has_table_privilege('anon','public.company_product_settings','SELECT');
  assert not has_function_privilege('authenticated','public.validate_company_product_settings(jsonb)','execute');
end $$;
rollback;
\echo 'Company product settings SQL fixture passed; all synthetic data rolled back.'
