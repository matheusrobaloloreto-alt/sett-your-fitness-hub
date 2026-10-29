-- New responses identify the exact immutable definition/consent text accepted.
-- Existing responses and the legacy intercycle-sensitive-v1 path remain untouched.
create or replace function public.submit_versioned_intercycle_form(_token_sha256 text,_definition_id uuid,_answers jsonb,_payload jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare invite public.intercycle_anamnesis_invites%rowtype; answer_id uuid;
begin
  select * into invite from public.intercycle_anamnesis_invites where token_sha256=_token_sha256 for update;
  if invite.id is null or invite.form_definition_id is distinct from _definition_id or _definition_id is null then raise exception 'form_invite_version_mismatch'; end if;
  perform public.validate_company_form_answers((select definition from public.company_form_definitions where id=_definition_id),_answers);
  answer_id:=public.submit_intercycle_anamnesis(
    _token_sha256,_payload->>'prescription_evaluation',(_payload->>'goals_continue')::boolean,_payload->>'new_goals',
    (_payload->>'availability_changed')::boolean,array(select jsonb_array_elements_text(coalesce(_payload->'available_days','[]'::jsonb))),
    nullif(_payload->>'session_duration_minutes','')::integer,_payload->>'training_location',_payload->>'available_equipment',
    (_payload->>'pain_present')::boolean,_payload->>'pain_location',nullif(_payload->>'pain_eva','')::integer,
    _payload->>'pain_started_at',_payload->>'pain_movement',_payload->>'additional_information',(_payload->>'sensitive_consent')::boolean,
    'company-form:'||_definition_id::text||':sensitive_consent');
  insert into public.company_form_responses(company_id,form_definition_id,source_kind,source_id,student_id,answers)
  values(invite.company_id,_definition_id,'intercycle',answer_id,invite.student_id,_answers);
  return answer_id;
end $$;
revoke all on function public.submit_versioned_intercycle_form(text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_versioned_intercycle_form(text,uuid,jsonb,jsonb) to service_role;
