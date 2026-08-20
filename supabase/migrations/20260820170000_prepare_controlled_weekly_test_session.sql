-- Prepare one exact, auditable weekly-contact session without scanning triggers or
-- changing student cadence. The function creates no student/chat/provider data;
-- all recipient bindings must already exist and agree in the target environment.

create or replace function public.prepare_controlled_weekly_test_session(
  _student_id uuid,
  _controlled_test_run_id uuid
)
returns table(session_id uuid, was_created boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_student public.students%rowtype;
  v_chat public.whatsapp_chats%rowtype;
  v_flow public.automation_flows%rowtype;
  v_start_node_id uuid;
  v_session_id uuid;
  v_existing_student_id text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if _student_id is null or _controlled_test_run_id is null then
    raise exception 'Student and controlled test run IDs are required' using errcode = '22023';
  end if;

  -- Serializes retries for the same opaque run ID and makes the insert idempotent.
  perform pg_advisory_xact_lock(hashtextextended(_controlled_test_run_id::text, 0));

  select student.* into strict v_student
    from public.students as student
   where student.id = _student_id
     and student.status in ('active', 'awaiting_renewal');

  if not exists (
    select 1
      from public.enrollments as enrollment
     where enrollment.student_id = v_student.id
       and enrollment.company_id = v_student.company_id
       and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
  ) then
    raise exception 'Student has no operational enrollment' using errcode = 'P0002';
  end if;

  -- STRICT is intentional: zero or multiple eligible chats fail closed.
  select chat.* into strict v_chat
    from public.whatsapp_chats as chat
    join public.whatsapp_instances as instance
      on instance.id = chat.instance_id
     and instance.company_id = chat.company_id
     and instance.status = 'connected'
   where chat.student_id = v_student.id
     and chat.company_id = v_student.company_id
     and chat.remote_jid ~ '^[0-9]+@s\.whatsapp\.net$'
     and public.sett_phone_key(split_part(chat.remote_jid, '@', 1)) in (
       public.sett_phone_key(v_student.whatsapp),
       public.sett_phone_key(v_student.phone)
     );

  -- One active weekly flow per tenant. Ambiguity is a configuration error.
  select flow.* into strict v_flow
    from public.automation_flows as flow
   where flow.company_id = v_student.company_id
     and flow.trigger_type = 'weekly_contact'
     and flow.is_active = true;

  -- Require a valid start -> weekly content path before creating the session.
  select start_node.id into strict v_start_node_id
    from public.automation_flow_nodes as start_node
    join public.automation_flow_edges as edge
      on edge.flow_id = start_node.flow_id
     and edge.source_node_id = start_node.id::text
    join public.automation_flow_nodes as content_node
      on content_node.flow_id = start_node.flow_id
     and content_node.id::text = edge.target_node_id
   where start_node.flow_id = v_flow.id
     and coalesce(start_node.node_type, start_node.type) = 'start'
     and coalesce(content_node.node_type, content_node.type) = 'content'
     and content_node.data->>'system_key' = 'weekly_contact_message';

  begin
    select existing.id, existing.context->>'student_id'
      into strict v_session_id, v_existing_student_id
      from public.flow_sessions as existing
     where existing.context->>'controlled_test_run_id' = _controlled_test_run_id::text;

    if v_existing_student_id is distinct from v_student.id::text then
      raise exception 'Controlled test run ID is already bound to another student' using errcode = '23505';
    end if;

    return query select v_session_id, false;
    return;
  exception
    when no_data_found then
      null;
    when too_many_rows then
      raise exception 'Controlled test run ID is not unique' using errcode = '23505';
  end;

  if exists (
    select 1
      from public.flow_sessions as existing
     where existing.chat_id = v_chat.id
       and existing.context->>'trigger_type' = 'weekly_contact'
       and existing.status in ('active', 'waiting_response', 'processing')
  ) then
    raise exception 'Another weekly contact session is already open for this recipient' using errcode = '55000';
  end if;

  insert into public.flow_sessions (
    flow_id,
    chat_id,
    current_node_id,
    status,
    context,
    started_at,
    last_activity_at,
    created_at,
    updated_at
  ) values (
    v_flow.id,
    v_chat.id,
    v_start_node_id::text,
    'active',
    jsonb_build_object(
      'trigger_type', 'weekly_contact',
      'controlled_test', true,
      'controlled_test_run_id', _controlled_test_run_id::text,
      'automation_key', 'controlled_weekly_test:' || _controlled_test_run_id::text,
      'student_id', v_student.id,
      'student_name', v_student.full_name,
      'contact_objective', 'Perguntar se o aluno teve dificuldade no treino e se quer mandar video para correcao.',
      'copy_seed', 0,
      'contacts_last_7d_before', 0
    ),
    now(),
    now(),
    now(),
    now()
  ) returning id into v_session_id;

  return query select v_session_id, true;
exception
  when no_data_found then
    raise exception 'Controlled weekly test prerequisites are incomplete' using errcode = 'P0002';
  when too_many_rows then
    raise exception 'Controlled weekly test prerequisites are ambiguous' using errcode = '21000';
end;
$function$;

revoke all on function public.prepare_controlled_weekly_test_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_controlled_weekly_test_session(uuid, uuid) to service_role;

comment on function public.prepare_controlled_weekly_test_session(uuid, uuid) is
  'Creates at most one exact weekly-contact test session after strict recipient, tenant, enrollment, provider and flow checks. Does not send.';

create or replace function public.cancel_controlled_weekly_test_session(_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cancelled boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  update public.flow_sessions as session
     set status = 'cancelled',
         context = coalesce(session.context, '{}'::jsonb)
           || jsonb_build_object('controlled_test_cancelled_at', now()),
         last_activity_at = now(),
         updated_at = now()
   where session.id = _session_id
     and coalesce((coalesce(session.context, '{}'::jsonb)->>'controlled_test')::boolean, false) = true
     and session.status in ('active', 'waiting_response')
  returning true into v_cancelled;

  return coalesce(v_cancelled, false);
end;
$function$;

revoke all on function public.cancel_controlled_weekly_test_session(uuid) from public, anon, authenticated;
grant execute on function public.cancel_controlled_weekly_test_session(uuid) to service_role;

comment on function public.cancel_controlled_weekly_test_session(uuid) is
  'Cancels an unsent controlled weekly test session while retaining the row as audit evidence.';
