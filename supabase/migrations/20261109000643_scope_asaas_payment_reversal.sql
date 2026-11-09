begin;

create or replace function private.keep_confirmed_asaas_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.asaas_payment_id is not null and new.asaas_payment_id = old.asaas_payment_id then
    if old.status in ('CONFIRMED', 'RECEIVED') and new.status in ('PENDING', 'OVERDUE') then
      new.status := old.status;
    elsif old.status = 'REFUNDED' and new.status in ('PENDING', 'OVERDUE', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH') then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

create function public.apply_asaas_payment_reversal(
  _asaas_payment_id text, _company_id uuid, _expected_status text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_enrollment_id uuid;
  v_payment_status text;
begin
  if _expected_status is null or _expected_status not in ('REFUNDED', 'OVERDUE') then
    raise exception using errcode = '22023', message = 'Status Asaas inválido para atualização da matrícula.';
  end if;

  -- Same lock order as apply_paid_payment_lifecycle and its renewal path.
  select p.* into v_payment
  from public.payments p
  where p.asaas_payment_id = _asaas_payment_id and p.company_id = _company_id
  for update;

  if not found or v_payment.status is distinct from _expected_status then
    return;
  end if;
  v_enrollment_id := coalesce(v_payment.lifecycle_enrollment_id, v_payment.enrollment_id);
  if v_enrollment_id is null then
    return;
  end if;

  perform 1 from public.students s
  where s.id = v_payment.student_id and s.company_id = _company_id
  for update;
  if not found then
    return;
  end if;

  -- A refunded installment or a legacy payment link is insufficient evidence
  -- that the charge which granted this enrollment was fully refunded.
  if _expected_status = 'REFUNDED' and (
    v_payment.lifecycle_applied_at is null
    or v_payment.lifecycle_enrollment_id is distinct from v_enrollment_id
    or coalesce(v_payment.installment_count, 1) > 1
  ) then
    return;
  end if;

  if exists (
    select 1 from public.payments other
    where other.id <> v_payment.id and other.company_id = _company_id
      and other.student_id = v_payment.student_id
      and v_enrollment_id in (other.lifecycle_enrollment_id, other.enrollment_id)
      and upper(other.status) in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID')
  ) then
    return;
  end if;

  v_payment_status := case when _expected_status = 'REFUNDED' then 'refunded' else 'overdue' end;
  update public.enrollments e
  set payment_status = v_payment_status
  where e.id = v_enrollment_id and e.student_id = v_payment.student_id
    and e.company_id = _company_id and e.status in ('active', 'awaiting_training')
    and e.payment_status is distinct from v_payment_status;

  if found and _expected_status = 'REFUNDED' then
    update public.students s set status = 'pending'
    where s.id = v_payment.student_id and s.company_id = _company_id and s.status = 'active'
      and not exists (
        select 1 from public.enrollments other
        where other.student_id = s.id and other.company_id = s.company_id
          and other.id <> v_enrollment_id
          and (other.status = 'active' and lower(coalesce(other.payment_status, '')) not in ('pending', 'overdue', 'refunded')
            or other.status in ('awaiting_training', 'awaiting_renewal') and lower(other.payment_status) = 'paid')
      );
  end if;
end;
$$;

revoke all on function public.apply_asaas_payment_reversal(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_asaas_payment_reversal(text, uuid, text) to service_role;

commit;
