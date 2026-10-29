-- Empty disposable local database only. No production identity/data/provider.
create schema auth;
create type public.app_role as enum ('master','admin','trainer','coordinator','student');
create table public.companies(id uuid primary key);
create table public.company_members(user_id uuid,company_id uuid);
create table public.user_roles(user_id uuid,role public.app_role);
create table public.role_permissions(company_id uuid,role public.app_role,module text,enabled boolean);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.auth_uid',true),'')::uuid $$;
create function public.has_role(uuid,public.app_role) returns boolean language sql stable as $$ select exists(select 1 from public.user_roles where user_id=$1 and role=$2) $$;
create table public.automation_flows(id uuid primary key,company_id uuid,trigger_type text,is_active boolean,updated_at timestamptz);
create table public.automation_flow_nodes(id uuid primary key,flow_id uuid,type text,node_type text,label text,data jsonb,position_x numeric,position_y numeric);
create table public.automation_flow_edges(id uuid primary key default gen_random_uuid(),flow_id uuid,source_node_id text,target_node_id text,source_handle text,label text);
create table public.flow_sessions(flow_id uuid,current_node_id text,status text);
-- ATOMIC_MIGRATION
insert into public.companies values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.company_members values ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002');
insert into public.user_roles values ('00000000-0000-0000-0000-000000000010','admin'),('00000000-0000-0000-0000-000000000020','admin');
insert into public.automation_flows(id,company_id,trigger_type,is_active) values ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001','weekly_contact',true);
select set_config('test.auth_uid','00000000-0000-0000-0000-000000000010',false);
create function public.synthetic_edge_failure() returns trigger language plpgsql as $$ begin if new.label='synthetic_failure' then raise exception 'synthetic_edge_failure' using errcode='23514'; end if; return new; end $$;
create trigger synthetic_edge_failure before insert on public.automation_flow_edges for each row execute function public.synthetic_edge_failure();
do $$
declare
  v_nodes jsonb := '[{"id":"00000000-0000-0000-0000-000000000101","node_type":"start","data":{}},{"id":"00000000-0000-0000-0000-000000000102","node_type":"content","data":{"message":"Original"}}]';
  v_edges jsonb := '[{"source_node_id":"00000000-0000-0000-0000-000000000101","target_node_id":"00000000-0000-0000-0000-000000000102"}]';
  v_bad jsonb; v_key text; v_state text; v_before jsonb;
begin
  assert (public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',0,v_nodes,v_edges)->>'revision')::integer=1;
  select jsonb_agg(to_jsonb(n) order by id) into v_before from public.automation_flow_nodes n;
  -- The edge trigger fails AFTER both deletes and node reinsert. Every mutation must roll back.
  begin
    perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,jsonb_set(v_nodes,'{1,data,message}','"Changed"'),jsonb_set(v_edges,'{0,label}','"synthetic_failure"'));
  exception when others then get stacked diagnostics v_state=returned_sqlstate;
  end;
  assert v_state='23514';
  assert (select graph_revision=1 from public.automation_flows);
  assert v_before=(select jsonb_agg(to_jsonb(n) order by id) from public.automation_flow_nodes n);
  assert (select count(*)=1 and bool_and(label is null) from public.automation_flow_edges);
  v_state:=null;
  begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',0,v_nodes,v_edges);
  exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
  assert v_state='PT409';
  -- Unsupported actions/node types are rejected, never saved as silent no-ops.
  foreach v_key in array array['notify','update_status','unknown'] loop
    v_bad:=jsonb_set(jsonb_set(v_nodes,'{1,node_type}','"action"'),'{1,data}',jsonb_build_object('action_type',v_key)); v_state:=null;
    begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_bad,v_edges);
    exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
    assert v_state='22023';
  end loop;
  v_bad:=jsonb_set(v_nodes,'{1,node_type}','"unsupported"'); v_state:=null;
  begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_bad,v_edges);
  exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
  assert v_state='22023';
  v_bad:=jsonb_set(jsonb_set(v_nodes,'{1,node_type}','"condition"'),'{1,data}','{"conditions":[{"field":"is_student","operator":"eval","value":"prose"}]}'); v_state:=null;
  begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_bad,v_edges);
  exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
  assert v_state='22023';
  assert (select graph_revision=1 from public.automation_flows);
  assert v_before=(select jsonb_agg(to_jsonb(n) order by id) from public.automation_flow_nodes n);
  foreach v_key in array array['is_student','company_id','_delay','_flow_path','_reply_save_as','student_id','recipient_generation','constructor'] loop
    v_bad:=jsonb_set(v_nodes,'{1,data}',jsonb_build_object('wait_for_reply',true,'save_response_as','custom','custom_variable',v_key)); v_state:=null;
    begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_bad,v_edges);
    exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
    assert v_state='22023';
  end loop;
  perform set_config('test.auth_uid','00000000-0000-0000-0000-000000000020',false); v_state:=null;
  begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_nodes,v_edges);
  exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
  assert v_state='42501';
  -- Same-tenant staff need an explicit enabled WhatsApp grant for one of their roles.
  perform set_config('test.auth_uid','00000000-0000-0000-0000-000000000010',false);
  delete from public.user_roles where user_id=auth.uid();
  for v_key in select unnest(array['coordinator','trainer']) loop
    insert into public.user_roles values(auth.uid(),v_key::public.app_role);
    v_state:=null;
    begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_nodes,v_edges);
    exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
    assert v_state='42501';
    insert into public.role_permissions values('00000000-0000-0000-0000-000000000001',v_key::public.app_role,'whatsapp',true);
    assert (public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_nodes,v_edges)->>'revision')::integer=2;
    update public.automation_flows set graph_revision=1;
    update public.role_permissions set enabled=false;
    v_state:=null;
    begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_nodes,v_edges);
    exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
    assert v_state='42501';
    -- A grant belonging to another tenant must not authorize this tenant.
    insert into public.role_permissions values('00000000-0000-0000-0000-000000000002',v_key::public.app_role,'whatsapp',true);
    v_state:=null;
    begin perform public.save_company_automation_graph('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000100',1,v_nodes,v_edges);
    exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
    assert v_state='42501';
    delete from public.role_permissions;
    delete from public.user_roles where user_id=auth.uid();
  end loop;
  assert not has_function_privilege('anon','public.save_company_automation_graph(uuid,uuid,bigint,jsonb,jsonb)','execute');
  assert not has_table_privilege('authenticated','public.automation_flow_nodes','INSERT');
end $$;
select 'atomic_automation_graph_local_passed';
