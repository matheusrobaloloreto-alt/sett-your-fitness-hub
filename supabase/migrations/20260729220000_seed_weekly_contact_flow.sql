-- Ensure the proactive weekly contact automation has a default flow per company.
-- The trigger still respects students.weekly_contact_enabled; this migration does
-- not opt students in automatically.

DO $$
DECLARE
  company_record record;
  v_flow_id uuid;
  v_start_node_id uuid;
  v_content_node_id uuid;
BEGIN
  FOR company_record IN SELECT id FROM public.companies LOOP
    SELECT id INTO v_flow_id
      FROM public.automation_flows
     WHERE company_id = company_record.id
       AND trigger_type = 'weekly_contact'
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_flow_id IS NULL THEN
      INSERT INTO public.automation_flows (
        company_id, name, description, trigger_type, trigger_value, is_active
      ) VALUES (
        company_record.id,
        'Contato semanal BNITO',
        'Contato proativo 2x por semana para perguntar dificuldade no treino e convidar envio de vídeo.',
        'weekly_contact',
        'weekly_contact',
        true
      )
      RETURNING id INTO v_flow_id;
    ELSE
      UPDATE public.automation_flows
         SET is_active = true,
             name = COALESCE(NULLIF(name, ''), 'Contato semanal BNITO'),
             description = COALESCE(description, 'Contato proativo 2x por semana para perguntar dificuldade no treino e convidar envio de vídeo.'),
             updated_at = now()
       WHERE id = v_flow_id;
    END IF;

    SELECT id INTO v_start_node_id
      FROM public.automation_flow_nodes
     WHERE flow_id = v_flow_id
       AND COALESCE(node_type, type) = 'start'
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_start_node_id IS NULL THEN
      INSERT INTO public.automation_flow_nodes (
        flow_id, type, node_type, label, position_x, position_y, data
      ) VALUES (
        v_flow_id, 'start', 'start', 'Início', 80, 80, '{}'::jsonb
      )
      RETURNING id INTO v_start_node_id;
    END IF;

    SELECT id INTO v_content_node_id
      FROM public.automation_flow_nodes
     WHERE flow_id = v_flow_id
       AND COALESCE(node_type, type) = 'content'
       AND data->>'system_key' = 'weekly_contact_message'
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_content_node_id IS NULL THEN
      INSERT INTO public.automation_flow_nodes (
        flow_id, type, node_type, label, position_x, position_y, data
      ) VALUES (
        v_flow_id,
        'content',
        'content',
        'Mensagem semanal',
        360,
        80,
        jsonb_build_object(
          'system_key', 'weekly_contact_message',
          'message', 'Oi, {{primeiro_nome}}! Como foi o treino essa semana? Se algum exercício ficou estranho, pode mandar um vídeo para a equipe olhar.',
          'wait_for_reply', false
        )
      )
      RETURNING id INTO v_content_node_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.automation_flow_edges
       WHERE flow_id = v_flow_id
         AND source_node_id = v_start_node_id::text
         AND target_node_id = v_content_node_id::text
    ) THEN
      INSERT INTO public.automation_flow_edges (
        flow_id, source_node_id, target_node_id, source_handle, label
      ) VALUES (
        v_flow_id, v_start_node_id::text, v_content_node_id::text, 'next', 'Enviar'
      );
    END IF;
  END LOOP;
END $$;
