CREATE OR REPLACE FUNCTION public.process_automation_triggers()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_no_workout integer := 0; v_payment_pending integer := 0; v_cart_recovery integer := 0;
  v_weekly_contact integer := 0; v_abandoned integer := 0;
BEGIN
  SELECT public.mark_payment_recovery_abandoned() INTO v_abandoned;

  WITH candidates AS (
    SELECT f.id AS flow_id, c.id AS chat_id, public.get_automation_start_node(f.id) AS start_node_id,
      s.id AS student_id, s.full_name AS student_name,
      max(COALESCE(ws.completed_at, ws.session_date::timestamptz)) AS last_completed_at
    FROM public.automation_flows f
    JOIN public.students s ON s.company_id = f.company_id
    JOIN public.whatsapp_chats c ON c.company_id = f.company_id AND c.student_id = s.id
    LEFT JOIN public.workout_sessions ws ON ws.student_id = s.id AND ws.status = 'completed'
    WHERE f.is_active = true AND f.trigger_type = 'no_workout_7d'
      AND COALESCE(s.status, '') IN ('active', 'awaiting_training', 'awaiting_renewal')
      AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = s.id AND e.status IN ('active', 'awaiting_training')
          AND COALESCE(e.training_start_date, e.start_date, e.created_at::date) <= CURRENT_DATE - 7)
    GROUP BY f.id, c.id, s.id, s.full_name
    HAVING COALESCE(max(COALESCE(ws.completed_at, ws.session_date::timestamptz)), '-infinity'::timestamptz) < now() - interval '7 days'
  ), inserted AS (
    INSERT INTO public.flow_sessions (flow_id, chat_id, current_node_id, status, context, started_at, last_activity_at, created_at, updated_at)
    SELECT c.flow_id, c.chat_id, c.start_node_id, 'active',
      jsonb_build_object('trigger_type','no_workout_7d','automation_key','no_workout_7d:'||c.student_id::text,'student_id',c.student_id,'student_name',c.student_name,'last_completed_at',c.last_completed_at),
      now(), now(), now(), now()
    FROM candidates c
    WHERE NOT EXISTS (SELECT 1 FROM public.flow_sessions fs WHERE fs.flow_id=c.flow_id AND fs.chat_id=c.chat_id AND fs.status IN ('active','waiting_response') AND fs.context->>'automation_key'='no_workout_7d:'||c.student_id::text)
      AND NOT EXISTS (SELECT 1 FROM public.flow_sessions fs WHERE fs.flow_id=c.flow_id AND fs.chat_id=c.chat_id AND fs.context->>'automation_key'='no_workout_7d:'||c.student_id::text AND COALESCE(fs.updated_at,fs.created_at) > now() - interval '6 days')
    RETURNING 1
  ) SELECT count(*) INTO v_no_workout FROM inserted;

  WITH candidates AS (
    SELECT DISTINCT ON (f.id, c.id, s.id) f.id AS flow_id, c.id AS chat_id, public.get_automation_start_node(f.id) AS start_node_id,
      s.id AS student_id, s.full_name AS student_name, e.id AS enrollment_id,
      COALESCE(e.payment_status,'pending') AS payment_status, p.id AS payment_id, p.status AS provider_status
    FROM public.automation_flows f
    JOIN public.students s ON s.company_id = f.company_id
    JOIN public.whatsapp_chats c ON c.company_id = f.company_id AND c.student_id = s.id
    LEFT JOIN public.enrollments e ON e.student_id = s.id AND e.status IN ('active','awaiting_training','awaiting_renewal')
    LEFT JOIN public.payments p ON p.student_id = s.id AND COALESCE(p.status,'PENDING') NOT IN ('CONFIRMED','RECEIVED','RECEIVED_IN_CASH')
    WHERE f.is_active = true AND f.trigger_type = 'payment_pending'
      AND (COALESCE(e.payment_status,'') IN ('pending','overdue') OR p.id IS NOT NULL)
    ORDER BY f.id, c.id, s.id, p.created_at DESC NULLS LAST, e.created_at DESC NULLS LAST
  ), inserted AS (
    INSERT INTO public.flow_sessions (flow_id, chat_id, current_node_id, status, context, started_at, last_activity_at, created_at, updated_at)
    SELECT c.flow_id, c.chat_id, c.start_node_id, 'active',
      jsonb_build_object('trigger_type','payment_pending','automation_key','payment_pending:'||c.student_id::text||':'||COALESCE(c.enrollment_id::text,c.payment_id::text,'open'),'student_id',c.student_id,'student_name',c.student_name,'enrollment_id',c.enrollment_id,'payment_id',c.payment_id,'payment_status',c.payment_status,'provider_status',c.provider_status),
      now(), now(), now(), now()
    FROM candidates c
    WHERE NOT EXISTS (SELECT 1 FROM public.flow_sessions fs WHERE fs.flow_id=c.flow_id AND fs.chat_id=c.chat_id AND fs.status IN ('active','waiting_response') AND fs.context->>'automation_key'='payment_pending:'||c.student_id::text||':'||COALESCE(c.enrollment_id::text,c.payment_id::text,'open'))
      AND NOT EXISTS (SELECT 1 FROM public.flow_sessions fs WHERE fs.flow_id=c.flow_id AND fs.chat_id=c.chat_id AND fs.context->>'automation_key'='payment_pending:'||c.student_id::text||':'||COALESCE(c.enrollment_id::text,c.payment_id::text,'open') AND COALESCE(fs.updated_at,fs.created_at) > now() - interval '1 day')
    RETURNING 1
  ) SELECT count(*) INTO v_payment_pending FROM inserted;

  WITH candidates AS (
    SELECT f.id AS flow_id, c.id AS chat_id, public.get_automation_start_node(f.id) AS start_node_id,
      s.id AS student_id, s.full_name AS student_name, e.id AS event_id, e.plan_id, e.payment_id, e.enrollment_id
    FROM public.payment_recovery_events e
    JOIN public.students s ON s.id = e.student_id
    JOIN public.automation_flows f ON f.company_id = e.company_id
    JOIN public.whatsapp_chats c ON c.company_id = e.company_id AND c.student_id = e.student_id
    WHERE e.event_type = 'payment_abandoned' AND f.is_active = true AND f.trigger_type = 'payment_pending'
      AND NOT EXISTS (SELECT 1 FROM public.payment_recovery_events done WHERE done.student_id=e.student_id AND done.event_type='payment_completed' AND done.occurred_at >= e.occurred_at)
  ), inserted AS (
    INSERT INTO public.flow_sessions (flow_id, chat_id, current_node_id, status, context, started_at, last_activity_at, created_at, updated_at)
    SELECT c.flow_id, c.chat_id, c.start_node_id, 'active',
      jsonb_build_object('trigger_type','payment_pending','recovery_type','cart_abandoned','automation_key','cart_abandoned:'||c.event_id::text,'student_id',c.student_id,'student_name',c.student_name,'recovery_event_id',c.event_id,'plan_id',c.plan_id,'payment_id',c.payment_id,'enrollment_id',c.enrollment_id),
      now(), now(), now(), now()
    FROM candidates c
    WHERE NOT EXISTS (SELECT 1 FROM public.flow_sessions fs WHERE fs.flow_id=c.flow_id AND fs.chat_id=c.chat_id AND fs.context->>'automation_key'='cart_abandoned:'||c.event_id::text)
    RETURNING 1
  ) SELECT count(*) INTO v_cart_recovery FROM inserted;

  WITH candidates AS (
    SELECT f.id AS flow_id, c.id AS chat_id, public.get_automation_start_node(f.id) AS start_node_id,
      s.id AS student_id, s.full_name AS student_name,
      COALESCE(max(fs.created_at),'-infinity'::timestamptz) AS last_weekly_contact_at,
      count(fs.id) FILTER (WHERE fs.created_at > now() - interval '7 days') AS contacts_last_7d
    FROM public.automation_flows f
    JOIN public.students s ON s.company_id = f.company_id
    JOIN public.whatsapp_chats c ON c.company_id = f.company_id AND c.student_id = s.id
    LEFT JOIN public.flow_sessions fs ON fs.flow_id = f.id AND fs.chat_id = c.id AND fs.context->>'trigger_type' = 'weekly_contact'
    WHERE f.is_active = true AND f.trigger_type = 'weekly_contact'
      AND COALESCE(s.weekly_contact_enabled, false) = true
      AND COALESCE(s.status,'') IN ('active','awaiting_training')
      AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = s.id AND e.status IN ('active','awaiting_training'))
    GROUP BY f.id, c.id, s.id, s.full_name
    HAVING count(fs.id) FILTER (WHERE fs.created_at > now() - interval '7 days') < 2
       AND COALESCE(max(fs.created_at),'-infinity'::timestamptz) < now() - interval '72 hours'
  ), inserted AS (
    INSERT INTO public.flow_sessions (flow_id, chat_id, current_node_id, status, context, started_at, last_activity_at, created_at, updated_at)
    SELECT c.flow_id, c.chat_id, c.start_node_id, 'active',
      jsonb_build_object('trigger_type','weekly_contact','automation_key','weekly_contact:'||c.student_id::text||':'||to_char(date_trunc('week', now()),'IYYY-IW')||':'||(c.contacts_last_7d+1)::text,'student_id',c.student_id,'student_name',c.student_name,'contact_objective','Perguntar se o aluno teve dificuldade no treino e se quer mandar video para correcao.','copy_seed',floor(extract(epoch from now())/3600)::bigint,'copy_guidance',jsonb_build_array('Manter o mesmo objetivo, mas variar abertura, ritmo e pergunta final.','Nao soar automatico; mencionar treino, dificuldade ou video de execucao.','Ser curto, humano e acionavel.'),'contacts_last_7d_before',c.contacts_last_7d,'last_weekly_contact_at',c.last_weekly_contact_at),
      now(), now(), now(), now()
    FROM candidates c
    WHERE NOT EXISTS (SELECT 1 FROM public.flow_sessions fs WHERE fs.flow_id=c.flow_id AND fs.chat_id=c.chat_id AND fs.status IN ('active','waiting_response') AND fs.context->>'trigger_type'='weekly_contact')
    RETURNING 1
  ) SELECT count(*) INTO v_weekly_contact FROM inserted;

  RETURN jsonb_build_object('no_workout_7d',v_no_workout,'payment_pending',v_payment_pending,'cart_recovery',v_cart_recovery,'weekly_contact',v_weekly_contact,'abandoned_events_created',v_abandoned);
END;
$$;
GRANT EXECUTE ON FUNCTION public.process_automation_triggers() TO authenticated, service_role;;
