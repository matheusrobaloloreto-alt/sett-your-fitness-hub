create table if not exists public.student_recovery_whatsapp_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requested_email_hash text not null,
  request_ip_hash text,
  user_agent_hash text,
  company_id uuid references public.companies(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  result text not null check (
    result in (
      'accepted',
      'reserved',
      'disabled',
      'invalid_request',
      'rate_limited',
      'identity_not_found',
      'identity_ambiguous',
      'auth_user_mismatch',
      'inactive_student',
      'trusted_whatsapp_missing',
      'trusted_whatsapp_ambiguous',
      'whatsapp_instance_unavailable',
      'link_error',
      'provider_error',
      'internal_error'
    )
  ),
  provider_status integer,
  provider_code text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_student_recovery_whatsapp_email_window
  on public.student_recovery_whatsapp_attempts (requested_email_hash, created_at desc);

create index if not exists idx_student_recovery_whatsapp_ip_window
  on public.student_recovery_whatsapp_attempts (request_ip_hash, created_at desc)
  where request_ip_hash is not null;

create index if not exists idx_student_recovery_whatsapp_student_window
  on public.student_recovery_whatsapp_attempts (student_id, created_at desc)
  where student_id is not null;

alter table public.student_recovery_whatsapp_attempts enable row level security;

revoke all on table public.student_recovery_whatsapp_attempts from public, anon, authenticated;
grant select, insert, update on table public.student_recovery_whatsapp_attempts to service_role;

comment on table public.student_recovery_whatsapp_attempts is
  'Sanitized password recovery-by-WhatsApp attempt ledger. Stores keyed hashes and status only; never store email, phone, remote JID, action links, OTPs, provider bodies, or message text here.';

create or replace function public.reserve_student_recovery_whatsapp_attempt(
  p_requested_email_hash text,
  p_request_ip_hash text,
  p_user_agent_hash text
)
returns table (attempt_id uuid, allowed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('sett:recovery:email:' || p_requested_email_hash, 0));
  if p_request_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('sett:recovery:ip:' || p_request_ip_hash, 0));
  end if;

  if (
    select count(*)
    from public.student_recovery_whatsapp_attempts attempt
    where attempt.requested_email_hash = p_requested_email_hash
      and attempt.created_at >= now() - interval '1 hour'
  ) >= 3 or (
    p_request_ip_hash is not null and (
      select count(*)
      from public.student_recovery_whatsapp_attempts attempt
      where attempt.request_ip_hash = p_request_ip_hash
        and attempt.created_at >= now() - interval '1 hour'
    ) >= 10
  ) then
    return query select null::uuid, false;
    return;
  end if;

  insert into public.student_recovery_whatsapp_attempts (
    requested_email_hash, request_ip_hash, user_agent_hash, result
  ) values (
    p_requested_email_hash, p_request_ip_hash, p_user_agent_hash, 'reserved'
  ) returning id into v_attempt_id;

  return query select v_attempt_id, true;
end
$function$;

create or replace function public.bind_student_recovery_whatsapp_attempt(
  p_attempt_id uuid,
  p_company_id uuid,
  p_student_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('sett:recovery:student:' || p_student_id::text, 0));

  if (
    select count(*)
    from public.student_recovery_whatsapp_attempts attempt
    where attempt.student_id = p_student_id
      and attempt.id <> p_attempt_id
      and attempt.created_at >= now() - interval '1 day'
  ) >= 3 then
    return false;
  end if;

  update public.student_recovery_whatsapp_attempts
  set company_id = p_company_id, student_id = p_student_id
  where id = p_attempt_id
    and result = 'reserved'
    and created_at >= now() - interval '10 minutes';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end
$function$;

revoke all on function public.reserve_student_recovery_whatsapp_attempt(text, text, text) from public, anon, authenticated;
revoke all on function public.bind_student_recovery_whatsapp_attempt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_student_recovery_whatsapp_attempt(text, text, text) to service_role;
grant execute on function public.bind_student_recovery_whatsapp_attempt(uuid, uuid, uuid) to service_role;
