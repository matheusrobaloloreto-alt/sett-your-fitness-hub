-- Feature adoption is independent of quantitative admission opt-ins and billing.
create schema if not exists commercial_private;
revoke all on schema commercial_private from public, anon, authenticated;

create table public.company_feature_policies (
  company_id uuid primary key references public.companies(id) on delete cascade,
  version integer not null check (version > 0),
  source text not null check (source in ('legacy','catalog')),
  tier text not null check (tier in ('basic','intermediate','advanced')),
  catalog_version integer,
  features jsonb not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);
create table public.company_feature_policy_history (
  like public.company_feature_policies including defaults including constraints,
  primary key (company_id, version)
);
alter table public.company_feature_policies enable row level security;
alter table public.company_feature_policy_history enable row level security;
revoke all on public.company_feature_policies, public.company_feature_policy_history from public, anon, authenticated;
grant select on public.company_feature_policy_history to authenticated;
create policy feature_policy_history_master on public.company_feature_policy_history
  for select to authenticated using (public.has_role(auth.uid(),'master'::public.app_role));

create function commercial_private.feature_keys() returns text[]
language sql immutable set search_path='' as $$
  select array['hasPrescription','hasDashboard','hasRegistration','hasAnamnesis',
    'hasStudents','hasAgenda','hasTeam','hasPlans','hasAppearance','hasFinancial',
    'hasWhatsApp','hasAutomation']::text[];
$$;
create function commercial_private.effective_features(_company_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('company_id',c.id,'tier',c.tier,
    'source',coalesce(p.source,'legacy'),'version',coalesce(p.version,0),
    'catalog_version',p.catalog_version,'adopted_tier',p.tier,
    'features',case when p.source='catalog' then p.features else
      (select jsonb_object_agg(k,true) from unnest(commercial_private.feature_keys()) k) end)
  from public.companies c left join public.company_feature_policies p on p.company_id=c.id
  where c.id=_company_id;
$$;
create function commercial_private.feature_allowed(_company_id uuid,_feature text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(_feature=any(commercial_private.feature_keys()) and
    (commercial_private.effective_features(_company_id)->'features'->_feature)='true'::jsonb,false);
$$;

create function public.get_company_feature_entitlements(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'master'::public.app_role) or
    exists(select 1 from public.company_members where user_id=auth.uid() and company_id=_company_id) or
    exists(select 1 from public.students where user_id=auth.uid() and company_id=_company_id)) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  result:=commercial_private.effective_features(_company_id);
  if result is null then raise exception 'Company not found' using errcode='22023'; end if;
  return result;
end $$;
revoke all on function public.get_company_feature_entitlements(uuid) from public,anon;
grant execute on function public.get_company_feature_entitlements(uuid) to authenticated;

-- Service consumer already authenticates its caller and resolves the tenant.
create function public.service_company_feature_allowed(_company_id uuid,_feature text) returns boolean
language sql stable security definer set search_path='' as $$
  select commercial_private.feature_allowed(_company_id,_feature);
$$;
revoke all on function public.service_company_feature_allowed(uuid,text) from public,anon,authenticated;
grant execute on function public.service_company_feature_allowed(uuid,text) to service_role;

create function public.company_feature_allowed(_company_id uuid,_feature text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and
    (public.has_role(auth.uid(),'master'::public.app_role) or
      exists(select 1 from public.company_members where user_id=auth.uid() and company_id=_company_id) or
      exists(select 1 from public.students where user_id=auth.uid() and company_id=_company_id))
    and commercial_private.feature_allowed(_company_id,_feature);
$$;
revoke all on function public.company_feature_allowed(uuid,text) from public,anon;
grant execute on function public.company_feature_allowed(uuid,text) to authenticated;

create function public.set_company_feature_policy(_company_id uuid,_source text,
  _expected_version integer,_catalog_version integer,_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.companies%rowtype; p public.company_feature_policies%rowtype;
  catalog jsonb; catalog_version integer; feature_values jsonb; k text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'master'::public.app_role) then
    raise exception 'Master only' using errcode='42501';
  end if;
  if _source is null or _source not in ('legacy','catalog') or _confirm is distinct from true
    or _expected_version is null or _expected_version<0 then
    raise exception 'Explicit feature policy confirmation required' using errcode='22023';
  end if;
  select * into c from public.companies where id=_company_id for update;
  if not found then raise exception 'Company not found' using errcode='22023'; end if;
  select * into p from public.company_feature_policies where company_id=_company_id;
  if coalesce(p.version,0)<>_expected_version then raise exception 'Feature policy changed' using errcode='PT409'; end if;
  -- Serialize with catalog saves; never copy a newer unreviewed catalog.
  select settings,version into catalog,catalog_version from public.platform_product_settings where id='default' for share;
  if c.tier not in ('basic','intermediate','advanced') or c.tier is null then
    raise exception 'Unknown company tier' using errcode='22023';
  end if;
  if _source='catalog' then
    if _catalog_version is distinct from catalog_version or catalog_version is null then
      raise exception 'Catalog changed' using errcode='PT409';
    end if;
    feature_values:=catalog#>array['tiers',c.tier,'features'];
    if jsonb_typeof(feature_values) is distinct from 'object' then raise exception 'Invalid features' using errcode='22023'; end if;
    if (select count(*) from jsonb_object_keys(feature_values))<>12 then raise exception 'Invalid features' using errcode='22023'; end if;
    foreach k in array commercial_private.feature_keys() loop
      if jsonb_typeof(feature_values->k) is distinct from 'boolean' then raise exception 'Invalid feature' using errcode='22023'; end if;
    end loop;
  else
    select jsonb_object_agg(key,true) into feature_values from unnest(commercial_private.feature_keys()) key;
    catalog_version:=null;
  end if;
  insert into public.company_feature_policies(company_id,version,source,tier,catalog_version,features,changed_by)
    values(_company_id,_expected_version+1,_source,c.tier,catalog_version,feature_values,auth.uid())
    on conflict(company_id) do update set version=excluded.version,source=excluded.source,
      tier=excluded.tier,catalog_version=excluded.catalog_version,features=excluded.features,
      changed_by=excluded.changed_by,changed_at=now();
  insert into public.company_feature_policy_history select * from public.company_feature_policies where company_id=_company_id;
  return commercial_private.effective_features(_company_id);
end $$;
revoke all on function public.set_company_feature_policy(uuid,text,integer,integer,boolean) from public,anon;
grant execute on function public.set_company_feature_policy(uuid,text,integer,integer,boolean) to authenticated;

-- Resolve child ownership without relying on caller-visible parent rows.
create function public.company_feature_flow_allowed(_flow_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select public.company_feature_allowed(company_id,'hasAutomation')
    from public.automation_flows where id=_flow_id),false);
$$;
revoke all on function public.company_feature_flow_allowed(uuid) from public,anon;
grant execute on function public.company_feature_flow_allowed(uuid) to authenticated;

create function commercial_private.guard_feature_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_value jsonb; target uuid; previous uuid; feature text:=tg_argv[0];
begin
  -- Authorization remains with existing RLS/RPCs. Commercial access never
  -- prevents security revocation or FK cleanup after a parent disappears.
  if tg_op='DELETE' then return old; end if;
  row_value:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_argv[1]='flow_id' then
    select company_id into target from public.automation_flows where id=(row_value->>'flow_id')::uuid;
    if tg_op='UPDATE' then select company_id into previous from public.automation_flows where id=old.flow_id; end if;
  else
    target:=(row_value->>'company_id')::uuid;
    if tg_op='UPDATE' then previous:=(to_jsonb(old)->>'company_id')::uuid; end if;
  end if;
  if not commercial_private.feature_allowed(target,feature) or
    (previous is not null and not commercial_private.feature_allowed(previous,feature)) then
    raise exception 'Company feature unavailable: %',feature using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

-- These tables are exclusive configuration surfaces, not shared clinical data.
-- Optional modules absent in a deployment are inventoried in the handoff.
do $$
declare entry record;
begin
  for entry in select * from (values
    ('company_members','hasTeam',false),('staff_sessions','hasTeam',false),
    ('whatsapp_instances','hasWhatsApp',false),('whatsapp_labels','hasWhatsApp',false),
    ('whatsapp_chats','hasWhatsApp',false),('whatsapp_messages','hasWhatsApp',false),
    ('message_templates','hasWhatsApp',false),('automation_flows','hasAutomation',false),
    ('automation_flow_nodes','hasAutomation',true),('automation_flow_edges','hasAutomation',true),
    ('automation_flow_steps','hasAutomation',true),('payments','hasFinancial',false),
    ('plans','hasPlans',false)
  ) as t(table_name,feature,child) loop
    if to_regclass('public.'||entry.table_name) is null then continue; end if;
    if entry.table_name='company_members' then
      -- Membership reads are also an authentication dependency, not a paid view.
      execute 'create policy commercial_feature_insert on public.company_members as restrictive for insert to authenticated with check (public.company_feature_allowed(company_id,''hasTeam''))';
      execute 'create policy commercial_feature_update on public.company_members as restrictive for update to authenticated using (public.company_feature_allowed(company_id,''hasTeam'')) with check (public.company_feature_allowed(company_id,''hasTeam''))';
    else
    execute format('create policy commercial_feature_gate on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      entry.table_name,
      case when entry.child then 'public.company_feature_flow_allowed(flow_id)' else format('public.company_feature_allowed(company_id,%L)',entry.feature) end,
      case when entry.child then 'public.company_feature_flow_allowed(flow_id)' else format('public.company_feature_allowed(company_id,%L)',entry.feature) end);
    end if;
    -- Settlement/inbound history must remain writable; outbound is Edge gated.
    if entry.table_name not in ('payments','whatsapp_messages','whatsapp_chats') then
      execute format('create trigger commercial_feature_write before insert or update or delete on public.%I for each row execute function commercial_private.guard_feature_write(%L,%L)',
        entry.table_name,entry.feature,case when entry.child then 'flow_id' else 'company_id' end);
    end if;
  end loop;
end $$;
revoke all on all functions in schema commercial_private from public,anon,authenticated;

-- Shared data remains readable. Only creation/edit/publication/configuration is
-- gated here; workout logs, responses, consent and existing plans are untouched.
create function commercial_private.row_company(_row jsonb,_mode text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
  result:=(_row->>'company_id')::uuid;
  if result is not null then return result; end if;
  if _mode='cycle_id' then
    execute 'select coalesce(to_jsonb(c)->>''company_id'',to_jsonb(e)->>''company_id'')::uuid from public.training_cycles c left join public.enrollments e on e.id=c.enrollment_id where c.id=$1'
      into result using (_row->>'cycle_id')::uuid;
  elsif _mode='enrollment_id' then
    execute 'select company_id from public.enrollments where id=$1' into result using (_row->>'enrollment_id')::uuid;
  elsif _mode='student_id' then
    select company_id into result from public.students where id=(_row->>'student_id')::uuid;
  end if;
  return result;
end $$;

create function commercial_private.guard_shared_feature_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_value jsonb; old_value jsonb; target uuid; previous uuid;
  feature text:=tg_argv[0]; allowed boolean; k text; before_settings jsonb;
begin
  if tg_op='DELETE' then return old; end if;
  row_value:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  old_value:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  target:=commercial_private.row_company(row_value,tg_argv[1]);
  if tg_op='UPDATE' then previous:=commercial_private.row_company(old_value,tg_argv[1]); end if;
  -- Global branding has its own preexisting Master authorization.
  if tg_table_name='platform_settings' and target is null then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  if feature='form' then
    feature:=case when row_value->>'kind'='pre_registration' or row_value->>'form_type'='pre_registration'
      then 'hasRegistration' when coalesce(row_value->>'kind',row_value->>'form_type') in ('initial','intercycle','anamnese','anamnesis')
      then 'hasAnamnesis' else 'hasPrescription' end;
  end if;
  if feature='settings' then
    if tg_op='INSERT' then
      execute 'select public.company_product_settings_defaults()' into before_settings;
    else before_settings:=old_value->'settings'; end if;
    for k,feature in select * from (values ('brand','hasAppearance'),('prescription','hasPrescription'),
      ('contact_policy','hasAutomation'),('messages','hasWhatsApp'),('business','hasRegistration')) t(k,f) loop
      if (row_value->'settings'->k) is distinct from (before_settings->k) and
        not commercial_private.feature_allowed(target,feature) then
        raise exception 'Company feature unavailable: %',feature using errcode='42501';
      end if;
    end loop;
    if tg_op='DELETE' then raise exception 'Use settings RPC' using errcode='42501'; end if;
    if previous is distinct from target and tg_op='UPDATE' then raise exception 'Company mismatch' using errcode='42501'; end if;
    return new;
  end if;
  allowed:=commercial_private.feature_allowed(target,feature);
  -- A student record is shared by prescribing, anamnesis and registration.
  -- Keep these explicit alternatives rather than treating hasStudents as a kill switch.
  if feature='student_core' then
    allowed:=commercial_private.feature_allowed(target,'hasStudents') or
      commercial_private.feature_allowed(target,'hasPrescription') or
      commercial_private.feature_allowed(target,'hasAnamnesis') or
      commercial_private.feature_allowed(target,'hasRegistration');
    if tg_op='UPDATE' and previous is distinct from target then raise exception 'Company mismatch' using errcode='42501'; end if;
  elsif tg_table_name='training_cycles' and tg_op='UPDATE' and
    (old_value - array['start_date','end_date','updated_at'])=(row_value - array['start_date','end_date','updated_at']) then
    allowed:=allowed or commercial_private.feature_allowed(target,'hasAgenda');
  end if;
  if not allowed or (previous is not null and previous is distinct from target and
    not commercial_private.feature_allowed(previous,feature)) then
    raise exception 'Company feature unavailable: %',feature using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;

do $$ declare entry record; begin
  for entry in select * from (values
    ('training_cycles','hasPrescription','enrollment_id','insert or update or delete'),
    ('workouts','hasPrescription','cycle_id','insert or update or delete'),
    ('ai_strength_plans','hasPrescription','student_id','insert or update or delete'),
    ('running_plans','hasPrescription','student_id','insert or update or delete'),
    ('nutrition_plans','hasPrescription','student_id','insert or update or delete'),
    ('prescription_bundles','hasPrescription','student_id','insert or update or delete'),
    ('functional_assessments','hasPrescription','student_id','insert or update or delete'),
    ('company_assessment_protocols','hasPrescription','company_id','insert or update or delete'),
    ('company_ai_config','hasPrescription','company_id','insert or update or delete'),
    ('company_form_definitions','form','company_id','insert'),
    ('form_fields','form','company_id','insert or update or delete'),
    ('anamnese_invites','hasAnamnesis','student_id','insert'),
    ('intercycle_anamnesis_invites','hasAnamnesis','student_id','insert'),
    ('leads','hasRegistration','company_id','insert or update or delete'),
    ('public_registration_links','hasRegistration','student_id','insert'),
    ('platform_settings','hasAppearance','company_id','insert or update or delete'),
    ('company_product_settings','settings','company_id','insert or update or delete'),
    ('students','student_core','company_id','insert')
  ) as t(table_name,feature,mode,operations) loop
    if to_regclass('public.'||entry.table_name) is null then continue; end if;
    execute format('create trigger commercial_shared_feature_write before %s on public.%I for each row execute function commercial_private.guard_shared_feature_mutation(%L,%L)',
      entry.operations,entry.table_name,entry.feature,entry.mode);
  end loop;
end $$;

-- Wrap the actual dedicated report without copying its clinical/XP projection.
do $install$ begin
  if to_regprocedure('public.get_company_dashboard_snapshot(uuid)') is not null then
    alter function public.get_company_dashboard_snapshot(uuid) set schema commercial_private;
    revoke all on function commercial_private.get_company_dashboard_snapshot(uuid) from public,anon,authenticated,service_role;
    execute $wrapper$create function public.get_company_dashboard_snapshot(_company_id uuid) returns jsonb
      language plpgsql stable security definer set search_path='' as $body$
      begin
        if not public.company_feature_allowed(_company_id,'hasDashboard') then raise exception 'Company feature unavailable' using errcode='42501'; end if;
        return commercial_private.get_company_dashboard_snapshot(_company_id);
      end $body$$wrapper$;
    revoke all on function public.get_company_dashboard_snapshot(uuid) from public,anon;
    grant execute on function public.get_company_dashboard_snapshot(uuid) to authenticated;
  end if;
end $install$;

do $install$ begin
  if to_regprocedure('public.reassign_student_trainer(uuid,uuid,uuid)') is not null then
    alter function public.reassign_student_trainer(uuid,uuid,uuid) set schema commercial_private;
    revoke all on function commercial_private.reassign_student_trainer(uuid,uuid,uuid) from public,anon,authenticated,service_role;
    execute $wrapper$create function public.reassign_student_trainer(_student_id uuid,_trainer_id uuid,_expected_trainer_id uuid)
      returns table(student_id uuid,previous_trainer_id uuid,trainer_id uuid,updated_enrollments integer)
      language plpgsql security definer set search_path='' as $body$
      declare company uuid;
      begin
        select company_id into company from public.students where id=_student_id;
        if not (public.company_feature_allowed(company,'hasStudents') or public.company_feature_allowed(company,'hasTeam')
          or public.company_feature_allowed(company,'hasPrescription')) then raise exception 'Company feature unavailable' using errcode='42501'; end if;
        return query select * from commercial_private.reassign_student_trainer(_student_id,_trainer_id,_expected_trainer_id);
      end $body$$wrapper$;
    revoke all on function public.reassign_student_trainer(uuid,uuid,uuid) from public,anon;
    grant execute on function public.reassign_student_trainer(uuid,uuid,uuid) to authenticated,service_role;
  end if;
  if to_regprocedure('public.set_registration_lead_stage(uuid,text,uuid,text,text)') is not null then
    alter function public.set_registration_lead_stage(uuid,text,uuid,text,text) set schema commercial_private;
    revoke all on function commercial_private.set_registration_lead_stage(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
    execute $wrapper$create function public.set_registration_lead_stage(_company_id uuid,_entity_type text,_record_id uuid,_expected_stage text,_target_stage text) returns jsonb
      language plpgsql security definer set search_path='' as $body$
      begin
        if not public.company_feature_allowed(_company_id,'hasRegistration') then raise exception 'Company feature unavailable' using errcode='42501'; end if;
        return commercial_private.set_registration_lead_stage(_company_id,_entity_type,_record_id,_expected_stage,_target_stage);
      end $body$$wrapper$;
    revoke all on function public.set_registration_lead_stage(uuid,text,uuid,text,text) from public,anon;
    grant execute on function public.set_registration_lead_stage(uuid,text,uuid,text,text) to authenticated;
  end if;
  if to_regprocedure('public.reschedule_training_cycles_from(uuid,uuid,date)') is not null then
    alter function public.reschedule_training_cycles_from(uuid,uuid,date) set schema commercial_private;
    revoke all on function commercial_private.reschedule_training_cycles_from(uuid,uuid,date) from public,anon,authenticated,service_role;
    execute $wrapper$create function public.reschedule_training_cycles_from(p_enrollment_id uuid,p_cycle_id uuid,p_new_start_date date) returns void
      language plpgsql security definer set search_path='' as $body$
      declare company uuid;
      begin
        select company_id into company from public.enrollments where id=p_enrollment_id;
        if not (public.company_feature_allowed(company,'hasAgenda') or public.company_feature_allowed(company,'hasPrescription')) then raise exception 'Company feature unavailable' using errcode='42501'; end if;
        perform commercial_private.reschedule_training_cycles_from(p_enrollment_id,p_cycle_id,p_new_start_date);
      end $body$$wrapper$;
    revoke all on function public.reschedule_training_cycles_from(uuid,uuid,date) from public,anon;
    grant execute on function public.reschedule_training_cycles_from(uuid,uuid,date) to authenticated;
  end if;
end $install$;
revoke all on all functions in schema commercial_private from public,anon,authenticated;
