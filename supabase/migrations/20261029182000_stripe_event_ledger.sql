-- Stripe v2: claim is durable; business writes + ledger completion commit together.
-- No payload/PII. Legacy uncertain events require operator reconciliation, never blind replay.
begin;
alter table public.integration_webhook_events
  add column if not exists stripe_owner uuid,
  add column if not exists stripe_lease_until timestamptz,
  add column if not exists stripe_created bigint;
alter table public.company_billing
  add column if not exists stripe_last_event_created bigint,
  add column if not exists stripe_last_event_id text;
-- Intentionally fail migration on ambiguous existing mappings; root must reconcile first.
create unique index if not exists company_billing_stripe_subscription_unique
  on public.company_billing(stripe_subscription_id) where stripe_subscription_id is not null;

create or replace function public.stripe_claim_event_v2(
  p_event_id text, p_event_type text, p_created bigint, p_owner uuid
) returns text language plpgsql security invoker set search_path = pg_catalog, public as $$
declare e public.integration_webhook_events%rowtype;
begin
  if p_owner is null or p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9_]+$'
    or p_event_type is null or length(p_event_type)>200 or p_created is null or p_created<=0 then
    raise exception 'Invalid Stripe event identity';
  end if;
  insert into public.integration_webhook_events(provider,event_id,event_type,status,stripe_owner,stripe_lease_until,stripe_created)
    values('stripe',p_event_id,p_event_type,'processing',p_owner,clock_timestamp()+interval '2 minutes',p_created)
    on conflict(provider,event_id) do nothing;
  select * into strict e from public.integration_webhook_events
    where provider='stripe' and event_id=p_event_id for update;
  if e.event_type is distinct from p_event_type or (e.stripe_created is not null and e.stripe_created<>p_created) then
    raise exception 'Stripe event identity mismatch';
  end if;
  if e.status='completed' then return 'completed'; end if;
  if e.stripe_created is null or e.stripe_owner is null then return 'reconcile'; end if;
  if e.status='processing' and e.stripe_lease_until>clock_timestamp() then
    if e.stripe_owner=p_owner then return 'claimed'; end if;
    return 'busy';
  end if;
  update public.integration_webhook_events set status='processing',stripe_owner=p_owner,
    stripe_lease_until=clock_timestamp()+interval '2 minutes',error=null,processed_at=null
    where provider='stripe' and event_id=p_event_id;
  if not found then raise exception 'Stripe claim row count mismatch'; end if;
  return 'claimed';
end $$;

create or replace function public.stripe_fail_event_v2(p_event_id text,p_owner uuid)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  update public.integration_webhook_events set status='failed',error='stripe_processing_failed',
    stripe_lease_until=null,processed_at=clock_timestamp()
    where provider='stripe' and event_id=p_event_id and status='processing'
      and stripe_owner=p_owner and stripe_lease_until>clock_timestamp();
  return found;
end $$;

create or replace function public.stripe_apply_event_v2(
  p_event_id text,p_owner uuid,p_company_id uuid,p_subscription_id text,p_status text,p_tier text
) returns text language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  e public.integration_webhook_events%rowtype;
  b public.company_billing%rowtype;
  affected bigint;
  outcome text := 'applied';
begin
  select * into strict e from public.integration_webhook_events
    where provider='stripe' and event_id=p_event_id for update;
  if e.status<>'processing' or e.stripe_owner is distinct from p_owner or
    e.stripe_lease_until is null or e.stripe_lease_until<=clock_timestamp() or e.stripe_created is null then
    raise exception 'Stripe lease owner lost';
  end if;
  if e.event_type in ('checkout.session.completed','customer.subscription.updated','customer.subscription.deleted','invoice.payment_failed') then
    if p_company_id is null or p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$' then
      raise exception 'Stripe tenant binding missing';
    end if;
    if p_status is null or p_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused') then
      raise exception 'Invalid Stripe subscription status';
    end if;
    if e.event_type='invoice.payment_failed' then
      if p_status<>'past_due' or p_tier is not null then raise exception 'Invalid invoice mutation'; end if;
    elsif p_tier is null or p_tier not in ('basic','intermediate','advanced') then
      raise exception 'Invalid Stripe subscription tier';
    end if;
    if e.event_type='customer.subscription.deleted' and (p_status<>'canceled' or p_tier<>'basic') then
      raise exception 'Invalid cancellation mutation';
    end if;
    -- Serialize binding creation too (no row exists yet); unique index is the final barrier.
    perform pg_advisory_xact_lock(hashtextextended('stripe-sub:'||p_subscription_id,0));
    perform 1 from public.companies where id=p_company_id for update;
    if not found then raise exception 'Stripe company row count mismatch'; end if;
    if exists(select 1 from public.company_billing where stripe_subscription_id=p_subscription_id and company_id<>p_company_id) then
      raise exception 'Stripe tenant binding conflict';
    end if;
    select * into b from public.company_billing where company_id=p_company_id for update;
    if b.company_id is not null and (b.stripe_last_event_created is null or b.stripe_last_event_id is null) then
      raise exception 'Stripe billing baseline requires reconciliation';
    end if;
    -- A coarse event timestamp cannot order two distinct events in the same second.
    -- Do not invent ordering from event IDs. Operator/current-state reconciliation is required.
    if b.stripe_last_event_created=e.stripe_created and b.stripe_last_event_id is distinct from p_event_id then
      raise exception 'Stripe event order requires reconciliation';
    elsif b.stripe_last_event_created>e.stripe_created then
      outcome := 'stale';
    else
      if e.event_type<>'checkout.session.completed' and b.stripe_subscription_id is distinct from p_subscription_id then
        raise exception 'Stripe subscription binding mismatch';
      end if;
      update public.companies set subscription_status=p_status,
        tier=coalesce(p_tier,tier) where id=p_company_id;
      get diagnostics affected = row_count;
      if affected<>1 then raise exception 'Stripe company row count mismatch'; end if;
      insert into public.company_billing(company_id,stripe_subscription_id,stripe_last_event_created,stripe_last_event_id)
        values(p_company_id,p_subscription_id,e.stripe_created,p_event_id)
        on conflict(company_id) do update set stripe_subscription_id=excluded.stripe_subscription_id,
          stripe_last_event_created=excluded.stripe_last_event_created,stripe_last_event_id=excluded.stripe_last_event_id;
      get diagnostics affected = row_count;
      if affected<>1 then raise exception 'Stripe billing row count mismatch'; end if;
    end if;
  else
    if p_company_id is not null or p_subscription_id is not null or p_status is not null or p_tier is not null then
      raise exception 'Unexpected Stripe mutation';
    end if;
    outcome := 'ignored';
  end if;
  update public.integration_webhook_events set status='completed',processed_at=clock_timestamp(),
    error=null,stripe_lease_until=null
    where provider='stripe' and event_id=p_event_id and status='processing' and stripe_owner=p_owner;
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Stripe completion row count mismatch'; end if;
  return outcome;
end $$;

revoke all on function public.stripe_claim_event_v2(text,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.stripe_fail_event_v2(text,uuid) from public,anon,authenticated;
revoke all on function public.stripe_apply_event_v2(text,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.stripe_claim_event_v2(text,text,bigint,uuid) to service_role;
grant execute on function public.stripe_fail_event_v2(text,uuid) to service_role;
grant execute on function public.stripe_apply_event_v2(text,uuid,uuid,text,text,text) to service_role;
commit;
