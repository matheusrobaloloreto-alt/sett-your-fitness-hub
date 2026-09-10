-- Run after the migration in the same disposable transaction. Uses one
-- synthetic student, emits booleans only, and relies on the caller to ROLLBACK.

begin;

create temporary table pg_temp.weekly_contact_consent_rehearsal (
  grant_eligible boolean not null,
  revoke_ineligible boolean not null,
  sequence_monotonic boolean not null,
  direct_boolean_rejected boolean not null,
  generic_definer_rejected boolean not null,
  ledger_mutation_rejected boolean not null,
  stale_policy_rejected boolean not null,
  grant_a_then_b_false boolean not null,
  grant_b_true boolean not null,
  return_to_a_false boolean not null,
  regrant_a_true boolean not null,
  recipient_generation_monotonic boolean not null,
  profile_rpc_race_rejected boolean not null,
  phone_divergence_rejected boolean not null,
  alternate_jid_rejected boolean not null,
  international_recipient_preserved boolean not null
) on commit drop;

create function pg_temp.weekly_contact_cache_write_probe(_student_id uuid)
returns void
language sql
security definer
set search_path=public,pg_temp
as $$ update public.students set weekly_contact_enabled=false where id=_student_id $$;
grant execute on function pg_temp.weekly_contact_cache_write_probe(uuid) to authenticated;

do $rehearsal$
declare
  v_actor uuid := '00000000-0000-4000-8000-000000001031'::uuid;
  v_company uuid := '00000000-0000-4000-8000-000000001032'::uuid;
  v_student uuid := '00000000-0000-4000-8000-000000001030'::uuid;
  v_event_id uuid;
  v_grant_sequence bigint;
  v_revoke_sequence bigint;
  v_grant_a_generation bigint;
  v_grant_b_generation bigint;
  v_return_a_generation bigint;
  v_regrant_a_generation bigint;
  v_direct_rejected boolean := false;
  v_generic_definer_rejected boolean := false;
  v_mutation_rejected boolean := false;
  v_stale_rejected boolean := false;
  v_grant_eligible boolean;
  v_revoke_ineligible boolean;
  v_recipient_a text := '55'||'48'||'9'||repeat('7',8);
  v_recipient_b text := '55'||'48'||'9'||repeat('8',8);
  v_recipient_alternate text := '55'||'48'||'9'||repeat('6',8);
  v_grant_a_then_b_false boolean;
  v_grant_b_true boolean;
  v_return_to_a_false boolean;
  v_regrant_a_true boolean;
  v_recipient_generation_monotonic boolean;
  v_profile_rpc_race_rejected boolean := false;
  v_phone_divergence_rejected boolean := false;
  v_alternate_jid_rejected boolean;
  v_international_recipient text := '61'||'4'||repeat('5',8);
  v_international_recipient_preserved boolean;
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
  insert into public.students(id,company_id,full_name,phone,whatsapp,weekly_contact_enabled)
  values(v_student,v_company,'Synthetic Consent Probe',v_recipient_a,v_recipient_a,false);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;

  select event.id,event.sequence,event.recipient_generation
  into v_event_id,v_grant_sequence,v_grant_a_generation
  from public.record_weekly_contact_consent(
    v_student,'granted',public.weekly_contact_policy_version(),'staff_confirmed_student',v_recipient_a
  ) event;
  select (public.weekly_contact_consent_status(v_student,v_recipient_a)->>'eligible')::boolean
  into v_grant_eligible;

  update public.students
  set phone=v_recipient_b,whatsapp=v_recipient_b
  where id=v_student;
  select not (public.weekly_contact_consent_status(
    v_student,v_recipient_b||'@s.whatsapp.net'
  )->>'eligible')::boolean into v_grant_a_then_b_false;

  select event.recipient_generation into v_grant_b_generation
  from public.record_weekly_contact_consent(
    v_student,'granted',public.weekly_contact_policy_version(),'staff_confirmed_student',v_recipient_b
  ) event;
  select (public.weekly_contact_consent_status(
    v_student,v_recipient_b||'@s.whatsapp.net'
  )->>'eligible')::boolean into v_grant_b_true;

  update public.students
  set phone=v_recipient_a,whatsapp=v_recipient_a
  where id=v_student;
  select student.weekly_contact_recipient_generation into v_return_a_generation
  from public.students student where student.id=v_student;
  select not (public.weekly_contact_consent_status(v_student,v_recipient_a)->>'eligible')::boolean
  into v_return_to_a_false;
  select event.recipient_generation into v_regrant_a_generation
  from public.record_weekly_contact_consent(
    v_student,'granted',public.weekly_contact_policy_version(),'staff_confirmed_student',v_recipient_a
  ) event;
  select (public.weekly_contact_consent_status(v_student,v_recipient_a)->>'eligible')::boolean
  into v_regrant_a_true;
  v_recipient_generation_monotonic :=
    v_grant_a_generation < v_grant_b_generation
    and v_grant_b_generation < v_return_a_generation
    and v_regrant_a_generation = v_return_a_generation;

  begin
    update public.students set weekly_contact_enabled=false where id=v_student;
  exception when object_not_in_prerequisite_state then
    v_direct_rejected := true;
  end;

  begin
    perform pg_temp.weekly_contact_cache_write_probe(v_student);
  exception when object_not_in_prerequisite_state then
    v_generic_definer_rejected := true;
  end;

  begin
    update public.weekly_contact_consent_events set source='staff_confirmed_student' where id=v_event_id;
  exception when object_not_in_prerequisite_state or insufficient_privilege then
    v_mutation_rejected := true;
  end;

  begin
    perform public.record_weekly_contact_consent(
      v_student,'granted','obsolete-policy','staff_confirmed_student',v_recipient_b
    );
  exception when invalid_parameter_value then
    v_stale_rejected := true;
  end;

  select event.sequence into v_revoke_sequence
  from public.record_weekly_contact_consent(
    v_student,'revoked',public.weekly_contact_policy_version(),'staff_confirmed_student',null
  ) event;
  select not (public.weekly_contact_consent_status(v_student,v_recipient_a)->>'eligible')::boolean
  into v_revoke_ineligible;

  -- Models a profile update winning the student-row lock before a stale grant RPC.
  update public.students
  set phone=v_recipient_b,whatsapp=v_recipient_b
  where id=v_student;
  begin
    perform public.record_weekly_contact_consent(
      v_student,'granted',public.weekly_contact_policy_version(),'staff_confirmed_student',v_recipient_a
    );
  exception when invalid_parameter_value then
    v_profile_rpc_race_rejected := true;
  end;

  update public.students
  set phone=v_recipient_a,whatsapp=v_recipient_b
  where id=v_student;
  begin
    perform public.record_weekly_contact_consent(
      v_student,'granted',public.weekly_contact_policy_version(),'staff_confirmed_student',v_recipient_b
    );
  exception when invalid_parameter_value then
    v_phone_divergence_rejected := true;
  end;

  update public.students
  set phone=v_recipient_b,whatsapp=v_recipient_b
  where id=v_student;
  perform public.record_weekly_contact_consent(
    v_student,'granted',public.weekly_contact_policy_version(),'staff_confirmed_student',v_recipient_b
  );
  select not (public.weekly_contact_consent_status(
    v_student,v_recipient_alternate||'@s.whatsapp.net'
  )->>'eligible')::boolean into v_alternate_jid_rejected;
  reset role;
  select public.weekly_contact_recipient_key(v_international_recipient)=v_international_recipient
    and public.weekly_contact_stored_recipient_key(v_international_recipient,'AU')=v_international_recipient
  into v_international_recipient_preserved;
  if not coalesce(v_grant_eligible,false)
     or not coalesce(v_revoke_ineligible,false)
     or not coalesce(v_revoke_sequence>v_grant_sequence,false)
     or not v_direct_rejected
     or not v_generic_definer_rejected
     or not v_mutation_rejected
     or not v_stale_rejected
     or not coalesce(v_grant_a_then_b_false,false)
     or not coalesce(v_grant_b_true,false)
     or not coalesce(v_return_to_a_false,false)
     or not coalesce(v_regrant_a_true,false)
     or not coalesce(v_recipient_generation_monotonic,false)
     or not v_profile_rpc_race_rejected
     or not v_phone_divergence_rejected
     or not coalesce(v_alternate_jid_rejected,false)
     or not coalesce(v_international_recipient_preserved,false) then
    raise exception 'weekly_contact_consent_rehearsal_failed';
  end if;

  insert into pg_temp.weekly_contact_consent_rehearsal values(
    v_grant_eligible,v_revoke_ineligible,v_revoke_sequence>v_grant_sequence,
    v_direct_rejected,v_generic_definer_rejected,v_mutation_rejected,v_stale_rejected,
    v_grant_a_then_b_false,v_grant_b_true,v_return_to_a_false,v_regrant_a_true,
    v_recipient_generation_monotonic,
    v_profile_rpc_race_rejected,v_phone_divergence_rejected,v_alternate_jid_rejected,
    v_international_recipient_preserved
  );
end
$rehearsal$;

select * from pg_temp.weekly_contact_consent_rehearsal;

rollback;
