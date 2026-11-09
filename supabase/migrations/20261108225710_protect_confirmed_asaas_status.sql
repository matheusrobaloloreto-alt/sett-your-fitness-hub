create function private.keep_confirmed_asaas_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- The UPDATE may be using an Asaas snapshot read before the webhook committed.
  if old.asaas_payment_id is not null
    and new.asaas_payment_id = old.asaas_payment_id
    and old.status in ('CONFIRMED', 'RECEIVED')
    and new.status = 'PENDING' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

revoke all on function private.keep_confirmed_asaas_payment_status()
  from public, anon, authenticated;

create trigger keep_confirmed_asaas_payment_status
before update of status on public.payments
for each row execute function private.keep_confirmed_asaas_payment_status();
