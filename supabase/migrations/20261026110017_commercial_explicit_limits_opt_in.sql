-- Opt-in is independent of catalog/editorial version. Missing flags preserve legacy capacity.
-- Webhooks resolve historical verified prices from server-owned immutable snapshots.
grant select on public.platform_product_settings_history to service_role;
alter function public.validate_platform_product_settings(jsonb) rename to validate_platform_product_settings_v2;
create function public.validate_platform_product_settings(_value jsonb) returns void
language plpgsql immutable set search_path=public as $$
declare base jsonb:=_value;t text;enabled jsonb;
begin
 foreach t in array array['basic','intermediate','advanced'] loop
  enabled:=_value#>array['tiers',t,'limits_enabled'];
  if enabled is not null and jsonb_typeof(enabled)<>'boolean' then raise exception 'Invalid limits_enabled' using errcode='22023'; end if;
  base:=base #- array['tiers',t,'limits_enabled'];
 end loop;
 perform public.validate_platform_product_settings_v2(base);
end $$;
revoke all on function public.validate_platform_product_settings(jsonb) from public,anon,authenticated;

create or replace function public.enforce_company_commercial_limits() returns trigger
language plpgsql security definer set search_path=public as $$
declare tier_name text;catalog jsonb;cap integer;policy jsonb;new_kind text;old_plan uuid;active_before boolean:=false;influencer_before boolean:=false;
begin
 if coalesce(new.status,'') not in ('active','awaiting_renewal') or new.company_id is null then return new; end if;
 if tg_op='UPDATE' then active_before:=old.company_id is not distinct from new.company_id and coalesce(old.status in ('active','awaiting_renewal'),false);old_plan:=old.selected_plan_id; end if;
 perform pg_advisory_xact_lock(hashtextextended('commercial-slots:'||new.company_id::text,0));
 select tier into tier_name from public.companies where id=new.company_id;
 select settings into catalog from public.platform_product_settings where id='default';
 if not active_before and coalesce((catalog#>>array['tiers',tier_name,'limits_enabled'])::boolean,false) then
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
