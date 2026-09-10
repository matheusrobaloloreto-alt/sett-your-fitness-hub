-- Explicit, append-only consent evidence for proactive weekly WhatsApp contact.
-- Existing boolean opt-ins are quarantined and disabled; they are not consent.

begin;

set local lock_timeout='8s';
set local statement_timeout='120s';
select pg_advisory_xact_lock(hashtextextended('sett:weekly-contact-consent-ledger:v1',0));
lock table public.students in share row exclusive mode;
lock table public.flow_sessions in share row exclusive mode;

-- Rollout phase 2 runs only after the consent-aware Edge dispatcher is live.
-- Fail closed every session created under the legacy boolean-only contract
-- before installing any path that can create new weekly-contact sessions.
update public.flow_sessions
set status='failed',
    context=coalesce(context,'{}'::jsonb)||jsonb_build_object(
      'dispatch_error','weekly_contact_consent_reconfirmation_required',
      'next_dispatch_at',null
    ),
    updated_at=now()
where context->>'trigger_type'='weekly_contact'
  and status in ('active','waiting_response','processing');

create table if not exists public.weekly_contact_consent_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique not null,
  student_id uuid not null references public.students(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  channel text not null default 'whatsapp' check (channel='whatsapp'),
  purpose text not null default 'weekly_training_support' check (purpose='weekly_training_support'),
  event_type text not null check (event_type in ('granted','revoked')),
  policy_version text not null,
  source text not null check (source in ('staff_confirmed_student')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default now()
);

create index if not exists weekly_contact_consent_events_latest_idx
  on public.weekly_contact_consent_events(student_id,company_id,sequence desc);

create table if not exists public.weekly_contact_legacy_opt_in_quarantine (
  student_id uuid primary key references public.students(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  previous_enabled boolean not null check (previous_enabled),
  quarantined_at timestamptz not null default now()
);

insert into public.weekly_contact_legacy_opt_in_quarantine(student_id,company_id,previous_enabled)
select student.id,student.company_id,true
from public.students student
where student.weekly_contact_enabled=true
on conflict (student_id) do nothing;

-- Fail closed without manufacturing a grant or revocation event.
update public.students
set weekly_contact_enabled=false
where weekly_contact_enabled=true;

alter table public.weekly_contact_consent_events enable row level security;
alter table public.weekly_contact_legacy_opt_in_quarantine enable row level security;

create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
create table if not exists private.weekly_contact_boolean_write_authorizations (
  transaction_id bigint not null,
  backend_pid integer not null,
  student_id uuid not null,
  primary key(transaction_id,backend_pid,student_id)
);
revoke all on table private.weekly_contact_boolean_write_authorizations
from public,anon,authenticated,service_role;

revoke all on table public.weekly_contact_consent_events from public,anon,authenticated;
grant select on table public.weekly_contact_consent_events to authenticated;
revoke all on table public.weekly_contact_legacy_opt_in_quarantine from public,anon,authenticated;

drop policy if exists weekly_contact_consent_events_staff_read on public.weekly_contact_consent_events;
create policy weekly_contact_consent_events_staff_read
on public.weekly_contact_consent_events for select to authenticated
using (public.can_manage_staff_student(company_id,student_id));

create or replace function public.weekly_contact_policy_version()
returns text
language sql
immutable
set search_path=pg_catalog
as $$ select 'weekly-training-support-v1-2026-09-10'::text $$;

create or replace function public.guard_weekly_contact_consent_event()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_company_id uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'weekly_contact_consent_events_append_only' using errcode='55000';
  end if;

  select student.company_id into v_company_id
  from public.students student
  where student.id=new.student_id;
  if v_company_id is null or v_company_id is distinct from new.company_id then
    raise exception 'weekly_contact_consent_student_company_mismatch' using errcode='23514';
  end if;
  if new.policy_version is distinct from public.weekly_contact_policy_version() then
    raise exception 'weekly_contact_consent_policy_version_not_current' using errcode='23514';
  end if;
  if new.occurred_at is distinct from statement_timestamp() then
    raise exception 'weekly_contact_consent_occurred_at_must_be_server_owned' using errcode='23514';
  end if;
  return new;
end
$$;

drop trigger if exists guard_weekly_contact_consent_event on public.weekly_contact_consent_events;
create trigger guard_weekly_contact_consent_event
before insert or update or delete on public.weekly_contact_consent_events
for each row execute function public.guard_weekly_contact_consent_event();

create or replace function public.guard_weekly_contact_boolean_write()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.weekly_contact_enabled is distinct from old.weekly_contact_enabled then
    delete from private.weekly_contact_boolean_write_authorizations permit
    where permit.transaction_id=txid_current()
      and permit.backend_pid=pg_backend_pid()
      and permit.student_id=new.id;
    if not found then
      raise exception 'weekly_contact_enabled_requires_consent_rpc' using errcode='55000';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists guard_weekly_contact_boolean_write on public.students;
create trigger guard_weekly_contact_boolean_write
before update of weekly_contact_enabled on public.students
for each row execute function public.guard_weekly_contact_boolean_write();

create or replace function public.weekly_contact_consent_is_current(
  _student_id uuid,
  _company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce((
    select event.event_type='granted'
      and event.policy_version=public.weekly_contact_policy_version()
      and student.weekly_contact_enabled=true
    from public.weekly_contact_consent_events event
    join public.students student
      on student.id=event.student_id and student.company_id=event.company_id
    where event.student_id=_student_id
      and event.company_id=_company_id
      and event.channel='whatsapp'
      and event.purpose='weekly_training_support'
    order by event.sequence desc
    limit 1
  ),false)
$$;

create or replace function public.record_weekly_contact_consent(
  _student_id uuid,
  _event_type text,
  _policy_version text,
  _source text
)
returns public.weekly_contact_consent_events
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_student public.students%rowtype;
  v_event public.weekly_contact_consent_events%rowtype;
  v_enabled boolean;
begin
  if v_actor is null then
    raise exception 'weekly_contact_consent_auth_required' using errcode='42501';
  end if;
  if _event_type not in ('granted','revoked') then
    raise exception 'weekly_contact_consent_event_invalid' using errcode='22023';
  end if;
  if _policy_version is distinct from public.weekly_contact_policy_version() then
    raise exception 'weekly_contact_consent_policy_version_not_current' using errcode='22023';
  end if;
  if _source is distinct from 'staff_confirmed_student' then
    raise exception 'weekly_contact_consent_source_invalid' using errcode='22023';
  end if;

  select student.* into v_student
  from public.students student
  where student.id=_student_id
  for update;
  if v_student.id is null or not public.can_manage_staff_student(v_student.company_id,v_student.id) then
    raise exception 'weekly_contact_consent_forbidden' using errcode='42501';
  end if;

  insert into public.weekly_contact_consent_events(
    student_id,company_id,channel,purpose,event_type,policy_version,source,actor_user_id,
    occurred_at,created_at
  ) values (
    v_student.id,v_student.company_id,'whatsapp','weekly_training_support',_event_type,
    _policy_version,_source,v_actor,statement_timestamp(),now()
  ) returning * into v_event;

  v_enabled := (_event_type='granted');
  if v_student.weekly_contact_enabled is distinct from v_enabled then
    insert into private.weekly_contact_boolean_write_authorizations(
      transaction_id,backend_pid,student_id
    ) values(txid_current(),pg_backend_pid(),v_student.id);
    update public.students
    set weekly_contact_enabled=v_enabled
    where id=v_student.id and company_id=v_student.company_id;
    if exists(
      select 1 from private.weekly_contact_boolean_write_authorizations permit
      where permit.transaction_id=txid_current()
        and permit.backend_pid=pg_backend_pid()
        and permit.student_id=v_student.id
    ) then
      raise exception 'weekly_contact_boolean_authorization_not_consumed' using errcode='55000';
    end if;
  end if;

  return v_event;
end
$$;

create or replace function public.weekly_contact_consent_status(_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_company_id uuid;
begin
  select student.company_id into v_company_id
  from public.students student
  where student.id=_student_id;
  if auth.uid() is null
     or v_company_id is null
     or not public.can_manage_staff_student(v_company_id,_student_id) then
    raise exception 'weekly_contact_consent_status_forbidden' using errcode='42501';
  end if;
  return jsonb_build_object(
    'eligible',public.weekly_contact_consent_is_current(_student_id,v_company_id),
    'policy_version',public.weekly_contact_policy_version()
  );
end
$$;

revoke execute on function public.weekly_contact_policy_version() from public,anon;
grant execute on function public.weekly_contact_policy_version() to authenticated,service_role;
revoke execute on function public.weekly_contact_consent_is_current(uuid,uuid) from public,anon,authenticated;
grant execute on function public.weekly_contact_consent_is_current(uuid,uuid) to service_role;
revoke execute on function public.record_weekly_contact_consent(uuid,text,text,text) from public,anon;
grant execute on function public.record_weekly_contact_consent(uuid,text,text,text) to authenticated;
revoke execute on function public.weekly_contact_consent_status(uuid) from public,anon;
grant execute on function public.weekly_contact_consent_status(uuid) to authenticated;

create or replace function public.process_automation_triggers()
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_no_workout integer := 0; v_payment_pending integer := 0; v_cart_recovery integer := 0;
  v_weekly_contact integer := 0; v_abandoned integer := 0;
begin
  select public.mark_payment_recovery_abandoned() into v_abandoned;

  with candidates as (
    select f.id as flow_id,c.id as chat_id,public.get_automation_start_node(f.id) as start_node_id,
      s.id as student_id,s.full_name as student_name,
      max(coalesce(ws.completed_at,ws.session_date::timestamptz)) as last_completed_at
    from public.automation_flows f join public.students s on s.company_id=f.company_id
    join public.whatsapp_chats c on c.company_id=f.company_id and c.student_id=s.id
    left join public.workout_sessions ws on ws.student_id=s.id and ws.status='completed'
    where f.is_active=true and f.trigger_type='no_workout_7d'
      and coalesce(s.status,'') in ('active','awaiting_training','awaiting_renewal')
      and exists(select 1 from public.enrollments e where e.student_id=s.id and e.status in ('active','awaiting_training')
        and coalesce(e.training_start_date,e.start_date,e.created_at::date)<=current_date-7)
    group by f.id,c.id,s.id,s.full_name
    having coalesce(max(coalesce(ws.completed_at,ws.session_date::timestamptz)),'-infinity'::timestamptz)<now()-interval '7 days'
  ), inserted as (
    insert into public.flow_sessions(flow_id,chat_id,current_node_id,status,context,started_at,last_activity_at,created_at,updated_at)
    select c.flow_id,c.chat_id,c.start_node_id,'active',jsonb_build_object('trigger_type','no_workout_7d','automation_key','no_workout_7d:'||c.student_id::text,'student_id',c.student_id,'student_name',c.student_name,'last_completed_at',c.last_completed_at),now(),now(),now(),now()
    from candidates c where not exists(select 1 from public.flow_sessions fs where fs.flow_id=c.flow_id and fs.chat_id=c.chat_id and fs.status in ('active','waiting_response') and fs.context->>'automation_key'='no_workout_7d:'||c.student_id::text)
      and not exists(select 1 from public.flow_sessions fs where fs.flow_id=c.flow_id and fs.chat_id=c.chat_id and fs.context->>'automation_key'='no_workout_7d:'||c.student_id::text and coalesce(fs.updated_at,fs.created_at)>now()-interval '6 days') returning 1
  ) select count(*) into v_no_workout from inserted;

  with candidates as (
    select distinct on(f.id,c.id,s.id) f.id as flow_id,c.id as chat_id,public.get_automation_start_node(f.id) as start_node_id,
      s.id as student_id,s.full_name as student_name,e.id as enrollment_id,coalesce(e.payment_status,'pending') as payment_status,p.id as payment_id,p.status as provider_status
    from public.automation_flows f join public.students s on s.company_id=f.company_id
    join public.whatsapp_chats c on c.company_id=f.company_id and c.student_id=s.id
    left join public.enrollments e on e.student_id=s.id and e.status in ('active','awaiting_training','awaiting_renewal')
    left join public.payments p on p.student_id=s.id and coalesce(p.status,'PENDING') not in ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')
    where f.is_active=true and f.trigger_type='payment_pending' and(coalesce(e.payment_status,'') in ('pending','overdue') or p.id is not null)
    order by f.id,c.id,s.id,p.created_at desc nulls last,e.created_at desc nulls last
  ), inserted as (
    insert into public.flow_sessions(flow_id,chat_id,current_node_id,status,context,started_at,last_activity_at,created_at,updated_at)
    select c.flow_id,c.chat_id,c.start_node_id,'active',jsonb_build_object('trigger_type','payment_pending','automation_key','payment_pending:'||c.student_id::text||':'||coalesce(c.enrollment_id::text,c.payment_id::text,'open'),'student_id',c.student_id,'student_name',c.student_name,'enrollment_id',c.enrollment_id,'payment_id',c.payment_id,'payment_status',c.payment_status,'provider_status',c.provider_status),now(),now(),now(),now()
    from candidates c where not exists(select 1 from public.flow_sessions fs where fs.flow_id=c.flow_id and fs.chat_id=c.chat_id and fs.status in ('active','waiting_response') and fs.context->>'automation_key'='payment_pending:'||c.student_id::text||':'||coalesce(c.enrollment_id::text,c.payment_id::text,'open'))
      and not exists(select 1 from public.flow_sessions fs where fs.flow_id=c.flow_id and fs.chat_id=c.chat_id and fs.context->>'automation_key'='payment_pending:'||c.student_id::text||':'||coalesce(c.enrollment_id::text,c.payment_id::text,'open') and coalesce(fs.updated_at,fs.created_at)>now()-interval '1 day') returning 1
  ) select count(*) into v_payment_pending from inserted;

  with candidates as (
    select f.id as flow_id,c.id as chat_id,public.get_automation_start_node(f.id) as start_node_id,s.id as student_id,s.full_name as student_name,e.id as event_id,e.plan_id,e.payment_id,e.enrollment_id
    from public.payment_recovery_events e join public.students s on s.id=e.student_id
    join public.automation_flows f on f.company_id=e.company_id join public.whatsapp_chats c on c.company_id=e.company_id and c.student_id=e.student_id
    where e.event_type='payment_abandoned' and f.is_active=true and f.trigger_type='payment_pending'
      and not exists(select 1 from public.payment_recovery_events done where done.student_id=e.student_id and done.event_type='payment_completed' and done.occurred_at>=e.occurred_at)
  ), inserted as (
    insert into public.flow_sessions(flow_id,chat_id,current_node_id,status,context,started_at,last_activity_at,created_at,updated_at)
    select c.flow_id,c.chat_id,c.start_node_id,'active',jsonb_build_object('trigger_type','payment_pending','recovery_type','cart_abandoned','automation_key','cart_abandoned:'||c.event_id::text,'student_id',c.student_id,'student_name',c.student_name,'recovery_event_id',c.event_id,'plan_id',c.plan_id,'payment_id',c.payment_id,'enrollment_id',c.enrollment_id),now(),now(),now(),now()
    from candidates c where not exists(select 1 from public.flow_sessions fs where fs.flow_id=c.flow_id and fs.chat_id=c.chat_id and fs.context->>'automation_key'='cart_abandoned:'||c.event_id::text) returning 1
  ) select count(*) into v_cart_recovery from inserted;

  with candidates as (
    select f.id as flow_id,c.id as chat_id,public.get_automation_start_node(f.id) as start_node_id,s.id as student_id,s.full_name as student_name,
      coalesce(max(fs.created_at),'-infinity'::timestamptz) as last_weekly_contact_at,
      count(fs.id) filter(where fs.created_at>now()-interval '7 days') as contacts_last_7d
    from public.automation_flows f join public.students s on s.company_id=f.company_id
    join public.whatsapp_chats c on c.company_id=f.company_id and c.student_id=s.id
    left join public.flow_sessions fs on fs.flow_id=f.id and fs.chat_id=c.id and fs.context->>'trigger_type'='weekly_contact'
    where f.is_active=true and f.trigger_type='weekly_contact'
      and public.weekly_contact_consent_is_current(s.id,s.company_id)
      and c.remote_jid like '%@s.whatsapp.net'
      and public.sett_phone_key(split_part(c.remote_jid,'@',1)) is not null
      and public.sett_phone_key(split_part(c.remote_jid,'@',1)) in (
        public.sett_phone_key(s.whatsapp),public.sett_phone_key(s.phone)
      )
      and coalesce(s.status,'') in ('active','awaiting_training')
      and exists(select 1 from public.enrollments e where e.student_id=s.id and e.status in ('active','awaiting_training'))
    group by f.id,c.id,s.id,s.full_name
    having count(fs.id) filter(where fs.created_at>now()-interval '7 days')<2
      and coalesce(max(fs.created_at),'-infinity'::timestamptz)<now()-interval '72 hours'
  ), inserted as (
    insert into public.flow_sessions(flow_id,chat_id,current_node_id,status,context,started_at,last_activity_at,created_at,updated_at)
    select c.flow_id,c.chat_id,c.start_node_id,'active',jsonb_build_object('trigger_type','weekly_contact','automation_key','weekly_contact:'||c.student_id::text||':'||to_char(date_trunc('week',now()),'IYYY-IW')||':'||(c.contacts_last_7d+1)::text,'student_id',c.student_id,'student_name',c.student_name,'contact_objective','Perguntar se o aluno teve dificuldade no treino e se quer mandar video para correcao.','copy_seed',floor(extract(epoch from now())/3600)::bigint,'copy_guidance',jsonb_build_array('Manter o mesmo objetivo, mas variar abertura, ritmo e pergunta final.','Nao soar automatico; mencionar treino, dificuldade ou video de execucao.','Ser curto, humano e acionavel.'),'contacts_last_7d_before',c.contacts_last_7d,'last_weekly_contact_at',c.last_weekly_contact_at),now(),now(),now(),now()
    from candidates c where not exists(select 1 from public.flow_sessions fs where fs.flow_id=c.flow_id and fs.chat_id=c.chat_id and fs.status in ('active','waiting_response') and fs.context->>'trigger_type'='weekly_contact') returning 1
  ) select count(*) into v_weekly_contact from inserted;

  return jsonb_build_object('no_workout_7d',v_no_workout,'payment_pending',v_payment_pending,'cart_recovery',v_cart_recovery,'weekly_contact',v_weekly_contact,'abandoned_events_created',v_abandoned);
end
$$;

revoke execute on function public.process_automation_triggers() from public,anon,authenticated;
grant execute on function public.process_automation_triggers() to service_role;

commit;
