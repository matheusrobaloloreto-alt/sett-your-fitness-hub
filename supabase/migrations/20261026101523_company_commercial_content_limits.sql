-- Additional commercial controls are separate from the Foundation contract.
create table public.company_commercial_settings (
 company_id uuid primary key references public.companies(id) on delete cascade,
 settings jsonb not null, version integer not null check(version>0),
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
create table public.company_commercial_settings_history (
 company_id uuid not null references public.companies(id) on delete cascade,
 version integer not null,settings jsonb not null,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id),primary key(company_id,version)
);
create table public.company_public_documents (
 company_id uuid not null references public.companies(id) on delete cascade,
 page text not null check(page in ('sobre','termos','privacidade')),version integer not null,
 content jsonb not null,published_at timestamptz not null default now(),published_by uuid not null references auth.users(id),
 primary key(company_id,page,version)
);
alter table public.company_commercial_settings enable row level security;
alter table public.company_commercial_settings_history enable row level security;
alter table public.company_public_documents enable row level security;
revoke all on public.company_commercial_settings,public.company_commercial_settings_history,public.company_public_documents from anon,authenticated;
grant select on public.company_commercial_settings,public.company_commercial_settings_history,public.company_public_documents to authenticated;
grant select on public.company_commercial_settings to service_role;
create function public.can_manage_company_commercial(_company_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.has_role(auth.uid(),'master'::public.app_role) or
 (public.has_role(auth.uid(),'admin'::public.app_role) and exists(select 1 from public.company_members where company_id=_company_id and user_id=auth.uid())));
$$;
revoke all on function public.can_manage_company_commercial(uuid) from public,anon;
grant execute on function public.can_manage_company_commercial(uuid) to authenticated;
create policy company_commercial_read on public.company_commercial_settings for select to authenticated using (
 public.has_role(auth.uid(),'master'::public.app_role) or (exists(select 1 from public.company_members where company_id=company_commercial_settings.company_id and user_id=auth.uid()) and
 (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'coordinator'::public.app_role) or public.has_role(auth.uid(),'trainer'::public.app_role)))
);
create policy company_commercial_history_read on public.company_commercial_settings_history for select to authenticated using(public.can_manage_company_commercial(company_id));
create policy company_documents_staff_read on public.company_public_documents for select to authenticated using(public.can_manage_company_commercial(company_id));
create function public.company_commercial_defaults() returns jsonb language sql immutable as $$
 select '{"funnel_labels":{},"pre_registration_invite":"Oi! Para conhecer o acompanhamento da {{empresa}}, preencha o pré-cadastro: {{link}}","influencer":{"enabled":true,"max_active_students":0},"pages":{"sobre":{"title":"","sections":[]},"termos":{"title":"","sections":[]},"privacidade":{"title":"","sections":[]}}}'::jsonb;
$$;
create function public.commercial_plain_text(_value jsonb,_max integer) returns boolean language sql immutable as $$
 select coalesce(jsonb_typeof(_value)='string' and length(_value#>>'{}')<=_max and (_value#>>'{}') !~* '<[/]?[a-z][^>]*>|javascript:|Bearer[[:space:]]+|sk[_-][A-Za-z0-9_-]{8,}|(api[_ -]?key|secret|password|senha|token)[[:space:]]*[:=]',false);
$$;
create function public.validate_company_commercial_settings(_settings jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare result jsonb:=public.company_commercial_defaults();k text;v jsonb;p jsonb;s jsonb;
begin
 if jsonb_typeof(_settings) is distinct from 'object' or octet_length(_settings::text)>300000 then raise exception 'Invalid commercial settings' using errcode='22023'; end if;
 for k in select jsonb_object_keys(_settings) loop
  if k not in ('funnel_labels','pre_registration_invite','influencer','pages') then raise exception 'Unknown commercial field' using errcode='22023'; end if;
 end loop;
 if _settings ? 'funnel_labels' then
  v:=_settings->'funnel_labels';
  if jsonb_typeof(v)<>'object' then raise exception 'Invalid labels' using errcode='22023'; end if;
  for k in select jsonb_object_keys(v) loop
   if k not in ('interested','contacted','fiscal_registration_pending','payment_pending','active_onboarding','active','lost') or not public.commercial_plain_text(v->k,60) or length(btrim(v->>k))=0 then raise exception 'Invalid canonical label' using errcode='22023'; end if;
  end loop;
  result:=jsonb_set(result,'{funnel_labels}',v);
 end if;
 if _settings ? 'pre_registration_invite' then
  v:=_settings->'pre_registration_invite';
  if not public.commercial_plain_text(v,2000) or (v#>>'{}') !~ '\{\{[[:space:]]*link[[:space:]]*\}\}' or regexp_replace(v#>>'{}','\{\{[[:space:]]*(empresa|link)[[:space:]]*\}\}','','g') ~ '[{}]' then raise exception 'Invalid invitation template' using errcode='22023'; end if;
  result:=jsonb_set(result,'{pre_registration_invite}',v);
 end if;
 if _settings ? 'influencer' then
  v:=_settings->'influencer';
  if jsonb_typeof(v)<>'object' then raise exception 'Invalid influencer policy' using errcode='22023'; end if;
  for k in select jsonb_object_keys(v) loop
   if k not in ('enabled','max_active_students') then raise exception 'Unknown influencer policy' using errcode='22023'; end if;
  end loop;
  if v ? 'enabled' and jsonb_typeof(v->'enabled')<>'boolean' then raise exception 'Invalid enabled' using errcode='22023'; end if;
  if v ? 'max_active_students' then
   if jsonb_typeof(v->'max_active_students')<>'number' or (v->>'max_active_students')::numeric not between 0 and 1000 or trunc((v->>'max_active_students')::numeric)<>(v->>'max_active_students')::numeric then raise exception 'Invalid influencer limit' using errcode='22023'; end if;
  end if;
  result:=jsonb_set(result,'{influencer}',result->'influencer'||v);
 end if;
 if _settings ? 'pages' then
  v:=_settings->'pages';
  if jsonb_typeof(v)<>'object' then raise exception 'Invalid pages' using errcode='22023'; end if;
  for k in select jsonb_object_keys(v) loop
   p:=v->k;
   if k not in ('sobre','termos','privacidade') or jsonb_typeof(p)<>'object' or not (p ?& array['title','sections']) or (select count(*) from jsonb_object_keys(p))<>2 or not public.commercial_plain_text(p->'title',120) or jsonb_typeof(p->'sections')<>'array' then raise exception 'Invalid document' using errcode='22023'; end if;
   if jsonb_array_length(p->'sections')>12 then raise exception 'Too many sections' using errcode='22023'; end if;
   for s in select value from jsonb_array_elements(p->'sections') loop
    if jsonb_typeof(s)<>'object' or not (s ?& array['heading','body']) or (select count(*) from jsonb_object_keys(s))<>2 or not public.commercial_plain_text(s->'heading',120) or not public.commercial_plain_text(s->'body',8000) then raise exception 'Invalid section' using errcode='22023'; end if;
   end loop;
   result:=jsonb_set(result,array['pages',k],p);
  end loop;
 end if;
 return result;
end $$;
revoke all on function public.validate_company_commercial_settings(jsonb) from public,anon,authenticated;
create function public.save_company_commercial_settings(_company_id uuid,_settings jsonb,_expected_version integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare normalized jsonb;v integer;
begin
 if not public.can_manage_company_commercial(_company_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 normalized:=public.validate_company_commercial_settings(_settings);
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||_company_id::text,0));
 select version into v from public.company_commercial_settings where company_id=_company_id for update;
 if coalesce(v,0) is distinct from _expected_version then raise exception 'Version conflict' using errcode='PT409'; end if;
 v:=coalesce(v,0)+1;
 insert into public.company_commercial_settings(company_id,settings,version,updated_by) values(_company_id,normalized,v,auth.uid())
 on conflict(company_id) do update set settings=excluded.settings,version=excluded.version,updated_by=auth.uid(),updated_at=now();
 insert into public.company_commercial_settings_history(company_id,settings,version,updated_by) values(_company_id,normalized,v,auth.uid());
 return jsonb_build_object('settings',normalized,'version',v);
end $$;
revoke all on function public.save_company_commercial_settings(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_company_commercial_settings(uuid,jsonb,integer) to authenticated;
create function public.publish_company_public_page(_company_id uuid,_page text,_settings_version integer) returns jsonb
language plpgsql security definer set search_path=public as $$
declare content jsonb;v integer;settings_version integer;
begin
 if not public.can_manage_company_commercial(_company_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 if _page not in ('sobre','termos','privacidade') or _page is null then raise exception 'Invalid page' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||_company_id::text,0));
 select settings#>array['pages',_page],version into content,settings_version from public.company_commercial_settings where company_id=_company_id for update;
 if settings_version is distinct from _settings_version then raise exception 'Version conflict' using errcode='PT409'; end if;
 if length(btrim(content->>'title'))=0 or jsonb_array_length(content->'sections')=0 or not exists(select 1 from jsonb_array_elements(content->'sections') s where length(btrim(s->>'body'))>0) then raise exception 'Document content required' using errcode='22023'; end if;
 select coalesce(max(version),0)+1 into v from public.company_public_documents where company_id=_company_id and page=_page;
 insert into public.company_public_documents(company_id,page,version,content,published_by) values(_company_id,_page,v,content,auth.uid());
 return jsonb_build_object('page',_page,'version',v);
end $$;
revoke all on function public.publish_company_public_page(uuid,text,integer) from public,anon;
grant execute on function public.publish_company_public_page(uuid,text,integer) to authenticated;
create or replace function public.get_public_company_information(_slug text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('name',c.name,'slug',c.slug,'brand',jsonb_build_object(
 'company_name',coalesce(s.settings#>>'{brand,company_name}',''),'terms_url',coalesce(s.settings#>>'{brand,terms_url}',''),'privacy_url',coalesce(s.settings#>>'{brand,privacy_url}',''),
 'support_email',coalesce(s.settings#>>'{brand,support_email}',''),'support_whatsapp',coalesce(s.settings#>>'{brand,support_whatsapp}','')),
 'documents',coalesce((select jsonb_object_agg(d.page,d.content||jsonb_build_object('version',d.version,'published_at',d.published_at)) from
 (select distinct on(page) page,version,content,published_at from public.company_public_documents where company_id=c.id order by page,version desc) d),'{}'::jsonb))
 from public.companies c left join public.company_product_settings s on s.company_id=c.id where c.slug=_slug and c.is_active and (select count(*) from public.companies where slug=_slug)=1;
$$;

-- Extend the platform validator without changing the previous migration's history.
alter function public.validate_platform_product_settings(jsonb) rename to validate_platform_product_settings_v1;
create function public.validate_platform_product_settings(_value jsonb) returns void
language plpgsql immutable set search_path=public as $$
declare base jsonb:=_value-'visual';t text;cap jsonb;visual jsonb:=_value->'visual';
begin
 if visual is not null then
  if jsonb_typeof(visual)<>'object' or not (visual ?& array['navy','ink','paper','sand','logo_url','handle']) or (select count(*) from jsonb_object_keys(visual))<>6 then raise exception 'Invalid visual identity' using errcode='22023'; end if;
  foreach t in array array['navy','ink','paper','sand'] loop
   if jsonb_typeof(visual->t)<>'string' or (visual->>t) !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid visual color' using errcode='22023'; end if;
  end loop;
  if not public.commercial_plain_text(visual->'logo_url',2000) or (visual->>'logo_url'<>'' and (visual->>'logo_url' !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$' or visual->>'logo_url' ~ '[\\]')) then raise exception 'Invalid logo URL' using errcode='22023'; end if;
  if jsonb_typeof(visual->'handle')<>'string' or (visual->>'handle'<>'' and visual->>'handle' !~ '^@[A-Za-z0-9_.]{1,30}$') then raise exception 'Invalid brand handle' using errcode='22023'; end if;
 end if;
 foreach t in array array['basic','intermediate','advanced'] loop
  cap:=_value#>array['tiers',t,'active_student_limit'];
  if cap is not null and (jsonb_typeof(cap)<>'number' or (cap#>>'{}')::numeric not between 0 and 100000 or trunc((cap#>>'{}')::numeric)<>(cap#>>'{}')::numeric) then raise exception 'Invalid active student limit' using errcode='22023'; end if;
  base:=base #- array['tiers',t,'active_student_limit'];
 end loop;
 perform public.validate_platform_product_settings_v1(base);
end $$;
revoke all on function public.validate_platform_product_settings(jsonb) from public,anon,authenticated;
update public.platform_product_settings set settings=jsonb_set(jsonb_set(jsonb_set(settings,'{tiers,basic,active_student_limit}','30'),'{tiers,intermediate,active_student_limit}','0'),'{tiers,advanced,active_student_limit}','0') where id='default';
update public.platform_product_settings set settings=jsonb_set(settings,'{visual}','{"navy":"#0D1B3E","ink":"#111214","paper":"#F4F2ED","sand":"#C8A876","logo_url":"","handle":"@bnperformancetraining"}') where id='default';

-- New slot acquisition only. Legacy students and already assigned influencer records stay intact.
-- A quantitative tier policy becomes active only after an explicit master catalog save (version > 1).
create function public.enforce_company_commercial_limits() returns trigger
language plpgsql security definer set search_path=public as $$
declare tier_name text;catalog jsonb;catalog_version integer;cap integer;policy jsonb;new_kind text;old_plan uuid;active_before boolean:=false;influencer_before boolean:=false;
begin
 if coalesce(new.status,'') not in ('active','awaiting_renewal') or new.company_id is null then return new; end if;
 if tg_op='UPDATE' then active_before:=old.company_id is not distinct from new.company_id and coalesce(old.status in ('active','awaiting_renewal'),false);old_plan:=old.selected_plan_id; end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial-slots:'||new.company_id::text,0));
 select tier into tier_name from public.companies where id=new.company_id;
 select settings,version into catalog,catalog_version from public.platform_product_settings where id='default';
 if not active_before and catalog_version>1 then
  if tier_name not in ('basic','intermediate','advanced') then raise exception 'Unknown company tier' using errcode='23514'; end if;
  cap:=coalesce((catalog#>>array['tiers',tier_name,'active_student_limit'])::integer,case when tier_name='basic' then 30 else 0 end);
  if cap>0 and (select count(*) from public.students where company_id=new.company_id and status in ('active','awaiting_renewal') and id<>new.id)>=cap then raise exception 'Company active student limit reached' using errcode='23514'; end if;
 end if;
 select plan_kind into new_kind from public.plans where id=new.selected_plan_id and company_id=new.company_id;
 if new.selected_plan_id is not null and new_kind is null then raise exception 'Plan does not belong to company' using errcode='23514'; end if;
 if new_kind='influencer' then
  if active_before and old_plan is not distinct from new.selected_plan_id then return new; end if;
  if active_before then select exists(select 1 from public.plans where id=old_plan and company_id=new.company_id and plan_kind='influencer') into influencer_before; end if;
  if influencer_before then return new; end if;
  select settings->'influencer' into policy from public.company_commercial_settings where company_id=new.company_id;
  policy:=coalesce(policy,public.company_commercial_defaults()->'influencer');
  if not (policy->>'enabled')::boolean then raise exception 'New influencer classification disabled' using errcode='23514'; end if;
  cap:=(policy->>'max_active_students')::integer;
  if cap>0 and (select count(*) from public.students s join public.plans p on p.id=s.selected_plan_id and p.company_id=s.company_id where s.company_id=new.company_id and s.status in ('active','awaiting_renewal') and p.plan_kind='influencer' and s.id<>new.id)>=cap then raise exception 'Company influencer limit reached' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger company_commercial_slot_limits before insert or update of status,company_id,selected_plan_id on public.students for each row execute function public.enforce_company_commercial_limits();
