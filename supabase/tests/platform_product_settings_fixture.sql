begin;
create table auth.users(id uuid primary key);
insert into auth.users select distinct user_id from public.user_roles;
alter table public.companies add column name text, add column slug text, add column owner_user_id uuid, add column is_active boolean default true;
update public.companies set name='Synthetic A',slug='synthetic-a',owner_user_id='00000000-0000-0000-0000-000000000001' where id='00000000-0000-0000-0000-000000000010';
update public.companies set name='Synthetic B',slug='synthetic-b',owner_user_id='00000000-0000-0000-0000-000000000003' where id='00000000-0000-0000-0000-000000000020';
-- PLATFORM_MIGRATION
create function pg_temp.expect_error(_statement text, _code text) returns void language plpgsql as $$
declare actual text;
begin
  begin execute _statement; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
  if actual is distinct from _code then raise exception 'Expected %, got %: %',_code,actual,_statement; end if;
end $$;
set local test.auth_uid='00000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ begin assert (select count(*)=0 from public.platform_product_settings); end $$;
select pg_temp.expect_error($q$select public.save_platform_product_settings('{}',1)$q$,'42501');
select pg_temp.expect_error($q$update public.platform_product_settings set settings='{}'$q$,'42501');
select pg_temp.expect_error($q$select public.update_company_public_profile('00000000-0000-0000-0000-000000000010','Changed','changed','Synthetic A','synthetic-a')$q$,'42501');
set local test.auth_uid='00000000-0000-0000-0000-000000000004';
do $$ declare v jsonb; begin
  select settings into v from public.platform_product_settings;
  perform public.save_platform_product_settings(jsonb_set(v,'{tiers,basic,monthly_price}','120'),1);
  assert (select version=2 from public.platform_product_settings);
  assert (select count(*)=2 from public.platform_product_settings_history);
end $$;
select pg_temp.expect_error($q$select public.save_platform_product_settings((select settings from public.platform_product_settings),1)$q$,'PT409');
select pg_temp.expect_error($q$select public.save_platform_product_settings(jsonb_set((select settings from public.platform_product_settings),'{tiers,basic,stripe_price_id}','"bad"'),2)$q$,'22023');
select pg_temp.expect_error($q$select public.save_platform_product_settings(jsonb_set((select settings from public.platform_product_settings),'{tiers,basic,features,isMaster}','true'),2)$q$,'22023');
select pg_temp.expect_error($q$select public.update_company_public_profile('00000000-0000-0000-0000-000000000010','Changed','synthetic-b','Synthetic A','synthetic-a')$q$,'23505');
select public.update_company_public_profile('00000000-0000-0000-0000-000000000010','Changed A','changed-a','Synthetic A','synthetic-a');
select pg_temp.expect_error($q$select public.update_company_public_profile('00000000-0000-0000-0000-000000000010','Stale','stale-a','Synthetic A','synthetic-a')$q$,'PT409');
reset role;
select pg_temp.expect_error($q$update public.companies set owner_user_id='00000000-0000-0000-0000-000000000003' where id='00000000-0000-0000-0000-000000000010'$q$,'42501');
set local role anon;
do $$ declare v jsonb; begin
  v:=public.get_public_platform_catalog();
  assert v#>>'{tiers,basic,monthly_price}'='120';
  assert not (v#>'{tiers,basic}') ? 'stripe_price_id';
  assert not v ? 'editorial';
  v:=public.get_public_company_information('changed-a');
  assert v->>'name'='Changed A'; assert not v ? 'owner_user_id';
  assert public.get_public_company_information('missing') is null;
end $$;
select pg_temp.expect_error($q$select public.save_platform_product_settings('{}',2)$q$,'42501');
reset role;
-- Scoped diagnostics do not grant a new app_role or access to customer records.
set local test.auth_uid='00000000-0000-0000-0000-000000000001';
set local role authenticated;
select public.set_company_support_access('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002',true);
set local test.auth_uid='00000000-0000-0000-0000-000000000002';
do $$ begin assert public.company_operator_status('00000000-0000-0000-0000-000000000010')->>'settings_version' is not null; end $$;
select pg_temp.expect_error($q$select public.company_operator_status('00000000-0000-0000-0000-000000000020')$q$,'42501');
select pg_temp.expect_error($q$select public.set_company_support_access('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002',true)$q$,'42501');
do $$ declare v jsonb; begin
  v:=public.company_operator_status('00000000-0000-0000-0000-000000000010');
  assert (select array_agg(key order by key) from jsonb_object_keys(v) key)=array['company_active','settings_updated_at','settings_version'];
  assert (select expires_at<=now()+interval '24 hours' from public.company_support_access where user_id=auth.uid());
end $$;
reset role;
update public.company_support_access set expires_at=now()-interval '1 second' where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select pg_temp.expect_error($q$select public.company_operator_status('00000000-0000-0000-0000-000000000010')$q$,'42501');
set local test.auth_uid='00000000-0000-0000-0000-000000000001';
select public.set_company_support_access('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002',true);
select public.set_company_support_access('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002',false);
select pg_temp.expect_error($q$select public.set_company_support_access('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000003',true)$q$,'42501');
set local test.auth_uid='00000000-0000-0000-0000-000000000002';
select pg_temp.expect_error($q$select public.company_operator_status('00000000-0000-0000-0000-000000000010')$q$,'42501');
-- Plaintext CMS drafts are private; publication snapshots are immutable across draft edits.
set local test.auth_uid='00000000-0000-0000-0000-000000000001';
select public.save_company_commercial_settings('00000000-0000-0000-0000-000000000010','{"pages":{"termos":{"title":"Provided terms","sections":[{"heading":"Scope","body":"Approved synthetic text"}]}}}',0);
select pg_temp.expect_error($q$select public.save_company_commercial_settings('00000000-0000-0000-0000-000000000020','{}',0)$q$,'42501');
select pg_temp.expect_error($q$select public.save_company_commercial_settings('00000000-0000-0000-0000-000000000010','{"funnel_labels":{"bypass_payment":"bad"}}',1)$q$,'22023');
select pg_temp.expect_error($q$select public.save_company_commercial_settings('00000000-0000-0000-0000-000000000010','{"pages":{"termos":{"title":"Bad","sections":[{"heading":"","body":"<script>bad</script>"}]}}}',1)$q$,'22023');
set local role anon;
do $$ begin assert public.get_public_company_information('changed-a')#>'{documents,termos}' is null; end $$;
set local role authenticated;
select public.publish_company_public_page('00000000-0000-0000-0000-000000000010','termos',1);
select public.save_company_commercial_settings('00000000-0000-0000-0000-000000000010','{"pages":{"termos":{"title":"Unpublished draft","sections":[]}},"influencer":{"enabled":true,"max_active_students":1}}',1);
select pg_temp.expect_error($q$select public.publish_company_public_page('00000000-0000-0000-0000-000000000010','termos',1)$q$,'PT409');
set local role anon;
do $$ begin assert public.get_public_company_information('changed-a')#>>'{documents,termos,title}'='Provided terms'; assert public.get_public_company_information('synthetic-b')#>'{documents,termos}' is null; end $$;
reset role;
-- A per-tenant influencer ceiling is enforced even on direct inserts; B remains independent.
insert into public.plans values('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000010','influencer');
insert into public.students values('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000010','active','00000000-0000-0000-0000-000000000101');
select pg_temp.expect_error($q$insert into public.students values('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000010','active','00000000-0000-0000-0000-000000000101')$q$,'23514');
set local test.auth_uid='00000000-0000-0000-0000-000000000004';
set local role authenticated;
select public.save_platform_product_settings(jsonb_set((select settings from public.platform_product_settings),'{tiers,basic,active_student_limit}','1'),2);
reset role;
select pg_temp.expect_error($q$insert into public.students values('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000010','active',null)$q$,'23514');
insert into public.students values('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-000000000020','active',null);
update public.students set status='awaiting_renewal' where id='00000000-0000-0000-0000-000000000201';
rollback;
