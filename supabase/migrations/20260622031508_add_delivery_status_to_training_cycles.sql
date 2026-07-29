-- P6 — status de entrega da prescrição (sent → viewed). Aditivo, herda RLS da training_cycles.
ALTER TABLE public.training_cycles ADD COLUMN IF NOT EXISTS delivery_status text;
COMMENT ON COLUMN public.training_cycles.delivery_status IS 'Entrega da prescrição ao aluno: sent (publicada) | viewed (aluno abriu).';;
