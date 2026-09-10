-- Fail-closed rollback for reconcile-bn-18-orphan-card-payments-apply.sql.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-orphan-card-payments:20260909', 0));

lock table public.payments in share row exclusive mode;
lock table public.payment_recovery_events in share row exclusive mode;
lock table public.payment_orphan_reconciliation_audit in share row exclusive mode;

do $preflight$
begin
  if (select count(*) from public.payment_orphan_reconciliation_audit where repair_key='bn_18_orphan_card_payments_20260909' and state='applied' and payment_deleted) <> 18 then
    raise exception 'bn_orphan_payment_rollback_audit_count_mismatch';
  end if;

  if exists (
    select 1 from public.payment_orphan_reconciliation_audit audit
    join public.payments payment on payment.id=audit.payment_id
    where audit.repair_key='bn_18_orphan_card_payments_20260909' and audit.state='applied'
  ) then raise exception 'bn_orphan_payment_rollback_target_reappeared'; end if;

  if exists (
    select 1
    from public.payment_orphan_reconciliation_audit audit
    cross join lateral (
      select coalesce(jsonb_agg(to_jsonb(event) order by event.id), '[]'::jsonb) rows
      from jsonb_array_elements(audit.recovery_events_before) before_event
      join public.payment_recovery_events event on event.id=(before_event->>'id')::uuid
    ) current_events
    cross join lateral (
      select jsonb_agg(to_jsonb(payment) order by payment.id) rows
      from public.payments payment where payment.id=any(audit.canonical_payment_ids)
    ) current_canonical
    where audit.repair_key='bn_18_orphan_card_payments_20260909'
      and audit.state='applied'
      and (
        encode(extensions.digest(current_events.rows::text,'sha256'),'hex') is distinct from audit.recovery_events_after_sha256
        or encode(extensions.digest(current_canonical.rows::text,'sha256'),'hex') is distinct from audit.canonical_after_sha256
      )
  ) then raise exception 'bn_orphan_payment_rollback_after_hash_mismatch'; end if;

  if (select tgenabled from pg_trigger where tgrelid='public.payments'::regclass and tgname='trg_record_payment_recovery_from_payment') <> 'O' then
    raise exception 'bn_orphan_payment_rollback_trigger_not_enabled';
  end if;
end
$preflight$;

alter table public.payments disable trigger trg_record_payment_recovery_from_payment;

insert into public.payments
select (jsonb_populate_record(null::public.payments, audit.payment_before)).*
from public.payment_orphan_reconciliation_audit audit
where audit.repair_key='bn_18_orphan_card_payments_20260909'
  and audit.state='applied'
order by audit.payment_id;

alter table public.payments enable trigger trg_record_payment_recovery_from_payment;

update public.payment_recovery_events event
set payment_id = audit.payment_id
from public.payment_orphan_reconciliation_audit audit,
     lateral jsonb_array_elements(audit.recovery_events_before) before_event
where audit.repair_key='bn_18_orphan_card_payments_20260909'
  and audit.state='applied'
  and event.id=(before_event->>'id')::uuid
  and event.payment_id is null;

do $postflight$
declare
  v_payment_hash text;
  v_event_hash text;
  v_restored_payments integer;
  v_restored_events integer;
begin
  select count(*) into v_restored_payments
  from public.payments payment
  join public.payment_orphan_reconciliation_audit audit on audit.payment_id=payment.id
  where audit.repair_key='bn_18_orphan_card_payments_20260909' and audit.state='applied';
  if v_restored_payments <> 18 then
    raise exception 'bn_orphan_payment_rollback_payment_count_mismatch actual=%',v_restored_payments;
  end if;

  select encode(extensions.digest(string_agg(to_jsonb(payment)::text,E'\n' order by payment.id),'sha256'),'hex')
  into v_payment_hash
  from public.payments payment
  join public.payment_orphan_reconciliation_audit audit on audit.payment_id=payment.id
  where audit.repair_key='bn_18_orphan_card_payments_20260909' and audit.state='applied';
  if v_payment_hash is distinct from '5c2756977a8a69fedda9b711db6a28da94aa7e6aca52553c76de4661328af243' then
    raise exception 'bn_orphan_payment_rollback_payment_hash_mismatch actual=%',v_payment_hash;
  end if;

  select count(*) into v_restored_events
  from public.payment_recovery_events event
  join public.payment_orphan_reconciliation_audit audit on audit.payment_id=event.payment_id
  where audit.repair_key='bn_18_orphan_card_payments_20260909' and audit.state='applied';
  if v_restored_events <> 19 then
    raise exception 'bn_orphan_payment_rollback_event_count_mismatch actual=%',v_restored_events;
  end if;

  select encode(extensions.digest(string_agg(to_jsonb(event)::text,E'\n' order by event.id),'sha256'),'hex')
  into v_event_hash
  from public.payment_recovery_events event
  join public.payment_orphan_reconciliation_audit audit on audit.payment_id=event.payment_id
  where audit.repair_key='bn_18_orphan_card_payments_20260909' and audit.state='applied';
  if v_event_hash is distinct from '78dd05de6b96c84ceb7841beafb23bb341abffd905781c0acd4583654f7a366b' then
    raise exception 'bn_orphan_payment_rollback_event_hash_mismatch actual=%',v_event_hash;
  end if;

  if (select count(*) from public.payments payment join public.companies company on company.id=payment.company_id where company.slug='bn-performance-training') <> 143 then
    raise exception 'bn_orphan_payment_rollback_global_count_mismatch';
  end if;
end
$postflight$;

update public.payment_orphan_reconciliation_audit
set state='rolled_back', rolled_back_at=now()
where repair_key='bn_18_orphan_card_payments_20260909' and state='applied';

select jsonb_build_object('repair_key','bn_18_orphan_card_payments_20260909','restored_payments',18,'restored_recovery_events',19) as result;

commit;
