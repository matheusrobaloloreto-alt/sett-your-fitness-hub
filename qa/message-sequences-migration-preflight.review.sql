-- For root only: read-only prerequisite inventory before narrow staging apply.
-- No connection target/credentials embedded. Reviewer did not execute this remotely.
begin;
set local transaction read only;
select signature, to_regprocedure(signature) is not null as available
from unnest(array[
 'public.company_product_settings_defaults()',
 'public.validate_company_product_settings(jsonb)',
 'public.validate_prescription_methodology_field(text,jsonb)',
 'public.save_company_product_settings(uuid,jsonb,integer)',
 'public.is_company_staff(uuid,uuid)',
 'public.try_uuid(text)',
 'public.has_role(uuid,public.app_role)',
 'public.lock_automation_dispatch_owner(text,uuid,uuid)',
 'public.automation_legacy_retry_uncertain(text,text,jsonb,text,uuid)',
 'public.claim_automation_sessions(integer)',
 'public.claim_intercycle_anamnesis_deliveries(integer)'
]) signature;

select relation, to_regclass(relation) is not null as available
from unnest(array[
 'public.company_product_settings','public.company_product_settings_history',
 'public.companies','public.whatsapp_chats','public.flow_sessions',
 'public.automation_flows','public.automation_dispatch_attempts',
 'public.intercycle_anamnesis_deliveries','storage.objects','storage.buckets'
]) relation;

-- Separate runtime prerequisite. Its absence is NOT a reason to broaden this migration silently.
select to_regprocedure('public.service_company_feature_allowed(uuid,text)') is not null
 as runtime_feature_gate_available;

-- Capture exact target definitions/ACLs privately for comparison and rollback planning.
select p.oid::regprocedure as signature, r.rolname as owner, p.proacl,
 pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_roles r on r.oid=p.proowner
where n.nspname='public' and p.proname in
 ('validate_company_product_settings','company_product_settings_defaults',
  'claim_automation_sessions','claim_intercycle_anamnesis_deliveries');

-- Private bucket alone does not prove RLS. Inspect permissive and restrictive policies together.
select id, public from storage.buckets where id='whatsapp-media';
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='storage' and tablename='objects'
order by policyname;
rollback;
