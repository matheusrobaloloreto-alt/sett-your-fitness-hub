-- Forward-only bounded operations. No historical stages or financial statuses rewritten.
create table public.company_operations (
 company_id uuid primary key references public.companies(id) on delete cascade,
 settings jsonb not null, version integer not null check(version>0),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.company_operations_history (
 company_id uuid not null references public.companies(id) on delete cascade,
 version integer not null,settings jsonb not null,updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),primary key(company_id,version)
);
alter table public.company_operations enable row level security;
alter table public.company_operations_history enable row level security;
revoke all on public.company_operations,public.company_operations_history from public,anon,authenticated;
-- Access only through the authorized RPCs; no direct writes or cross-tenant reads.
create function public.operations_staff(_company_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and (public.has_role(auth.uid(),'master'::public.app_role) or
 (exists(select 1 from public.company_members where company_id=_company_id and user_id=auth.uid()) and
 (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'coordinator'::public.app_role) or public.has_role(auth.uid(),'trainer'::public.app_role))));
$$;
create function public.company_operations_defaults() returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select '{"stages":[{"code":"interested","label":"Novos cadastros","visible":true},{"code":"contacted","label":"Contato feito","visible":true},{"code":"fiscal_registration_pending","label":"Cadastro + plano","visible":true},{"code":"payment_pending","label":"Pagamento Asaas","visible":true},{"code":"active_onboarding","label":"Avaliacao e onboarding","visible":true},{"code":"active","label":"Aluno ativo","visible":true},{"code":"lost","label":"Leads","visible":true}],"transitions":[{"from":"interested","to":"contacted"},{"from":"interested","to":"fiscal_registration_pending"},{"from":"interested","to":"lost"},{"from":"contacted","to":"interested"},{"from":"contacted","to":"fiscal_registration_pending"},{"from":"contacted","to":"lost"},{"from":"fiscal_registration_pending","to":"interested"},{"from":"fiscal_registration_pending","to":"contacted"},{"from":"fiscal_registration_pending","to":"lost"},{"from":"lost","to":"contacted"}],"reports":[]}'::jsonb;
$$;
-- Preserve pre-existing commercial labels when the first operations version is saved.
create function public.company_operations_baseline(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb:=public.company_operations_defaults();labels jsonb;stages jsonb;
begin
 select settings->'funnel_labels' into labels from public.company_commercial_settings where company_id=_company_id;
 select jsonb_agg(case when length(coalesce(labels->>(stage->>'code'),''))>0
 then stage||jsonb_build_object('label',labels->>(stage->>'code')) else stage end order by ordinal)
 into stages from jsonb_array_elements(result->'stages') with ordinality as e(stage,ordinal);
 return jsonb_set(result,'{stages}',stages);
end;
$$;
create function public.validate_company_operations(_settings jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare s jsonb;t jsonb;r jsonb;seen text[]:='{}';ids text[]:='{}';pairs text[]:='{}';
 codes text[]:=array['interested','contacted','fiscal_registration_pending','payment_pending','active_onboarding','active','lost'];
 ops text[]:=array['interested','contacted','fiscal_registration_pending','lost'];
begin
 if jsonb_typeof(_settings) is distinct from 'object' or octet_length(_settings::text)>20000
 or (select count(*) from jsonb_object_keys(_settings))<>3
 or not (_settings ?& array['stages','transitions','reports']) then raise exception 'Invalid operations' using errcode='22023'; end if;
 if jsonb_typeof(_settings->'stages') is distinct from 'array' or jsonb_typeof(_settings->'transitions') is distinct from 'array'
 or jsonb_typeof(_settings->'reports') is distinct from 'array' then raise exception 'Invalid operations lists' using errcode='22023'; end if;
 if jsonb_array_length(_settings->'stages')<>7 or jsonb_array_length(_settings->'transitions')>12 or jsonb_array_length(_settings->'reports')>8 then raise exception 'Invalid operations size' using errcode='22023'; end if;
 for s in select * from jsonb_array_elements(_settings->'stages') loop
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'Invalid stage' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(s))<>3 or not(s ?& array['code','label','visible'])
  or not coalesce(s->>'code'=any(codes),false) or s->>'code'=any(seen)
  or jsonb_typeof(s->'visible') is distinct from 'boolean'
  or not public.commercial_plain_text(s->'label',80) or length(btrim(s->>'label'))=0
  or (not(s->>'code'=any(ops)) and s->>'visible'<>'true') then raise exception 'Invalid stage' using errcode='22023'; end if;
  seen:=array_append(seen,s->>'code');
 end loop;
 for t in select * from jsonb_array_elements(_settings->'transitions') loop
  if jsonb_typeof(t) is distinct from 'object' then raise exception 'Invalid transition' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(t))<>2 or not(t ?& array['from','to'])
  or not coalesce(t->>'from'=any(ops),false) or not coalesce(t->>'to'=any(ops),false)
  or t->>'from'=t->>'to' or (t->>'from'='lost' and t->>'to'<>'contacted') or (t->>'from'||':'||t->>'to')=any(pairs) then raise exception 'Invalid transition' using errcode='22023'; end if;
  pairs:=array_append(pairs,t->>'from'||':'||t->>'to');
 end loop;
 for r in select * from jsonb_array_elements(_settings->'reports') loop
  if jsonb_typeof(r) is distinct from 'object' then raise exception 'Invalid report' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(r))<>4 or not(r ?& array['id','title','metric','display'])
  or jsonb_typeof(r->'id') is distinct from 'string' or not coalesce(r->>'id' ~ '^[a-z0-9_-]{1,40}$',false) or r->>'id'=any(ids)
  or not public.commercial_plain_text(r->'title',80) or length(btrim(r->>'title'))=0
  or not coalesce(r->>'metric' in ('active','pending','awaiting_renewal','inactive'),false)
  or not coalesce(r->>'display' in ('count','share'),false) then raise exception 'Invalid report' using errcode='22023'; end if;
  ids:=array_append(ids,r->>'id');
 end loop;
 return _settings;
end;
$$;
create function public.get_company_operations(_company_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if _company_id is null or not public.operations_staff(_company_id) or not (public.company_feature_allowed(_company_id,'hasRegistration') or public.company_feature_allowed(_company_id,'hasDashboard')) then raise exception 'Not authorized' using errcode='42501'; end if;
 select jsonb_build_object('settings',settings,'version',version) into result from public.company_operations where company_id=_company_id;
 return coalesce(result,jsonb_build_object('settings',public.company_operations_baseline(_company_id),'version',0));
end;
$$;
create function public.save_company_operations(_company_id uuid,_settings jsonb,_expected_version integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer;validated jsonb;baseline jsonb;
begin
 if _company_id is null or auth.uid() is null or not public.can_manage_company_commercial(_company_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if _expected_version is null or _expected_version<0 then raise exception 'Invalid version' using errcode='22023'; end if;
 validated:=public.validate_company_operations(_settings);
 perform pg_advisory_xact_lock(hashtextextended('company_operations:'||_company_id::text,0));
 select version,settings into current_version,baseline from public.company_operations where company_id=_company_id for update;
 baseline:=coalesce(baseline,public.company_operations_baseline(_company_id));
 if not public.company_feature_allowed(_company_id,'hasRegistration') and ((validated->'stages') is distinct from (baseline->'stages') or (validated->'transitions') is distinct from (baseline->'transitions')) then raise exception 'Registration unavailable' using errcode='42501';end if;
 if not public.company_feature_allowed(_company_id,'hasDashboard') and (validated->'reports') is distinct from (baseline->'reports') then raise exception 'Dashboard unavailable' using errcode='42501';end if;
 if not(public.company_feature_allowed(_company_id,'hasRegistration') or public.company_feature_allowed(_company_id,'hasDashboard')) then raise exception 'Operations unavailable' using errcode='42501';end if;
 if coalesce(current_version,0)<>_expected_version then raise exception 'Reload operations' using errcode='PT409'; end if;
 insert into public.company_operations(company_id,settings,version,updated_by) values(_company_id,validated,_expected_version+1,auth.uid())
 on conflict(company_id) do update set settings=excluded.settings,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
 insert into public.company_operations_history(company_id,version,settings,updated_by) values(_company_id,_expected_version+1,validated,auth.uid());
 return jsonb_build_object('settings',validated,'version',_expected_version+1);
end;
$$;
-- Snapshot counts, not conversion rates or payment verification. No individual data returned.
create function public.get_company_operation_metrics(_company_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if _company_id is null or not public.operations_staff(_company_id) or not public.company_feature_allowed(_company_id,'hasDashboard') or not (public.has_role(auth.uid(),'master'::public.app_role)
 or public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'coordinator'::public.app_role)) then raise exception 'Not authorized' using errcode='42501'; end if;
 return (select jsonb_build_object('active',count(*) filter(where status='active'),'pending',count(*) filter(where status='pending'),
 'awaiting_renewal',count(*) filter(where status='awaiting_renewal'),'inactive',count(*) filter(where status='inactive'))
 from public.students where company_id=_company_id);
end;
$$;
-- Additional deny policy for all operational stage edits, including service-role writes. Canonical financial/provider
-- transitions are deliberately outside this configuration; existing checks remain authoritative.
create function public.enforce_company_operational_transition() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare source text;target text;config jsonb;ops text[]:=array['interested','contacted','fiscal_registration_pending','lost'];
begin
 if tg_table_name='students' then
 -- Match normalizeSalesStage: active/renewal status wins over a stale stage;
 -- otherwise preserve a canonical explicit stage, then fall back from status.
 source:=case
 when old.status in ('active','awaiting_renewal') then
   case when old.sales_stage='active_onboarding' then 'active_onboarding' else 'active' end
 when old.sales_stage in ('interested','contacted','fiscal_registration_pending','payment_pending','active_onboarding','active','lost') then old.sales_stage
 when old.status='pending' then 'payment_pending'
 when old.status='inactive' then 'lost'
 else 'interested' end;
 -- Match normalizeSalesStage: active/renewal status wins over a stale stage;
 -- otherwise preserve a canonical explicit stage, then fall back from status.
 target:=case
 when new.status in ('active','awaiting_renewal') then
   case when new.sales_stage='active_onboarding' then 'active_onboarding' else 'active' end
 when new.sales_stage in ('interested','contacted','fiscal_registration_pending','payment_pending','active_onboarding','active','lost') then new.sales_stage
 when new.status='pending' then 'payment_pending'
 when new.status='inactive' then 'lost'
 else 'interested' end;
 else source:=coalesce(old.stage,'interested');target:=coalesce(new.stage,'interested');end if;
 source:=case when source='fiscal_registration' then 'fiscal_registration_pending' else source end;
 target:=case when target='fiscal_registration' then 'fiscal_registration_pending' else target end;
 if source is not distinct from target or not coalesce(source=any(ops),false) or not coalesce(target=any(ops),false) then return new;end if;
 select settings into config from public.company_operations where company_id=old.company_id;
 if config is not null and not exists(select 1 from jsonb_array_elements(config->'transitions') t where t->>'from'=source and t->>'to'=target) then
 raise exception 'Operational transition disabled by company policy' using errcode='42501';end if;
 return new;
end;
$$;
create trigger company_operations_student_transition before update of sales_stage,status on public.students for each row execute function public.enforce_company_operational_transition();
create trigger company_operations_lead_transition before update of stage on public.leads for each row execute function public.enforce_company_operational_transition();
-- Preflight for staff UI and the already-authorized Edge service client. Call before
-- multi-write convert-lead; trigger protection alone cannot roll back earlier HTTP writes.
create function public.assert_company_operation_transition(_company_id uuid,_source text,_target text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare config jsonb;ops text[]:=array['interested','contacted','fiscal_registration_pending','lost'];
begin
 if _company_id is null or not coalesce((auth.role()='service_role' or public.operations_staff(_company_id)),false) then raise exception 'Not authorized' using errcode='42501';end if;
 if not commercial_private.feature_allowed(_company_id,'hasRegistration') then raise exception 'Registration unavailable' using errcode='42501';end if;
 if _source is null or _target is null or not (_source=any(ops)) or not (_target=any(ops)) then raise exception 'Operational codes required' using errcode='22023';end if;
 if _source=_target then return true;end if;
 select settings into config from public.company_operations where company_id=_company_id;
 if config is not null and not exists(select 1 from jsonb_array_elements(config->'transitions') t where t->>'from'=_source and t->>'to'=_target) then raise exception 'Operational transition disabled by company policy' using errcode='42501';end if;
 return true;
end;
$$;
revoke all on function public.assert_company_operation_transition(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.assert_company_operation_transition(uuid,text,text) to authenticated,service_role;
revoke all on function public.company_operations_baseline(uuid),public.company_operations_defaults(),public.operations_staff(uuid),public.validate_company_operations(jsonb),public.enforce_company_operational_transition(),public.get_company_operations(uuid),public.save_company_operations(uuid,jsonb,integer),public.get_company_operation_metrics(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_company_operations(uuid),public.save_company_operations(uuid,jsonb,integer),public.get_company_operation_metrics(uuid) to authenticated;
