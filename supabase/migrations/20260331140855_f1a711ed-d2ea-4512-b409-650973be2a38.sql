
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS installment_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invoice_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text DEFAULT NULL;
