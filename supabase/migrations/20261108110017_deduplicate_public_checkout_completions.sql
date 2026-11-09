create function public.record_public_checkout_completion(
  _student_id uuid,
  _company_id uuid,
  _asaas_payment_id text,
  _metadata jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  checkout_payment public.payments%rowtype;
begin
  -- Serialize confirmations of the same charge across tabs and Edge instances.
  select payment.* into checkout_payment
  from public.payments payment
  where payment.asaas_payment_id = _asaas_payment_id
    and payment.student_id = _student_id
    and payment.company_id = _company_id
  for no key update;

  if not found or coalesce(checkout_payment.status, '') not in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH')
    or checkout_payment.enrollment_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.payment_recovery_events event
    where event.student_id = _student_id
      and event.company_id = _company_id
      and event.payment_id = checkout_payment.id
      and event.event_type = 'payment_completed'
      and event.source = 'public-payment'
  ) then
    insert into public.payment_recovery_events (
      student_id, company_id, plan_id, payment_id, enrollment_id, event_type, source, metadata
    ) values (
      _student_id, _company_id, checkout_payment.plan_id, checkout_payment.id,
      checkout_payment.enrollment_id, 'payment_completed', 'public-payment', _metadata
    );
  end if;

  return true;
end;
$$;

revoke all on function public.record_public_checkout_completion(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_public_checkout_completion(uuid, uuid, text, jsonb)
  to service_role;
