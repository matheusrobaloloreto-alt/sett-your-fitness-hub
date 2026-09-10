-- Emergency rollback for weekly-contact consent enforcement.
-- Privacy is fail-closed: preserve evidence, disable every weekly contact, and
-- make both cron scans and queued dispatches ineligible. Never restore legacy
-- boolean opt-ins as if they were consent.

begin;

set local lock_timeout='8s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(hashtextextended('sett:weekly-contact-consent-ledger:v1',0));

lock table public.students in share row exclusive mode;
lock table public.weekly_contact_consent_events in share row exclusive mode;
lock table public.flow_sessions in share row exclusive mode;

alter table public.students disable trigger guard_weekly_contact_boolean_write;
update public.students
set weekly_contact_enabled=false
where weekly_contact_enabled=true;
alter table public.students enable trigger guard_weekly_contact_boolean_write;

update public.flow_sessions
set status='failed',
    context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
      'dispatch_error','weekly_contact_consent_emergency_rollback',
      'next_dispatch_at',null
    ),
    updated_at=now()
where context->>'trigger_type'='weekly_contact'
  and status in ('active','waiting_response','processing');

create or replace function public.weekly_contact_consent_is_current(
  _student_id uuid,
  _company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog
as $$ select false $$;

revoke execute on function public.record_weekly_contact_consent(uuid,text,text,text)
from public,anon,authenticated;
revoke execute on function public.weekly_contact_consent_is_current(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.weekly_contact_consent_is_current(uuid,uuid)
to service_role;

commit;
