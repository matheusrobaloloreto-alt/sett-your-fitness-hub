CREATE TABLE public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  target_role text,
  target_user_id uuid,
  student_id uuid,
  enrollment_id uuid,
  title text NOT NULL,
  message text,
  action_url text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_alerts_company_open ON public.admin_alerts(company_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_admin_alerts_target_user ON public.admin_alerts(target_user_id) WHERE resolved_at IS NULL;
CREATE UNIQUE INDEX uniq_admin_alerts_open_per_enrollment_type ON public.admin_alerts(enrollment_id, type) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_alerts TO authenticated;
GRANT ALL ON public.admin_alerts TO service_role;

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master full access alerts" ON public.admin_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Company admins read alerts" ON public.admin_alerts
  FOR SELECT TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      target_user_id = auth.uid()
      OR (
        target_role IN ('admin','coordinator')
        AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coordinator'::app_role))
      )
      OR (target_role = 'trainer' AND target_user_id = auth.uid())
    )
  );

CREATE POLICY "Company admins update alerts" ON public.admin_alerts
  FOR UPDATE TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      target_user_id = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'coordinator'::app_role)
    )
  );

CREATE POLICY "Company admins insert alerts" ON public.admin_alerts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coordinator'::app_role))
  );

-- Trigger function: alerts on enrollment payment/trainer changes
CREATE OR REPLACE FUNCTION public.enrollment_alerts_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_name text;
  v_trainer_name text;
BEGIN
  -- Payment just became paid
  IF NEW.payment_status = 'paid'
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.payment_status,'') IS DISTINCT FROM 'paid') THEN
    IF NEW.trainer_id IS NULL THEN
      SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
      INSERT INTO public.admin_alerts (
        company_id, type, severity, target_role,
        student_id, enrollment_id, title, message, action_url
      ) VALUES (
        NEW.company_id, 'assign_trainer', 'warning', 'admin',
        NEW.student_id, NEW.id,
        'Atribuir treinador',
        COALESCE(v_student_name,'Aluno') || ' efetuou o pagamento — atribua um treinador.',
        '/admin/students/' || NEW.student_id::text
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Trainer just assigned (or changed)
  IF NEW.trainer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.trainer_id::text,'') IS DISTINCT FROM NEW.trainer_id::text) THEN
    -- Resolve any open assign_trainer alert
    UPDATE public.admin_alerts
       SET resolved_at = now()
     WHERE enrollment_id = NEW.id AND type = 'assign_trainer' AND resolved_at IS NULL;

    SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
    INSERT INTO public.admin_alerts (
      company_id, type, severity, target_role, target_user_id,
      student_id, enrollment_id, title, message, action_url
    ) VALUES (
      NEW.company_id, 'build_workout', 'info', 'trainer', NEW.trainer_id,
      NEW.student_id, NEW.id,
      'Montar treino',
      'Você foi atribuído a ' || COALESCE(v_student_name,'um novo aluno') || '. Monte o treino inicial.',
      '/trainer/students/' || NEW.student_id::text
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enrollment_alerts
AFTER INSERT OR UPDATE OF payment_status, trainer_id ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.enrollment_alerts_trigger();