
-- 1. Backfill: preencher company_id das anamneses existentes
UPDATE public.anamnesis a
SET company_id = s.company_id
FROM public.students s
WHERE a.student_id = s.id
  AND a.company_id IS NULL;

-- 2. Função para preencher company_id automaticamente
CREATE OR REPLACE FUNCTION public.set_anamnesis_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.students WHERE id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_set_anamnesis_company_id ON public.anamnesis;
CREATE TRIGGER trg_set_anamnesis_company_id
BEFORE INSERT OR UPDATE ON public.anamnesis
FOR EACH ROW
EXECUTE FUNCTION public.set_anamnesis_company_id();
