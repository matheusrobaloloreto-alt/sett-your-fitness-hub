-- Tabela de histórico de atribuições de treinador
CREATE TABLE public.trainer_assignments_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  trainer_id uuid,
  previous_trainer_id uuid,
  company_id uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  changed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tah_student ON public.trainer_assignments_history(student_id);
CREATE INDEX idx_tah_trainer ON public.trainer_assignments_history(trainer_id);
CREATE INDEX idx_tah_company ON public.trainer_assignments_history(company_id);
CREATE INDEX idx_tah_period ON public.trainer_assignments_history(assigned_at, unassigned_at);

ALTER TABLE public.trainer_assignments_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company scoped select"
ON public.trainer_assignments_history FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company insert"
ON public.trainer_assignments_history FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company update"
ON public.trainer_assignments_history FOR UPDATE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admin company delete"
ON public.trainer_assignments_history FOR DELETE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Master full access"
ON public.trainer_assignments_history FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

-- Função e trigger para registrar trocas automaticamente
CREATE OR REPLACE FUNCTION public.log_trainer_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_trainer_id IS NOT NULL THEN
      INSERT INTO public.trainer_assignments_history
        (student_id, trainer_id, previous_trainer_id, company_id, assigned_at, changed_by)
      VALUES (NEW.id, NEW.assigned_trainer_id, NULL, NEW.company_id, COALESCE(NEW.created_at, now()), auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.assigned_trainer_id::text,'') IS DISTINCT FROM COALESCE(NEW.assigned_trainer_id::text,'') THEN
    -- fecha período anterior
    UPDATE public.trainer_assignments_history
       SET unassigned_at = now()
     WHERE student_id = NEW.id AND unassigned_at IS NULL;

    -- abre novo período (se houver novo treinador)
    IF NEW.assigned_trainer_id IS NOT NULL THEN
      INSERT INTO public.trainer_assignments_history
        (student_id, trainer_id, previous_trainer_id, company_id, assigned_at, changed_by)
      VALUES (NEW.id, NEW.assigned_trainer_id, OLD.assigned_trainer_id, NEW.company_id, now(), auth.uid());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_trainer_assignment_change
AFTER INSERT OR UPDATE OF assigned_trainer_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.log_trainer_assignment_change();

-- Backfill: cria registro inicial para alunos que já têm treinador
INSERT INTO public.trainer_assignments_history
  (student_id, trainer_id, previous_trainer_id, company_id, assigned_at)
SELECT s.id, s.assigned_trainer_id, NULL, s.company_id, COALESCE(s.created_at, now())
FROM public.students s
WHERE s.assigned_trainer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.trainer_assignments_history h
    WHERE h.student_id = s.id
  );