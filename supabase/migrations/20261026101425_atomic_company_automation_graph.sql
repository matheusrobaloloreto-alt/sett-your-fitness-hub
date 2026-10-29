begin;
alter table public.automation_flows add column graph_revision bigint not null default 0;

create function public.save_company_automation_graph(_company_id uuid, _flow_id uuid, _expected_revision bigint, _nodes jsonb, _edges jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid(); v_revision bigint; v_trigger text;
  v_node jsonb; v_data jsonb; v_rule jsonb; v_type text; v_key text;
begin
  if v_actor is null or not (
    public.has_role(v_actor,'master'::public.app_role) or
    (exists(select 1 from public.company_members where user_id=v_actor and company_id=_company_id) and (
      public.has_role(v_actor,'admin'::public.app_role) or exists (
        select 1 from public.user_roles ur
        join public.role_permissions rp on rp.role=ur.role and rp.company_id=_company_id
        where ur.user_id=v_actor and ur.role in ('coordinator'::public.app_role,'trainer'::public.app_role)
          and rp.module='whatsapp' and rp.enabled=true
      )
    ))
  ) then raise exception 'flow_graph_forbidden' using errcode='42501'; end if;
  select graph_revision,trigger_type into v_revision,v_trigger from public.automation_flows where id=_flow_id and company_id=_company_id for update;
  if not found then raise exception 'flow_graph_forbidden' using errcode='42501'; end if;
  if _expected_revision is null or _expected_revision < 0 or v_revision <> _expected_revision then raise exception 'flow_graph_revision_conflict: recarregue o fluxo' using errcode='PT409'; end if;
  if jsonb_typeof(_nodes) is distinct from 'array' or jsonb_typeof(_edges) is distinct from 'array' then raise exception 'flow_graph_arrays_required' using errcode='22023'; end if;
  if jsonb_array_length(_nodes) not between 1 and 500 or jsonb_array_length(_edges)>1000 then raise exception 'flow_graph_size_invalid' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(_nodes) n where n->>'node_type'='start') <> 1 then raise exception 'flow_graph_requires_one_start' using errcode='22023'; end if;
  if (select count(distinct n->>'id') from jsonb_array_elements(_nodes) n) <> jsonb_array_length(_nodes) then raise exception 'flow_graph_duplicate_node' using errcode='22023'; end if;

  for v_node in select value from jsonb_array_elements(_nodes) loop
    perform (v_node->>'id')::uuid;
    if v_node->>'id' is null then raise exception 'flow_node_id_required' using errcode='22023'; end if;
    if exists(select 1 from public.automation_flow_nodes where id=(v_node->>'id')::uuid and flow_id<>_flow_id) then raise exception 'flow_graph_foreign_node' using errcode='42501'; end if;
    v_type := v_node->>'node_type'; v_data := coalesce(v_node->'data','{}'::jsonb);
    if v_type is null or v_type not in ('start','content','menu','condition','action','flow_connection') or jsonb_typeof(v_data)<>'object' then raise exception 'flow_node_unsupported' using errcode='22023'; end if;
    if v_data ? 'wait_for_reply' and jsonb_typeof(v_data->'wait_for_reply')<>'boolean' then raise exception 'flow_wait_for_reply_requires_boolean' using errcode='22023'; end if;
    foreach v_key in array array['message','prompt'] loop
      if v_data ? v_key and (jsonb_typeof(v_data->v_key)<>'string' or length(v_data->>v_key)>6000) then raise exception 'flow_message_requires_text' using errcode='22023'; end if;
    end loop;
    if v_data ? 'delay_minutes' and (jsonb_typeof(v_data->'delay_minutes')<>'number' or not (v_data->>'delay_minutes' ~ '^\d+$') or (v_data->>'delay_minutes')::numeric not between 0 and 10080) then raise exception 'flow_delay_invalid' using errcode='22023'; end if;
    if v_data ? 'use_company_template' and (v_type<>'content' or v_trigger<>'weekly_contact' or v_data->>'use_company_template'<>'weekly_contact') then raise exception 'flow_company_template_binding_unsupported' using errcode='22023'; end if;
    if v_data->>'wait_for_reply'='true' then
      v_key := coalesce(v_data->>'save_response_as','name');
      if v_key not in ('name','nome','email','goal','custom') then raise exception 'flow_response_field_unsupported' using errcode='22023'; end if;
      if v_key='custom' then
        v_key := coalesce(v_data->>'custom_variable','');
        if v_key !~ '^[a-z][a-z0-9_]{0,39}$' or v_key ~ '^(is_student|company_id|student_id|trigger_type|recipient_|dispatch_|next_dispatch_at|copy_seed|contacts_last_7d|automation_key|constructor$|prototype$)' then raise exception 'flow_response_variable_reserved' using errcode='22023'; end if;
      end if;
    end if;
    if v_type='action' and (v_data->>'action_type' is distinct from 'tag' or jsonb_typeof(v_data->'tag_name') is distinct from 'string' or length(trim(coalesce(v_data->>'tag_name',''))) not between 1 and 80) then raise exception 'flow_action_requires_tag; notify/update_status unsupported' using errcode='22023'; end if;
    if v_type='condition' then
      if jsonb_typeof(v_data->'conditions') is distinct from 'array' then raise exception 'flow_condition_requires_structured_rules' using errcode='22023'; end if;
      if jsonb_array_length(v_data->'conditions') not between 1 and 20 or coalesce(v_data->>'logic','or') not in ('and','or') then raise exception 'flow_condition_invalid' using errcode='22023'; end if;
      for v_rule in select value from jsonb_array_elements(v_data->'conditions') loop
        if coalesce(v_rule->>'field','') not in ('is_student','name','nome','email','goal','payment_status','provider_status','trigger_type') or coalesce(v_rule->>'operator','') not in ('eq','neq','contains','exists') then raise exception 'flow_condition_rule_unsupported' using errcode='22023'; end if;
        if v_rule->>'operator'<>'exists' and coalesce(jsonb_typeof(v_rule->'value'),'null') not in ('string','number','boolean') then raise exception 'flow_condition_value_required' using errcode='22023'; end if;
        if v_rule->>'operator'='contains' and jsonb_typeof(v_rule->'value') is distinct from 'string' then raise exception 'flow_condition_contains_requires_text' using errcode='22023'; end if;
        if v_rule->>'field'='is_student' and v_rule->>'operator'<>'exists' and jsonb_typeof(v_rule->'value') is distinct from 'boolean' then raise exception 'flow_condition_student_requires_boolean' using errcode='22023'; end if;
      end loop;
    end if;
    if v_type='flow_connection' then
      if v_data->>'target_flow_id' is null or (v_data->>'target_flow_id')::uuid=_flow_id or not exists(select 1 from public.automation_flows where id=(v_data->>'target_flow_id')::uuid and company_id=_company_id and is_active=true) then raise exception 'flow_target_missing_inactive_or_foreign' using errcode='22023'; end if;
    end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(_edges) e where
    not exists(select 1 from jsonb_array_elements(_nodes) n where n->>'id'=e->>'source_node_id') or
    not exists(select 1 from jsonb_array_elements(_nodes) n where n->>'id'=e->>'target_node_id')) then raise exception 'flow_graph_edge_endpoint_missing' using errcode='22023'; end if;
  if exists(select 1 from public.flow_sessions s where s.flow_id=_flow_id and s.status in ('active','waiting_response','processing') and s.current_node_id is not null and not exists(select 1 from jsonb_array_elements(_nodes) n where n->>'id'=s.current_node_id)) then raise exception 'flow_graph_node_has_pending_sessions' using errcode='55000'; end if;

  -- Both deletes and both inserts participate in this same RPC transaction.
  delete from public.automation_flow_edges where flow_id=_flow_id;
  delete from public.automation_flow_nodes where flow_id=_flow_id;
  insert into public.automation_flow_nodes(id,flow_id,type,node_type,label,data,position_x,position_y)
    select (n->>'id')::uuid,_flow_id,n->>'node_type',n->>'node_type',n->>'label',coalesce(n->'data','{}'::jsonb),(n->>'position_x')::numeric,(n->>'position_y')::numeric from jsonb_array_elements(_nodes) n;
  insert into public.automation_flow_edges(flow_id,source_node_id,target_node_id,source_handle,label)
    select _flow_id,e->>'source_node_id',e->>'target_node_id',e->>'source_handle',e->>'label' from jsonb_array_elements(_edges) e;
  update public.automation_flows set graph_revision=graph_revision+1,updated_at=now() where id=_flow_id and company_id=_company_id returning graph_revision into v_revision;
  return jsonb_build_object('revision',v_revision);
end;
$$;
revoke all on function public.save_company_automation_graph(uuid,uuid,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.save_company_automation_graph(uuid,uuid,bigint,jsonb,jsonb) to authenticated;
-- An authenticated editor cannot bypass revision/atomicity through direct graph DML.
revoke insert,update,delete on public.automation_flow_nodes,public.automation_flow_edges from authenticated;
commit;
