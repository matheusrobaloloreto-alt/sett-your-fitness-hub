-- Mutating an assigned plan classifies every active assignee, not just future student writes.
create function public.enforce_plan_commercial_limits() returns trigger
language plpgsql security definer set search_path=public as $$
declare tenant uuid;affected bigint;occupied bigint;policy jsonb;cap integer;
begin
 if new.plan_kind is not distinct from old.plan_kind and new.company_id is not distinct from old.company_id then return new; end if;
 -- Stable order also covers an unassigned plan moving between companies.
 for tenant in select distinct id from unnest(array[old.company_id,new.company_id]) id where id is not null order by id loop
  perform pg_advisory_xact_lock(hashtextextended('commercial-slots:'||tenant::text,0));
 end loop;
 if new.company_id is distinct from old.company_id and exists(select 1 from public.students where selected_plan_id=old.id) then
  raise exception 'Assigned plan cannot change company' using errcode='23514';
 end if;
 if new.plan_kind is distinct from 'influencer' or old.plan_kind is not distinct from 'influencer' then return new; end if;
 select count(*) into affected from public.students where company_id=new.company_id and selected_plan_id=old.id and status in ('active','awaiting_renewal');
 if affected=0 then return new; end if;
 select settings->'influencer' into policy from public.company_commercial_settings where company_id=new.company_id;
 policy:=coalesce(policy,public.company_commercial_defaults()->'influencer');
 if not (policy->>'enabled')::boolean then raise exception 'New influencer classification disabled' using errcode='23514'; end if;
 cap:=(policy->>'max_active_students')::integer;
 select count(*) into occupied from public.students s join public.plans p on p.id=s.selected_plan_id and p.company_id=s.company_id
  where s.company_id=new.company_id and s.status in ('active','awaiting_renewal') and p.plan_kind='influencer' and p.id<>old.id;
 if cap>0 and occupied+affected>cap then raise exception 'Company influencer limit reached' using errcode='23514'; end if;
 return new;
end $$;
create trigger company_commercial_plan_kind_limits before update of plan_kind,company_id on public.plans for each row execute function public.enforce_plan_commercial_limits();
