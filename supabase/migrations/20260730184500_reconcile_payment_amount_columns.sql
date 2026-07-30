-- O schema histórico manteve amount/payment_method e o fluxo Asaas passou a
-- gravar value/billing_type. Reconcilia ambos para relatórios antigos e novos.
update public.payments
set
  amount = value,
  payment_method = coalesce(payment_method, billing_type),
  asaas_invoice_url = coalesce(asaas_invoice_url, invoice_url),
  updated_at = now()
where value is not null
  and value > 0
  and (
    amount is null
    or amount = 0
    or payment_method is null
    or (asaas_invoice_url is null and invoice_url is not null)
  );
