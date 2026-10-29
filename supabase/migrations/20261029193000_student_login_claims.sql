-- Login remains the existing explicit generate/reset flow. No password, token, phone,
-- message body or invitation is stored. Uncertain external effects require reconciliation.
begin;
create table public.student_login_access_claims (
  nonce uuid primary key,
  purpose text not null check (purpose in ('generate','send')),
  actor_id uuid not null,
  company_id uuid not null,
  student_id uuid not null,
  student_version timestamptz not null,
  chat_id uuid,
  status text not null default 'claimed' check(status in ('claimed','completed','reconciled')),
  claimed_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz not null default clock_timestamp()+interval '2 minutes',
  completed_at timestamptz
);
create index student_login_claims_student on public.student_login_access_claims(company_id,student_id,status);
alter table public.student_login_access_claims enable row level security;
revoke all on public.student_login_access_claims from public,anon,authenticated;
grant all on public.student_login_access_claims to service_role;

create function public.claim_student_login_access_v1(
 p_purpose text,p_actor_id uuid,p_company_id uuid,p_student_id uuid,p_chat_id uuid,p_nonce uuid,
 p_expected_student_updated_at timestamptz,p_expected_remote_jid text,p_expected_chat_student_id uuid,p_expected_instance_id uuid
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare affected bigint;
begin
 if p_purpose not in ('generate','send') or p_purpose is null or p_actor_id is null or p_nonce is null or p_expected_student_updated_at is null then
  raise exception 'student_login_claim_invalid' using errcode='22023';
 end if;
 if not exists(select 1 from public.user_roles where user_id=p_actor_id and role::text in ('admin','master','coordinator','trainer'))
 or (not exists(select 1 from public.user_roles where user_id=p_actor_id and role::text='master')
     and not exists(select 1 from public.company_members where user_id=p_actor_id and company_id=p_company_id)) then
  raise exception 'student_login_claim_forbidden' using errcode='42501';
 end if;
 -- All claims for a student serialize on the same row, before any chat/nonce lock.
 perform 1 from public.students where id=p_student_id and company_id=p_company_id
  and updated_at is not distinct from p_expected_student_updated_at for update;
 if not found then return false; end if;
 if p_chat_id is null then
  if p_expected_remote_jid is not null or p_expected_chat_student_id is not null or p_expected_instance_id is not null
    or exists(select 1 from public.whatsapp_chats where student_id=p_student_id and company_id=p_company_id) then return false; end if;
 else
  perform 1 from public.whatsapp_chats where id=p_chat_id and company_id=p_company_id and student_id=p_student_id
    and student_id is not distinct from p_expected_chat_student_id
    and remote_jid is not distinct from p_expected_remote_jid
    and instance_id is not distinct from p_expected_instance_id for update;
  if not found then return false; end if;
 end if;
 -- Expired, uncompleted external work is uncertain, NOT permission to replay it.
 -- Completed generation also fences concurrent distinct preflights on the same version
 -- for their two-minute validity window. A new, later explicit action is separate work.
 if exists(select 1 from public.student_login_access_claims where company_id=p_company_id and student_id=p_student_id
   and (status='claimed' or (p_purpose='generate' and purpose='generate' and student_version=p_expected_student_updated_at and lease_until>clock_timestamp() and status='completed'))) then return false; end if;
 insert into public.student_login_access_claims(nonce,purpose,actor_id,company_id,student_id,student_version,chat_id)
 values(p_nonce,p_purpose,p_actor_id,p_company_id,p_student_id,p_expected_student_updated_at,p_chat_id)
 on conflict(nonce) do nothing;
 get diagnostics affected=row_count;
 return affected=1;
end $$;

create function public.claim_student_login_generation_v1(
 p_actor_id uuid,p_company_id uuid,p_student_id uuid,p_chat_id uuid,p_nonce uuid,
 p_expected_student_updated_at timestamptz,p_expected_remote_jid text,p_expected_chat_student_id uuid,p_expected_instance_id uuid
) returns boolean language sql security invoker set search_path=pg_catalog,public as $$
 select public.claim_student_login_access_v1('generate',p_actor_id,p_company_id,p_student_id,p_chat_id,p_nonce,p_expected_student_updated_at,p_expected_remote_jid,p_expected_chat_student_id,p_expected_instance_id);
$$;
create function public.claim_student_login_send_v1(
 p_actor_id uuid,p_company_id uuid,p_student_id uuid,p_chat_id uuid,p_nonce uuid,
 p_expected_student_updated_at timestamptz,p_expected_remote_jid text,p_expected_chat_student_id uuid,p_expected_instance_id uuid
) returns boolean language sql security invoker set search_path=pg_catalog,public as $$
 select public.claim_student_login_access_v1('send',p_actor_id,p_company_id,p_student_id,p_chat_id,p_nonce,p_expected_student_updated_at,p_expected_remote_jid,p_expected_chat_student_id,p_expected_instance_id);
$$;

create function public.complete_student_login_claim_v1(
 p_actor_id uuid,p_company_id uuid,p_student_id uuid,p_nonce uuid,p_expected_student_updated_at timestamptz,p_expected_user_id uuid
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform 1 from public.students where id=p_student_id and company_id=p_company_id
  and updated_at is not distinct from p_expected_student_updated_at and user_id is not distinct from p_expected_user_id for update;
 if not found then return false; end if;
 update public.student_login_access_claims set status='completed',completed_at=clock_timestamp()
  where nonce=p_nonce and actor_id=p_actor_id and company_id=p_company_id and student_id=p_student_id and status='claimed';
 return found;
end $$;

revoke all on function public.claim_student_login_access_v1(text,uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_student_login_generation_v1(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_student_login_send_v1(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_student_login_claim_v1(uuid,uuid,uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.claim_student_login_access_v1(text,uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid) to service_role;
grant execute on function public.claim_student_login_generation_v1(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid) to service_role;
grant execute on function public.claim_student_login_send_v1(uuid,uuid,uuid,uuid,uuid,timestamptz,text,uuid,uuid) to service_role;
grant execute on function public.complete_student_login_claim_v1(uuid,uuid,uuid,uuid,timestamptz,uuid) to service_role;
commit;
-- Rollback: stop login generation/send entrypoints first. Do not delete claims or expire
-- uncertain ones to enable replay. Keep this additive ledger for operator reconciliation;
-- dropping it is not an operational rollback and requires a separately reviewed action.
