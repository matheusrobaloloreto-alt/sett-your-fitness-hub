-- Forward only. No provider queries or fabricated delivery acknowledgements.
create table public.webhook_dispatch_owners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  chat_id uuid not null references public.whatsapp_chats(id),
  occurrence text not null check (occurrence ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing' check (status in ('processing','failed','cancelled')),
  dispatch_lease_token uuid,
  dispatch_lease_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique(company_id,chat_id,occurrence)
);
alter table public.webhook_dispatch_owners enable row level security;
revoke all on public.webhook_dispatch_owners from public,anon,authenticated;
grant select on public.webhook_dispatch_owners to service_role;
alter table public.automation_dispatch_attempts drop constraint automation_dispatch_attempts_kind_check;
alter table public.automation_dispatch_attempts add constraint automation_dispatch_attempts_kind_check
  check(kind in ('flow','intercycle','webhook'));

create or replace function public.lock_automation_dispatch_owner(_kind text, _owner_id uuid, _lease_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare valid boolean;
begin
  if _kind = 'flow' then
    perform 1 from public.flow_sessions where id = _owner_id for update;
    select status = 'processing' and dispatch_lease_token = _lease_token
      and dispatch_lease_until > clock_timestamp() into valid
      from public.flow_sessions where id = _owner_id;
  elsif _kind = 'intercycle' then
    perform 1 from public.intercycle_anamnesis_deliveries where id = _owner_id for update;
    select status = 'sending' and dispatch_lease_token = _lease_token
      and dispatch_lease_until > clock_timestamp() into valid
      from public.intercycle_anamnesis_deliveries where id = _owner_id;
  elsif _kind = 'webhook' then
    perform 1 from public.webhook_dispatch_owners where id=_owner_id for update;
    select status='processing' and dispatch_lease_token=_lease_token
      and dispatch_lease_until > clock_timestamp() into valid
      from public.webhook_dispatch_owners where id=_owner_id;
  end if;
  if valid is distinct from true then raise exception 'dispatch_lease_lost'; end if;
end $$;


create function public.claim_webhook_dispatch(_company_id uuid,_chat_id uuid,_occurrence text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.webhook_dispatch_owners; prior text;
begin
  if not exists(select 1 from public.whatsapp_chats c where c.id=_chat_id and c.company_id=_company_id)
    then raise exception 'dispatch_chat_scope_invalid'; end if;
  insert into public.webhook_dispatch_owners(company_id,chat_id,occurrence,dispatch_lease_token,dispatch_lease_until)
    values(_company_id,_chat_id,_occurrence,gen_random_uuid(),clock_timestamp()+interval '15 minutes')
    on conflict do nothing returning * into r;
  if found then return jsonb_build_object('id',r.id,'token',r.dispatch_lease_token,'state','claimed'); end if;
  select * into r from public.webhook_dispatch_owners
    where company_id=_company_id and chat_id=_chat_id and occurrence=_occurrence for update;
  select state into prior from public.automation_dispatch_attempts where kind='webhook' and owner_id=r.id and send_key='text';
  if prior='acked' then return jsonb_build_object('state','acked'); end if;
  if prior is not null or r.status='cancelled' or r.dispatch_lease_until>clock_timestamp()
    then return jsonb_build_object('state','pending'); end if;
  update public.webhook_dispatch_owners set status='processing',dispatch_lease_token=gen_random_uuid(),
    dispatch_lease_until=clock_timestamp()+interval '15 minutes',updated_at=clock_timestamp()
    where id=r.id returning * into r;
  return jsonb_build_object('id',r.id,'token',r.dispatch_lease_token,'state','claimed');
end $$;

create function public.park_webhook_dispatch(_owner_id uuid,_lease_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Same lock order as begin/ACK. Never overwrite a successor's claim.
  perform 1 from public.webhook_dispatch_owners where id=_owner_id for update;
  update public.webhook_dispatch_owners set status='failed',dispatch_lease_until=clock_timestamp(),updated_at=clock_timestamp()
    where id=_owner_id and dispatch_lease_token=_lease_token and status='processing';
end $$;
revoke all on function public.claim_webhook_dispatch(uuid,uuid,text),public.park_webhook_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_webhook_dispatch(uuid,uuid,text),public.park_webhook_dispatch(uuid,uuid) to service_role;

-- Audit contains controlled reason codes only: no phones, tokens, message bodies or free text.
create table public.dispatch_reconciliation_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  source text not null check(source in ('flow','intercycle','webhook')),
  owner_id uuid not null,
  revision integer not null,
  action text not null check(action in ('review','cancel')),
  reason text not null check(reason in ('provider_evidence_required','business_cancelled')),
  actor_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(source,owner_id,revision)
);
alter table public.dispatch_reconciliation_audit enable row level security;
revoke all on public.dispatch_reconciliation_audit from public,anon,authenticated;
grant select on public.dispatch_reconciliation_audit to service_role;

create function public.inspect_company_dispatch_reconciliation(_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_company_staff(auth.uid(),_company_id) then
    raise exception 'Staff company access required' using errcode='42501'; end if;
  with owners as (
    select s.id,'flow'::text source,f.name,s.updated_at,s.status
    from public.flow_sessions s join public.automation_flows f on f.id=s.flow_id
    where f.company_id=_company_id and s.status not in ('completed','cancelled') and
      (s.context->>'dispatch_error'='dispatch_uncertain' or
       ((s.dispatch_lease_until is null or s.dispatch_lease_until<=now()) and exists
         (select 1 from public.automation_dispatch_attempts a where a.kind='flow' and a.owner_id=s.id and a.state='in_flight')))
    union all
    select d.id,'intercycle','Anamnese interciclos',d.updated_at,d.status
    from public.intercycle_anamnesis_deliveries d where d.company_id=_company_id
      and d.status not in ('responded','cancelled','sent') and
      (d.last_error_code='dispatch_uncertain' or
       ((d.dispatch_lease_until is null or d.dispatch_lease_until<=now()) and exists
         (select 1 from public.automation_dispatch_attempts a where a.kind='intercycle' and a.owner_id=d.id and a.state='in_flight')))
    union all
    select w.id,'webhook','Resposta automática',w.updated_at,w.status
    from public.webhook_dispatch_owners w where w.company_id=_company_id and w.status<>'cancelled'
      and (w.status='failed' or w.dispatch_lease_until<=now()) and exists
        (select 1 from public.automation_dispatch_attempts a where a.kind='webhook' and a.owner_id=w.id and a.state='in_flight')
  ), rows as (
    select o.*,coalesce(a.revision,0) revision,a.action last_action,
      (select count(*) from public.automation_dispatch_attempts d where d.kind=o.source and d.owner_id=o.id and d.state='acked') ack_count,
      (select count(*) from public.automation_dispatch_attempts d where d.kind=o.source and d.owner_id=o.id and d.state='in_flight') unknown_count
    from owners o left join lateral
      (select revision,action from public.dispatch_reconciliation_audit a where a.source=o.source and a.owner_id=o.id and a.company_id=_company_id order by revision desc limit 1) a on true
    order by o.updated_at desc nulls last,o.id limit 50
  ) select coalesce(jsonb_agg(to_jsonb(rows)),'[]') into result from rows;
  return result;
end $$;

create function public.review_company_dispatch_reconciliation(_company_id uuid,_source text,_owner_id uuid,
  _expected_revision integer,_expected_updated_at timestamptz,_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stamp timestamptz; state text; rev integer; result jsonb;
begin
  if auth.uid() is null or not public.is_company_staff(auth.uid(),_company_id) then
    raise exception 'Staff company access required' using errcode='42501'; end if;
  if _action is null or _action not in ('review','cancel') then raise exception 'dispatch_action_invalid'; end if;
  if _source='flow' then
    select s.updated_at,s.status into stamp,state from public.flow_sessions s join public.automation_flows f on f.id=s.flow_id
      where s.id=_owner_id and f.company_id=_company_id for update of s;
  elsif _source='intercycle' then
    select updated_at,status into stamp,state from public.intercycle_anamnesis_deliveries
      where id=_owner_id and company_id=_company_id for update;
  elsif _source='webhook' then
    select updated_at,status into stamp,state from public.webhook_dispatch_owners
      where id=_owner_id and company_id=_company_id for update;
  else raise exception 'dispatch_source_invalid'; end if;
  if not found then raise exception 'dispatch_owner_unavailable' using errcode='42501'; end if;
  select coalesce(max(revision),0) into rev from public.dispatch_reconciliation_audit where source=_source and owner_id=_owner_id;
  if _expected_revision is null or rev<>_expected_revision or stamp is distinct from _expected_updated_at then
    raise exception 'dispatch_review_conflict' using errcode='PT409'; end if;
  -- Use the same evidence/status predicate as the staff projection, under owner lock.
  if not exists(select 1 from jsonb_array_elements(public.inspect_company_dispatch_reconciliation(_company_id)) x
    where x->>'id'=_owner_id::text and x->>'source'=_source) then
    raise exception 'dispatch_case_no_longer_uncertain' using errcode='PT409'; end if;
  if _action='cancel' then
    if _source='flow' then
      update public.flow_sessions set status='cancelled',dispatch_lease_token=null,dispatch_lease_until=null,updated_at=clock_timestamp()
        where id=_owner_id;
    elsif _source='webhook' then
      update public.webhook_dispatch_owners set status='cancelled',dispatch_lease_token=null,dispatch_lease_until=null,updated_at=clock_timestamp()
        where id=_owner_id;
    else
      -- Retain failed/dispatch_uncertain and the invite unchanged. That status
      -- already prevents sends and still permits a valid student response.
      update public.intercycle_anamnesis_deliveries set dispatch_lease_token=null,dispatch_lease_until=null,
        next_attempt_at=null,last_error_code='dispatch_uncertain',status='failed',updated_at=clock_timestamp() where id=_owner_id;
    end if;
  end if;
  insert into public.dispatch_reconciliation_audit(company_id,source,owner_id,revision,action,reason,actor_id)
    values(_company_id,_source,_owner_id,rev+1,_action,
      case when _action='review' then 'provider_evidence_required' else 'business_cancelled' end,auth.uid());
  result=jsonb_build_object('revision',rev+1,'action',_action,'provider_resolution','pending_technical');
  return result;
end $$;
revoke all on function public.inspect_company_dispatch_reconciliation(uuid),
  public.review_company_dispatch_reconciliation(uuid,text,uuid,integer,timestamptz,text) from public,anon;
grant execute on function public.inspect_company_dispatch_reconciliation(uuid),
  public.review_company_dispatch_reconciliation(uuid,text,uuid,integer,timestamptz,text) to authenticated;
