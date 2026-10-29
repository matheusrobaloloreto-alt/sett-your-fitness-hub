-- Platform commercial data is deliberately separate from tenant product settings.
create table public.platform_product_settings (
  id text primary key check (id = 'default'),
  settings jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table public.platform_product_settings_history (
  version integer primary key,
  settings jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.platform_product_settings enable row level security;
alter table public.platform_product_settings_history enable row level security;
revoke all on public.platform_product_settings, public.platform_product_settings_history from anon, authenticated;
grant select on public.platform_product_settings, public.platform_product_settings_history to authenticated;
grant select on public.platform_product_settings to service_role;
create policy platform_catalog_master_read on public.platform_product_settings for select to authenticated using (public.has_role(auth.uid(), 'master'::public.app_role));
create policy platform_catalog_history_master_read on public.platform_product_settings_history for select to authenticated using (public.has_role(auth.uid(), 'master'::public.app_role));

insert into public.platform_product_settings(id,settings)
select 'default', jsonb_build_object('tiers', jsonb_object_agg(tier,
  jsonb_build_object('name',name,'monthly_price',price,'stripe_price_id',price_id,'description',description,'features',
    jsonb_build_object('hasPrescription',true,'hasDashboard',true,'hasRegistration',true,'hasAnamnesis',true,'hasStudents',true,'hasAgenda',true,'hasPlans',true,'hasTeam',tier <> 'basic','hasAppearance',tier <> 'basic','hasFinancial',tier <> 'basic','hasWhatsApp',tier = 'advanced','hasAutomation',tier = 'advanced'))),
  'editorial',jsonb_build_object('brand_name','BN Performance Training','audience','Alunos e profissionais de treinamento','tone','Técnico, objetivo e acessível','context',''))
from (values
  ('basic','Básico',49.90,'price_1T8s8n0JX9nASSiUNWHuxTYM','Prescrição e gestão individual'),
  ('intermediate','Intermediário',400,'price_1T8s9P0JX9nASSiUERk7XYh2','Gestão de equipe e financeiro'),
  ('advanced','Avançado',799,'price_1T8s9k0JX9nASSiUC8Fx1K2K','Gestão, CRM e automação')
) as t(tier,name,price,price_id,description);
insert into public.platform_product_settings_history(version,settings) select version,settings from public.platform_product_settings;

create function public.validate_platform_product_settings(_value jsonb) returns void
language plpgsql immutable set search_path = public as $$
declare k text; t text; v jsonb; f text;
begin
  if jsonb_typeof(_value) <> 'object' or not (_value ?& array['tiers','editorial']) or (select count(*) from jsonb_object_keys(_value)) <> 2 then raise exception 'Invalid platform settings' using errcode='22023'; end if;
  if jsonb_typeof(_value->'tiers') <> 'object' or (select count(*) from jsonb_object_keys(_value->'tiers')) <> 3 then raise exception 'Invalid tiers' using errcode='22023'; end if;
  foreach t in array array['basic','intermediate','advanced'] loop
    v := _value->'tiers'->t;
    if v is null or jsonb_typeof(v) <> 'object' or not (v ?& array['name','monthly_price','stripe_price_id','description','features']) or (select count(*) from jsonb_object_keys(v)) <> 5 then raise exception 'Invalid tier' using errcode='22023'; end if;
    if jsonb_typeof(v->'name') <> 'string' or length(btrim(v->>'name')) not between 1 and 80
      or jsonb_typeof(v->'description') <> 'string' or length(v->>'description') > 500
      or jsonb_typeof(v->'stripe_price_id') <> 'string' or length(v->>'stripe_price_id') > 100 or (v->>'stripe_price_id') !~ '^price_[A-Za-z0-9]+$'
      or jsonb_typeof(v->'monthly_price') <> 'number' then raise exception 'Invalid tier fields' using errcode='22023'; end if;
    if (v->>'monthly_price')::numeric < 0 or (v->>'monthly_price')::numeric > 100000 or round((v->>'monthly_price')::numeric,2) <> (v->>'monthly_price')::numeric then raise exception 'Invalid price' using errcode='22023'; end if;
    if jsonb_typeof(v->'features') <> 'object' or (select count(*) from jsonb_object_keys(v->'features')) <> 12 then raise exception 'Invalid features' using errcode='22023'; end if;
    foreach f in array array['hasPrescription','hasDashboard','hasRegistration','hasAnamnesis','hasStudents','hasAgenda','hasTeam','hasPlans','hasAppearance','hasFinancial','hasWhatsApp','hasAutomation'] loop
      if jsonb_typeof(v->'features'->f) is distinct from 'boolean' then raise exception 'Invalid feature' using errcode='22023'; end if;
    end loop;
  end loop;
  v := _value->'editorial';
  if jsonb_typeof(v) <> 'object' or not (v ?& array['brand_name','audience','tone','context']) or (select count(*) from jsonb_object_keys(v)) <> 4 then raise exception 'Invalid editorial' using errcode='22023'; end if;
  foreach k in array array['brand_name','audience','tone','context'] loop
    if jsonb_typeof(v->k) <> 'string' or length(v->>k) > (case when k='context' then 4000 else 200 end) then raise exception 'Invalid editorial field' using errcode='22023'; end if;
  end loop;
  if length(btrim(v->>'brand_name')) = 0 then raise exception 'Brand required' using errcode='22023'; end if;
end $$;
revoke all on function public.validate_platform_product_settings(jsonb) from public, anon, authenticated;

create function public.save_platform_product_settings(_settings jsonb, _expected_version integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare current_version integer; next_version integer;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'master'::public.app_role) then raise exception 'Forbidden' using errcode='42501'; end if;
  perform public.validate_platform_product_settings(_settings);
  select version into current_version from public.platform_product_settings where id='default' for update;
  if _expected_version is distinct from current_version then raise exception 'Version conflict' using errcode='PT409'; end if;
  next_version := current_version + 1;
  update public.platform_product_settings set settings=_settings,version=next_version,updated_by=auth.uid(),updated_at=now() where id='default';
  insert into public.platform_product_settings_history(version,settings,updated_by) values(next_version,_settings,auth.uid());
  return jsonb_build_object('settings',_settings,'version',next_version);
end $$;
revoke all on function public.save_platform_product_settings(jsonb,integer) from public,anon;
grant execute on function public.save_platform_product_settings(jsonb,integer) to authenticated;

create function public.get_public_platform_catalog() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('tiers', jsonb_object_agg(t.key, t.value - 'stripe_price_id'))
  from public.platform_product_settings p, lateral jsonb_each(p.settings->'tiers') t where p.id='default';
$$;
revoke all on function public.get_public_platform_catalog() from public;
grant execute on function public.get_public_platform_catalog() to anon,authenticated;

-- Exact company identity, optimistic concurrency, and no ownership transfer parameter.
create function public.update_company_public_profile(_company_id uuid, _name text, _slug text, _expected_name text, _expected_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.companies;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'master'::public.app_role) then raise exception 'Forbidden' using errcode='42501'; end if;
  if _name is null or length(btrim(_name)) not between 1 and 120 or _slug is null or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(_slug) not between 3 and 80 then raise exception 'Invalid company name/slug' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('company-slug:'||_slug,0));
  select * into c from public.companies where id=_company_id for update;
  if not found then raise exception 'Company not found' using errcode='P0002'; end if;
  if c.name is distinct from _expected_name or c.slug is distinct from _expected_slug then raise exception 'Version conflict' using errcode='PT409'; end if;
  if exists(select 1 from public.companies where lower(slug)=lower(_slug) and id<>_company_id) then raise exception 'Slug already in use' using errcode='23505'; end if;
  update public.companies set name=btrim(_name),slug=_slug where id=_company_id;
  return jsonb_build_object('id',_company_id,'name',btrim(_name),'slug',_slug);
end $$;
revoke all on function public.update_company_public_profile(uuid,text,text,text,text) from public,anon;
grant execute on function public.update_company_public_profile(uuid,text,text,text,text) to authenticated;

create function public.reject_company_owner_transfer() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id and auth.uid() is not null then
    raise exception 'Owner transfer requires a separate verified flow' using errcode='42501';
  end if;
  return new;
end $$;
create trigger company_owner_transfer_guard before update on public.companies for each row execute function public.reject_company_owner_transfer();

-- Public allowlist: no user IDs, billing data, internal messages or clinical configuration.
create function public.get_public_company_information(_slug text) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('name',c.name,'slug',c.slug,'brand',jsonb_build_object(
    'company_name',coalesce(s.settings->'brand'->>'company_name',''),
    'terms_url',coalesce(s.settings->'brand'->>'terms_url',''),
    'privacy_url',coalesce(s.settings->'brand'->>'privacy_url',''),
    'support_email',coalesce(s.settings->'brand'->>'support_email',''),
    'support_whatsapp',coalesce(s.settings->'brand'->>'support_whatsapp','')))
  from public.companies c left join public.company_product_settings s on s.company_id=c.id
  where c.slug=_slug and c.is_active and (select count(*) from public.companies d where d.slug=_slug)=1;
$$;
revoke all on function public.get_public_company_information(text) from public;
grant execute on function public.get_public_company_information(text) to anon,authenticated;

-- This capability grants only aggregate diagnostics, never a new privileged application role.
create table public.company_support_access (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  granted_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(company_id,user_id)
);
alter table public.company_support_access enable row level security;
revoke all on public.company_support_access from anon,authenticated;
grant select on public.company_support_access to authenticated;
create policy company_support_scoped_read on public.company_support_access for select to authenticated using (
  public.has_role(auth.uid(),'master'::public.app_role) or
  (exists(select 1 from public.company_members m where m.company_id=company_support_access.company_id and m.user_id=auth.uid()) and
    (user_id=auth.uid() or public.has_role(auth.uid(),'admin'::public.app_role)))
);
create function public.set_company_support_access(_company_id uuid,_user_id uuid,_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(),'master'::public.app_role) or
    (public.has_role(auth.uid(),'admin'::public.app_role) and exists(select 1 from public.company_members where company_id=_company_id and user_id=auth.uid()))
  ) then raise exception 'Forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.company_members where company_id=_company_id and user_id=_user_id) then raise exception 'Support user must belong to company' using errcode='42501'; end if;
  if _enabled is null then raise exception 'Invalid capability' using errcode='22023'; end if;
  insert into public.company_support_access(company_id,user_id,expires_at,granted_by)
  values(_company_id,_user_id,case when _enabled then now()+interval '24 hours' else now() end,auth.uid())
  on conflict(company_id,user_id) do update set expires_at=excluded.expires_at,granted_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.set_company_support_access(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_company_support_access(uuid,uuid,boolean) to authenticated;

create function public.company_operator_status(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not (
    public.has_role(auth.uid(),'master'::public.app_role) or
    (exists(select 1 from public.company_members where company_id=_company_id and user_id=auth.uid()) and
      (public.has_role(auth.uid(),'admin'::public.app_role) or exists(select 1 from public.company_support_access where company_id=_company_id and user_id=auth.uid() and expires_at>now())))
  ) then raise exception 'Forbidden' using errcode='42501'; end if;
  return (select jsonb_build_object('company_active',c.is_active,'settings_version',coalesce(s.version,0),'settings_updated_at',s.updated_at)
    from public.companies c left join public.company_product_settings s on s.company_id=c.id where c.id=_company_id);
end $$;
revoke all on function public.company_operator_status(uuid) from public,anon;
grant execute on function public.company_operator_status(uuid) to authenticated;
