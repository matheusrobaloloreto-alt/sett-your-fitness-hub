-- Manual link creation is distinct from a confirmed WhatsApp send.
alter table public.intercycle_anamnesis_deliveries
  drop constraint if exists intercycle_anamnesis_deliveries_status_check;

alter table public.intercycle_anamnesis_deliveries
  add constraint intercycle_anamnesis_deliveries_status_check
  check (status in ('ready','scheduled','sending','sent','responded','failed','cancelled'));

create or replace function public.assert_intercycle_delivery_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'scheduled' and new.status in ('ready','sending','cancelled') then
    return new;
  end if;
  if old.status = 'failed' and new.status in ('ready','sending','scheduled','cancelled') then
    return new;
  end if;
  if old.status = 'sending' and new.status in ('sent','responded','failed','cancelled') then
    return new;
  end if;
  if old.status = 'cancelled' and new.status in ('ready','scheduled') and new.reopened_at is not null then
    return new;
  end if;
  if old.status = 'ready' and new.status in ('scheduled','responded','cancelled') then
    return new;
  end if;
  if old.status = 'sent' and new.status = 'responded' then
    return new;
  end if;

  raise exception 'intercycle_delivery_transition_invalid:%->%', old.status, new.status;
end $$;

revoke all on function public.assert_intercycle_delivery_transition()
from public, anon, authenticated;

create or replace function public.submit_intercycle_anamnesis(
  _token_sha256 text,
  _prescription_evaluation text,
  _goals_continue boolean,
  _new_goals text,
  _availability_changed boolean,
  _available_days text[],
  _session_duration_minutes integer,
  _training_location text,
  _available_equipment text,
  _pain_present boolean,
  _pain_location text,
  _pain_eva integer,
  _pain_started_at text,
  _pain_movement text,
  _additional_information text,
  _sensitive_consent boolean,
  _consent_text_version text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.intercycle_anamnesis_invites%rowtype;
  v_cycle public.training_cycles%rowtype;
  v_delivery public.intercycle_anamnesis_deliveries%rowtype;
  v_answer_id uuid;
  v_row_count integer;
begin
  if _token_sha256 is null or _token_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'intercycle_submit_link_invalid'; end if;
  if _sensitive_consent is distinct from true or coalesce(length(btrim(_consent_text_version)), 0) < 3 then raise exception 'intercycle_submit_consent_required'; end if;
  if _prescription_evaluation not in ('better','same','worse','not_completed') or _goals_continue is null or _availability_changed is null or _pain_present is null then raise exception 'intercycle_submit_payload_invalid'; end if;
  if _pain_present and (_pain_location is null or btrim(_pain_location) = '' or _pain_eva is null or _pain_eva < 0 or _pain_eva > 10) then raise exception 'intercycle_submit_pain_required'; end if;
  if _session_duration_minutes is not null and (_session_duration_minutes < 5 or _session_duration_minutes > 360) then raise exception 'intercycle_submit_payload_invalid'; end if;

  select * into v_invite from public.intercycle_anamnesis_invites where token_sha256 = _token_sha256 for update;
  if not found then raise exception 'intercycle_submit_link_invalid'; end if;
  if v_invite.consumed_at is not null then raise exception 'intercycle_submit_link_replayed'; end if;
  if v_invite.expires_at <= now() then raise exception 'intercycle_submit_link_expired'; end if;

  select * into v_cycle from public.training_cycles
  where id = v_invite.training_cycle_id and company_id = v_invite.company_id and student_id = v_invite.student_id and enrollment_id = v_invite.enrollment_id
  for update;
  if not found or coalesce(v_cycle.status, '') in ('cancelled','superseded') or v_cycle.superseded_at is not null then raise exception 'intercycle_submit_scope_invalid'; end if;

  select * into v_delivery from public.intercycle_anamnesis_deliveries where id = v_invite.delivery_id for update;
  if not found or v_delivery.company_id is distinct from v_invite.company_id or v_delivery.student_id is distinct from v_invite.student_id or v_delivery.enrollment_id is distinct from v_invite.enrollment_id or v_delivery.training_cycle_id is distinct from v_invite.training_cycle_id then raise exception 'intercycle_submit_scope_invalid'; end if;
  if v_delivery.status not in ('ready','sent','sending') then raise exception 'intercycle_submit_delivery_unavailable'; end if;
  if exists (select 1 from public.intercycle_anamneses existing where existing.delivery_id = v_invite.delivery_id) then raise exception 'intercycle_submit_response_duplicate'; end if;

  begin
    insert into public.intercycle_anamneses (
      company_id, student_id, enrollment_id, training_cycle_id, delivery_id,
      prescription_evaluation, goals_continue, new_goals, availability_changed,
      available_days, session_duration_minutes, training_location, available_equipment,
      pain_present, pain_location, pain_eva, pain_started_at, pain_movement,
      additional_information, sensitive_consent, consent_text_version, consented_at
    ) values (
      v_invite.company_id, v_invite.student_id, v_invite.enrollment_id, v_invite.training_cycle_id, v_invite.delivery_id,
      _prescription_evaluation, _goals_continue, case when _goals_continue then null else nullif(btrim(coalesce(_new_goals, '')), '') end,
      _availability_changed, case when _availability_changed then _available_days else null end,
      case when _availability_changed then _session_duration_minutes else null end,
      case when _availability_changed then nullif(btrim(coalesce(_training_location, '')), '') else null end,
      case when _availability_changed then nullif(btrim(coalesce(_available_equipment, '')), '') else null end,
      _pain_present, case when _pain_present then nullif(btrim(coalesce(_pain_location, '')), '') else null end,
      case when _pain_present then _pain_eva else null end,
      case when _pain_present then nullif(btrim(coalesce(_pain_started_at, '')), '') else null end,
      case when _pain_present then nullif(btrim(coalesce(_pain_movement, '')), '') else null end,
      nullif(btrim(coalesce(_additional_information, '')), ''), true, btrim(_consent_text_version), now()
    ) returning id into v_answer_id;
  exception when unique_violation then raise exception 'intercycle_submit_response_duplicate';
  end;

  update public.intercycle_anamnesis_invites set consumed_at = now() where id = v_invite.id and consumed_at is null;
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then raise exception 'intercycle_submit_link_replayed'; end if;

  update public.intercycle_anamnesis_deliveries set status = 'responded', responded_at = now(), next_attempt_at = null, updated_at = now()
  where id = v_invite.delivery_id and status in ('ready','sent','sending');
  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then raise exception 'intercycle_submit_delivery_unavailable'; end if;
  return v_answer_id;
end $$;

revoke all on function public.submit_intercycle_anamnesis(
  text, text, boolean, text, boolean, text[], integer, text, text, boolean, text, integer, text, text, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.submit_intercycle_anamnesis(
  text, text, boolean, text, boolean, text[], integer, text, text, boolean, text, integer, text, text, text, boolean, text
) to service_role;
