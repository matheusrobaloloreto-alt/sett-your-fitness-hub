-- Run after the migration in the same disposable transaction. Uses one
-- synthetic student, emits booleans only, and relies on the caller to ROLLBACK.

begin;

create temporary table pg_temp.weekly_contact_consent_rehearsal (
  grant_eligible boolean not null,
  revoke_ineligible boolean not null,
  direct_boolean_rejected boolean not null,
  ledger_mutation_rejected boolean not null,
  stale_policy_rejected boolean not null
) on commit drop;

do $rehearsal$
declare
  v_actor uuid := '00000000-0000-4000-8000-000000001031'::uuid;
  v_company uuid := '00000000-0000-4000-8000-000000001032'::uuid;
  v_student uuid := '00000000-0000-4000-8000-000000001030'::uuid;
  v_event_id uuid;
  v_direct_rejected boolean := false;
  v_mutation_rejected boolean := false;
  v_stale_rejected boolean := false;
  v_grant_eligible boolean;
  v_revoke_ineligible boolean;
begin
  insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
  values(v_actor,'authenticated','authenticated','consent-probe@example.invalid','',now(),now())
  on conflict(id) do nothing;
  insert into public.companies(id,name,slug)
  values(v_company,'Synthetic Consent Company','synthetic-consent-company')
  on conflict(id) do nothing;
  insert into public.company_members(company_id,user_id)
  values(v_company,v_actor)
  on conflict(company_id,user_id) do nothing;
  insert into public.user_roles(user_id,role)
  values(v_actor,'admin'::public.app_role)
  on conflict(user_id,role) do nothing;
  delete from public.students where id=v_student;
  insert into public.students(id,company_id,full_name,weekly_contact_enabled)
  values(v_student,v_company,'Synthetic Consent Probe',false);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;

  select event.id into v_event_id
  from public.record_weekly_contact_consent(
    v_student,'granted',public.weekly_contact_policy_version(),'staff_confirmed_student'
  ) event;
  select (public.weekly_contact_consent_status(v_student)->>'eligible')::boolean
  into v_grant_eligible;

  begin
    update public.students set weekly_contact_enabled=false where id=v_student;
  exception when object_not_in_prerequisite_state then
    v_direct_rejected := true;
  end;

  begin
    update public.weekly_contact_consent_events set source='staff_confirmed_student' where id=v_event_id;
  exception when object_not_in_prerequisite_state or insufficient_privilege then
    v_mutation_rejected := true;
  end;

  begin
    perform public.record_weekly_contact_consent(
      v_student,'granted','obsolete-policy','staff_confirmed_student'
    );
  exception when invalid_parameter_value then
    v_stale_rejected := true;
  end;

  perform public.record_weekly_contact_consent(
    v_student,'revoked',public.weekly_contact_policy_version(),'staff_confirmed_student'
  );
  select not (public.weekly_contact_consent_status(v_student)->>'eligible')::boolean
  into v_revoke_ineligible;

  reset role;
  if not coalesce(v_grant_eligible,false)
     or not coalesce(v_revoke_ineligible,false)
     or not v_direct_rejected
     or not v_mutation_rejected
     or not v_stale_rejected then
    raise exception 'weekly_contact_consent_rehearsal_failed';
  end if;

  insert into pg_temp.weekly_contact_consent_rehearsal values(
    v_grant_eligible,v_revoke_ineligible,v_direct_rejected,v_mutation_rejected,v_stale_rejected
  );
end
$rehearsal$;

select * from pg_temp.weekly_contact_consent_rehearsal;

rollback;
