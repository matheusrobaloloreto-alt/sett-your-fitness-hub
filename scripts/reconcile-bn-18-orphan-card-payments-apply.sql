-- Remove 18 orphan local credit-card placeholders after reconciliation with
-- the authenticated Asaas export. Provider-backed payments remain untouched.
-- Every deleted row and linked recovery event is retained in a private audit
-- table and can be restored by the fail-closed rollback companion.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:bn-orphan-card-payments:20260909', 0));

create table if not exists public.payment_orphan_reconciliation_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  export_sha256 text not null,
  provider_evidence jsonb not null,
  company_id uuid not null,
  student_id uuid not null,
  payment_id uuid not null,
  canonical_payment_ids uuid[] not null,
  payment_before jsonb not null,
  recovery_events_before jsonb not null,
  canonical_before jsonb not null,
  payment_before_sha256 text not null,
  recovery_events_before_sha256 text not null,
  canonical_before_sha256 text not null,
  payment_deleted boolean not null default false,
  recovery_events_after jsonb,
  recovery_events_after_sha256 text,
  canonical_after_sha256 text,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (repair_key, payment_id)
);

alter table public.payment_orphan_reconciliation_audit enable row level security;
revoke all on table public.payment_orphan_reconciliation_audit from public, anon, authenticated;
grant select, insert, update on table public.payment_orphan_reconciliation_audit to service_role;

lock table public.companies in share mode;
lock table public.students in share mode;
lock table public.enrollments in share mode;
lock table public.payments in share row exclusive mode;
lock table public.payment_recovery_events in share row exclusive mode;
lock table public.payment_orphan_reconciliation_audit in share row exclusive mode;

create temporary table pg_temp.bn_orphan_targets on commit drop as
select *
from (values
  ('4676a39b1eca', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('3c2d35cf195d', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('77dc238b094a', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('8a53f8111106', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('dea62dddf06a', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('65fd4bfa62be', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('0e512b3d232f', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('213e78777571', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('c436c92b4af4', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('a1a19a3d23b6', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('181914674cf7', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('7ab29de76f5d', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('ae8b4e5e1e2d', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('b2d9264a6264', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('04ab4a98563e', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('991eadd6f68f', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('d56a701952f5', '39c15d8ca041', 'isadora_20260902', array['f5dcaf840b70']::text[]),
  ('15ae4d5f46bb', '43ebe923cda6', 'ludmila_20260421', array['6ca255c0a181','fb19cf9656bd','48f8456763ff','287e4a144fec','98e0077bbf74','185279f88735']::text[])
) as target(payment_ref, student_ref, provider_group_key, canonical_payment_refs);

create temporary table pg_temp.bn_orphan_candidates on commit drop as
select
  target.*,
  payment.company_id,
  payment.student_id,
  payment.id as payment_id,
  to_jsonb(payment) as payment_before,
  encode(extensions.digest(to_jsonb(payment)::text, 'sha256'), 'hex') as payment_before_sha256,
  coalesce(events.rows, '[]'::jsonb) as recovery_events_before,
  encode(extensions.digest(coalesce(events.rows, '[]'::jsonb)::text, 'sha256'), 'hex') as recovery_events_before_sha256,
  canonical.ids as canonical_payment_ids,
  canonical.rows as canonical_before,
  encode(extensions.digest(canonical.rows::text, 'sha256'), 'hex') as canonical_before_sha256
from pg_temp.bn_orphan_targets target
join public.students student
  on substr(md5(student.id::text), 1, 12) = target.student_ref
join public.companies company
  on company.id = student.company_id
 and company.slug = 'bn-performance-training'
join public.payments payment
  on payment.student_id = student.id
 and payment.company_id = company.id
 and substr(md5(payment.id::text), 1, 12) = target.payment_ref
cross join lateral (
  select
    array_agg(canonical_payment.id order by canonical_payment.id) as ids,
    jsonb_agg(to_jsonb(canonical_payment) order by canonical_payment.id) as rows
  from public.payments canonical_payment
  where canonical_payment.student_id = student.id
    and canonical_payment.company_id = company.id
    and substr(md5(canonical_payment.id::text), 1, 12) = any(target.canonical_payment_refs)
) canonical
cross join lateral (
  select jsonb_agg(to_jsonb(event) order by event.id) as rows
  from public.payment_recovery_events event
  where event.payment_id = payment.id
) events;

create temporary table pg_temp.bn_orphan_preservation_before on commit drop as
with affected_students as (
  select distinct student_id from pg_temp.bn_orphan_candidates
)
select *
from (values
  ('students',
    (select count(*)::bigint from public.students student join affected_students affected on affected.student_id=student.id),
    (select md5(string_agg(to_jsonb(student)::text,'|' order by student.id)) from public.students student join affected_students affected on affected.student_id=student.id)),
  ('enrollments',
    (select count(*)::bigint from public.enrollments enrollment join affected_students affected on affected.student_id=enrollment.student_id),
    (select md5(string_agg(to_jsonb(enrollment)::text,'|' order by enrollment.id)) from public.enrollments enrollment join affected_students affected on affected.student_id=enrollment.student_id))
) snapshot(label,row_count,row_hash);

do $preflight$
declare
  v_target_hash text;
  v_event_hash text;
  v_canonical_hash text;
begin
  if (select count(*) from pg_temp.bn_orphan_candidates) <> 18 then
    raise exception 'bn_orphan_payment_target_count_mismatch';
  end if;

  select encode(extensions.digest(string_agg(payment_before::text, E'\n' order by payment_id), 'sha256'), 'hex')
  into v_target_hash from pg_temp.bn_orphan_candidates;
  if v_target_hash <> '5c2756977a8a69fedda9b711db6a28da94aa7e6aca52553c76de4661328af243' then
    raise exception 'bn_orphan_payment_before_hash_mismatch actual=%', v_target_hash;
  end if;

  select encode(extensions.digest(string_agg(to_jsonb(event)::text, E'\n' order by event.id), 'sha256'), 'hex')
  into v_event_hash
  from public.payment_recovery_events event
  join pg_temp.bn_orphan_candidates candidate on candidate.payment_id = event.payment_id;
  if v_event_hash <> '78dd05de6b96c84ceb7841beafb23bb341abffd905781c0acd4583654f7a366b' then
    raise exception 'bn_orphan_payment_event_hash_mismatch actual=%', v_event_hash;
  end if;

  with canonical_rows as (
    select distinct unnest(canonical_payment_ids) as id from pg_temp.bn_orphan_candidates
  )
  select encode(extensions.digest(string_agg(to_jsonb(payment)::text, E'\n' order by payment.id), 'sha256'), 'hex')
  into v_canonical_hash
  from public.payments payment join canonical_rows canonical on canonical.id = payment.id;
  if v_canonical_hash <> '2bda445b115a09e02ebdef08f60cd59f47c94007b74692008d624658ef4a747f' then
    raise exception 'bn_orphan_payment_canonical_hash_mismatch actual=%', v_canonical_hash;
  end if;

  if exists (
    select 1 from pg_temp.bn_orphan_candidates
    where payment_before->>'billing_type' <> 'CREDIT_CARD'
       or payment_before->>'asaas_payment_id' is not null
       or payment_before->>'asaas_customer_id' is null
       or payment_before->>'status' <> 'OVERDUE'
       or payment_before->>'lifecycle_applied_at' is not null
       or payment_before->>'checkout_request_key' is not null
       or payment_before->>'invoice_url' is not null
       or payment_before->>'invoice_status' is not null
       or payment_before->>'asaas_invoice_url' is not null
       or payment_before->>'asaas_pix_qr_code' is not null
       or payment_before->>'asaas_pix_payload' is not null
       or payment_before->>'asaas_boleto_url' is not null
  ) then raise exception 'bn_orphan_payment_target_state_mismatch'; end if;

  if (select count(*) from pg_temp.bn_orphan_candidates where provider_group_key='isadora_20260902') <> 17
     or exists (
       select 1 from pg_temp.bn_orphan_candidates
       where provider_group_key='isadora_20260902'
         and ((payment_before->>'value')::numeric <> 1440 or (payment_before->>'installment_count')::int <> 6
              or payment_before->>'plan_id' is null or payment_before->>'enrollment_id' is not null
              or cardinality(canonical_payment_ids) <> 1)
     ) then raise exception 'bn_orphan_payment_isadora_gate_failed'; end if;

  if (select count(*) from pg_temp.bn_orphan_candidates where provider_group_key='ludmila_20260421') <> 1
     or exists (
       select 1 from pg_temp.bn_orphan_candidates
       where provider_group_key='ludmila_20260421'
         and ((payment_before->>'value')::numeric <> 1380 or (payment_before->>'installment_count')::int <> 6
              or payment_before->>'enrollment_id' is null or cardinality(canonical_payment_ids) <> 6)
     ) then raise exception 'bn_orphan_payment_ludmila_gate_failed'; end if;

  if (select count(*) from public.payment_recovery_events event join pg_temp.bn_orphan_candidates candidate on candidate.payment_id=event.payment_id) <> 19
     or (select count(*) from public.payment_recovery_events event join pg_temp.bn_orphan_candidates candidate on candidate.payment_id=event.payment_id where event.event_type='payment_started') <> 18
     or (select count(*) from public.payment_recovery_events event join pg_temp.bn_orphan_candidates candidate on candidate.payment_id=event.payment_id where event.event_type='payment_abandoned') <> 1 then
    raise exception 'bn_orphan_payment_recovery_event_gate_failed';
  end if;

  if (select count(*) from public.payments payment join public.companies company on company.id=payment.company_id where company.slug='bn-performance-training') <> 143
     or (select count(*) from public.payments payment join public.companies company on company.id=payment.company_id where company.slug='bn-performance-training' and payment.billing_type='CREDIT_CARD' and payment.asaas_payment_id is null) <> 18 then
    raise exception 'bn_orphan_payment_global_count_mismatch';
  end if;

  if exists (select 1 from public.payment_orphan_reconciliation_audit where repair_key='bn_18_orphan_card_payments_20260909') then
    raise exception 'bn_orphan_payment_repair_key_residue';
  end if;
end
$preflight$;

insert into public.payment_orphan_reconciliation_audit (
  repair_key, export_sha256, provider_evidence, company_id, student_id, payment_id,
  canonical_payment_ids, payment_before, recovery_events_before, canonical_before,
  payment_before_sha256, recovery_events_before_sha256, canonical_before_sha256
)
select
  'bn_18_orphan_card_payments_20260909',
  '6a8504811aa2b79efb9aa161ba62f7bc071cbb55a5922d7fc38dbfdf669aac4d',
  case provider_group_key
    when 'isadora_20260902' then jsonb_build_object('created','2026-09-02','installments',6,'total',1440,'status','confirmed','identity_match','name+cpf+billing_cpf+email')
    else jsonb_build_object('created','2026-04-21','installments',6,'total',1380,'status','4 received + 2 confirmed','identity_match','name+cpf+billing_cpf+email')
  end,
  company_id, student_id, payment_id, canonical_payment_ids, payment_before,
  recovery_events_before, canonical_before, payment_before_sha256,
  recovery_events_before_sha256, canonical_before_sha256
from pg_temp.bn_orphan_candidates;

delete from public.payments payment
using pg_temp.bn_orphan_candidates candidate
where payment.id = candidate.payment_id
  and encode(extensions.digest(to_jsonb(payment)::text, 'sha256'), 'hex') = candidate.payment_before_sha256;

create temporary table pg_temp.bn_orphan_afterimages on commit drop as
select
  audit.id as audit_id,
  not exists (select 1 from public.payments payment where payment.id=audit.payment_id) as payment_deleted,
  current_events.rows as recovery_events_after,
  encode(extensions.digest(current_events.rows::text, 'sha256'), 'hex') as recovery_events_after_sha256,
  encode(extensions.digest(current_canonical.rows::text, 'sha256'), 'hex') as canonical_after_sha256
from public.payment_orphan_reconciliation_audit audit
cross join lateral (
  select coalesce(jsonb_agg(to_jsonb(event) order by event.id), '[]'::jsonb) as rows
  from jsonb_array_elements(audit.recovery_events_before) before_event
  join public.payment_recovery_events event on event.id=(before_event->>'id')::uuid
) current_events
cross join lateral (
  select jsonb_agg(to_jsonb(payment) order by payment.id) as rows
  from public.payments payment where payment.id=any(audit.canonical_payment_ids)
) current_canonical
where audit.repair_key='bn_18_orphan_card_payments_20260909'
  and audit.state='applied';

update public.payment_orphan_reconciliation_audit audit
set payment_deleted = afterimage.payment_deleted,
    recovery_events_after = afterimage.recovery_events_after,
    recovery_events_after_sha256 = afterimage.recovery_events_after_sha256,
    canonical_after_sha256 = afterimage.canonical_after_sha256
from pg_temp.bn_orphan_afterimages afterimage
where audit.id=afterimage.audit_id;

do $postflight$
declare
  v_preservation_mismatches integer;
  v_preserved_event_count integer;
begin
  if (select count(*) from public.payment_orphan_reconciliation_audit where repair_key='bn_18_orphan_card_payments_20260909' and state='applied' and payment_deleted) <> 18 then
    raise exception 'bn_orphan_payment_deleted_count_mismatch';
  end if;

  if exists (
    select 1
    from public.payment_orphan_reconciliation_audit audit,
         lateral jsonb_array_elements(audit.recovery_events_before) before_event,
         lateral jsonb_array_elements(audit.recovery_events_after) after_event
    where audit.repair_key='bn_18_orphan_card_payments_20260909'
      and before_event->>'id'=after_event->>'id'
      and ((before_event-'payment_id') is distinct from (after_event-'payment_id') or after_event->>'payment_id' is not null)
  ) then raise exception 'bn_orphan_payment_recovery_event_not_preserved'; end if;

  select count(distinct event.id) into v_preserved_event_count
  from public.payment_orphan_reconciliation_audit audit
  cross join lateral jsonb_array_elements(audit.recovery_events_before) before_event
  join public.payment_recovery_events event on event.id=(before_event->>'id')::uuid
  where audit.repair_key='bn_18_orphan_card_payments_20260909';
  if v_preserved_event_count <> 19 or exists (
    select 1 from public.payment_orphan_reconciliation_audit audit
    where audit.repair_key='bn_18_orphan_card_payments_20260909'
      and jsonb_array_length(audit.recovery_events_before) is distinct from jsonb_array_length(audit.recovery_events_after)
  ) then
    raise exception 'bn_orphan_payment_recovery_event_count_mismatch actual=%',v_preserved_event_count;
  end if;

  if exists (
    select 1 from public.payment_orphan_reconciliation_audit
    where repair_key='bn_18_orphan_card_payments_20260909'
      and canonical_after_sha256 is distinct from canonical_before_sha256
  ) then raise exception 'bn_orphan_payment_canonical_changed'; end if;

  with affected_students as (
    select distinct student_id
    from public.payment_orphan_reconciliation_audit
    where repair_key='bn_18_orphan_card_payments_20260909'
  ), current_preservation as (
    select *
    from (values
      ('students',
        (select count(*)::bigint from public.students student join affected_students affected on affected.student_id=student.id),
        (select md5(string_agg(to_jsonb(student)::text,'|' order by student.id)) from public.students student join affected_students affected on affected.student_id=student.id)),
      ('enrollments',
        (select count(*)::bigint from public.enrollments enrollment join affected_students affected on affected.student_id=enrollment.student_id),
        (select md5(string_agg(to_jsonb(enrollment)::text,'|' order by enrollment.id)) from public.enrollments enrollment join affected_students affected on affected.student_id=enrollment.student_id))
    ) snapshot(label,row_count,row_hash)
  )
  select count(*) into v_preservation_mismatches
  from pg_temp.bn_orphan_preservation_before before_snapshot
  join current_preservation after_snapshot using(label)
  where before_snapshot.row_count is distinct from after_snapshot.row_count
     or before_snapshot.row_hash is distinct from after_snapshot.row_hash;
  if v_preservation_mismatches <> 0 then
    raise exception 'bn_orphan_payment_student_or_enrollment_changed count=%',v_preservation_mismatches;
  end if;

  if (select count(*) from public.payments payment join public.companies company on company.id=payment.company_id where company.slug='bn-performance-training') <> 125
     or (select count(*) from public.payments payment join public.companies company on company.id=payment.company_id where company.slug='bn-performance-training' and payment.billing_type='CREDIT_CARD') <> 106
     or (select count(*) from public.payments payment join public.companies company on company.id=payment.company_id where company.slug='bn-performance-training' and payment.billing_type='CREDIT_CARD' and payment.asaas_payment_id is null) <> 0 then
    raise exception 'bn_orphan_payment_post_count_mismatch';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.payment_orphan_reconciliation_audit'::regclass)
     or has_table_privilege('anon','public.payment_orphan_reconciliation_audit','select')
     or has_table_privilege('anon','public.payment_orphan_reconciliation_audit','insert')
     or has_table_privilege('anon','public.payment_orphan_reconciliation_audit','update')
     or has_table_privilege('anon','public.payment_orphan_reconciliation_audit','delete')
     or has_table_privilege('authenticated','public.payment_orphan_reconciliation_audit','select')
     or has_table_privilege('authenticated','public.payment_orphan_reconciliation_audit','insert')
     or has_table_privilege('authenticated','public.payment_orphan_reconciliation_audit','update')
     or has_table_privilege('authenticated','public.payment_orphan_reconciliation_audit','delete') then
    raise exception 'bn_orphan_payment_audit_privilege_mismatch';
  end if;
end
$postflight$;

select jsonb_build_object(
  'repair_key','bn_18_orphan_card_payments_20260909',
  'deleted_orphan_placeholders',(select count(*) from public.payment_orphan_reconciliation_audit where repair_key='bn_18_orphan_card_payments_20260909' and payment_deleted),
  'preserved_recovery_events',(select count(*) from public.payment_recovery_events event join lateral (select distinct (value->>'id')::uuid id from public.payment_orphan_reconciliation_audit audit, jsonb_array_elements(audit.recovery_events_before) where audit.repair_key='bn_18_orphan_card_payments_20260909') refs on refs.id=event.id),
  'remaining_card_rows_without_provider_id',(select count(*) from public.payments payment join public.companies company on company.id=payment.company_id where company.slug='bn-performance-training' and payment.billing_type='CREDIT_CARD' and payment.asaas_payment_id is null),
  'canonical_payment_rows',7,
  'export_sha256','6a8504811aa2b79efb9aa161ba62f7bc071cbb55a5922d7fc38dbfdf669aac4d'
) as result;

commit;
