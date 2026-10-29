-- Legacy capacity is not a contract signal. Every company starts outside new tier enforcement.
alter table public.companies add column company_limit_source text not null default 'legacy' check(company_limit_source in ('legacy','tier'));
alter table public.companies add column company_limit_policy_version integer not null default 0 check(company_limit_policy_version>=0);
create table public.company_limit_policy_history(
 company_id uuid not null references public.companies(id) on delete cascade,
 version integer not null,source text not null check(source in ('legacy','tier')),
 changed_by uuid not null,changed_at timestamptz not null default now(),primary key(company_id,version)
);
alter table public.company_limit_policy_history enable row level security;
revoke all on public.company_limit_policy_history from public,anon,authenticated;
grant select on public.company_limit_policy_history to authenticated;
create policy company_limit_policy_master_read on public.company_limit_policy_history for select to authenticated using(public.has_role(auth.uid(),'master'::public.app_role));

create function public.protect_company_limit_policy_fields() returns trigger
language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then
  if new.company_limit_source<>'legacy' or new.company_limit_policy_version<>0 then raise exception 'Confirm admission policy after company creation' using errcode='23514';end if;
 elsif new.company_limit_source is distinct from old.company_limit_source or new.company_limit_policy_version is distinct from old.company_limit_policy_version then
  if current_user in ('authenticated','anon') then raise exception 'Use master admission policy RPC' using errcode='42501';end if;
 end if;
 return new;
end $$;
create trigger company_limit_policy_protected before insert or update of company_limit_source,company_limit_policy_version on public.companies for each row execute function public.protect_company_limit_policy_fields();

create function public.set_company_limit_source(_company_id uuid,_source text,_expected_version integer,_confirm_future_admissions boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare company public.companies%rowtype;next_version integer;
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'master'::public.app_role) then raise exception 'Master only' using errcode='42501';end if;
 if _source is null or _source not in ('legacy','tier') or _expected_version is null or _expected_version<0 then raise exception 'Invalid admission policy' using errcode='22023';end if;
 if _source='tier' and _confirm_future_admissions is distinct from true then raise exception 'Confirm application to future admissions' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial-slots:'||_company_id::text,0));
 select * into company from public.companies where id=_company_id for update;
 if not found then raise exception 'Company not found' using errcode='22023';end if;
 if company.company_limit_policy_version<>_expected_version then raise exception 'Admission policy changed' using errcode='PT409';end if;
 next_version:=_expected_version+1;
 update public.companies set company_limit_source=_source,company_limit_policy_version=next_version where id=_company_id;
 insert into public.company_limit_policy_history(company_id,version,source,changed_by) values(_company_id,next_version,_source,auth.uid());
 return jsonb_build_object('company_limit_source',_source,'company_limit_policy_version',next_version);
end $$;
revoke all on function public.set_company_limit_source(uuid,text,integer,boolean) from public,anon;
grant execute on function public.set_company_limit_source(uuid,text,integer,boolean) to authenticated;

create or replace function public.enforce_company_commercial_limits() returns trigger
language plpgsql security definer set search_path=public as $$
declare tier_name text;limit_source text;catalog jsonb;cap integer;policy jsonb;new_kind text;old_plan uuid;active_before boolean:=false;influencer_before boolean:=false;
begin
 if coalesce(new.status,'') not in ('active','awaiting_renewal') or new.company_id is null then return new; end if;
 if tg_op='UPDATE' then active_before:=old.company_id is not distinct from new.company_id and coalesce(old.status in ('active','awaiting_renewal'),false);old_plan:=old.selected_plan_id; end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial-slots:'||new.company_id::text,0));
 select tier,company_limit_source into tier_name,limit_source from public.companies where id=new.company_id;
 select settings into catalog from public.platform_product_settings where id='default';
 if not active_before and limit_source='tier' and coalesce((catalog#>>array['tiers',tier_name,'limits_enabled'])::boolean,false) then
  if tier_name not in ('basic','intermediate','advanced') then raise exception 'Unknown company tier' using errcode='23514'; end if;
  cap:=coalesce((catalog#>>array['tiers',tier_name,'active_student_limit'])::integer,0);
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
