-- Explicit opt-in only; no DDL backfill. Existing RPC ACLs and transfer/role semantics preserved.
create or replace function public.get_company_governance(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); manager boolean; result jsonb;
begin
  if actor is null or not public.is_company_staff(actor,_company_id) then
    raise exception 'Company staff access required' using errcode='42501';
  end if;
  manager:=public.has_role(actor,'admin'::public.app_role);
  select jsonb_build_object(
    'company_id',c.id,'owner_id',c.owner_id,
    'owner_kind',case when c.owner_id is not null then 'registered' when c.owner_user_id is not null then 'legacy' else 'missing' end,
    'legacy_owner_id',case when c.owner_id is null and c.owner_user_id=actor then actor else null end,
    'pending_confirmation',c.owner_id is null and c.owner_user_id is not null,
    'can_initialize',coalesce(c.owner_id is null and c.owner_user_id=actor and manager,false),
    'version',coalesce(s.version,0),'can_manage',manager,
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.full_name,'Sem nome'),
      'roles',(select jsonb_agg(r.role::text order by r.role::text) from public.user_roles r where r.user_id=m.user_id)))
      from public.company_members m left join public.profiles p on p.user_id=m.user_id
      where m.company_id=c.id and public.is_company_staff(m.user_id,c.id)), '[]'::jsonb),
    'transfers',coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('status',
      case when t.status='pending' and t.expires_at<=now() then 'expired' else t.status end) order by t.created_at desc)
      from public.company_ownership_requests t where t.company_id=c.id and
      (manager or actor=t.requester_id or actor=t.recipient_id)), '[]'::jsonb),
    'bundles',coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from public.company_governance_roles r where r.company_id=c.id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.company_governance_assignments a where a.company_id=c.id),'[]'::jsonb),
    'audit',case when manager then coalesce((select jsonb_agg(to_jsonb(a) order by a.version desc) from
      (select * from public.company_governance_audit where company_id=c.id order by version desc,created_at desc limit 50) a),'[]'::jsonb) else '[]'::jsonb end
  ) into result from public.companies c left join public.company_governance_state s on s.company_id=c.id where c.id=_company_id;
  return result;
end $$;

create or replace function public.change_company_governance(_company_id uuid,_action text,_payload jsonb,_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); owner uuid; legacy_owner uuid; version_now bigint; target uuid; role_target uuid;
  request public.company_ownership_requests%rowtype; detail jsonb:='{}'::jsonb; v_permissions text[];
begin
  if actor is null or not public.is_company_staff(actor,_company_id) or not public.has_role(actor,'admin'::public.app_role) then
    raise exception 'Company admin required' using errcode='42501';
  end if;
  if _expected_version is null or _expected_version<0 or _payload is null or jsonb_typeof(_payload)<>'object' then
    raise exception 'Invalid request' using errcode='22023';
  end if;
  -- Serialize by company; the CAS also protects first write and all role/assignment edits.
  select owner_id,owner_user_id into owner,legacy_owner from public.companies where id=_company_id for update;
  if not found then raise exception 'Company missing' using errcode='42501'; end if;
  insert into public.company_governance_state(company_id) values(_company_id) on conflict do nothing;
  select version into version_now from public.company_governance_state where company_id=_company_id for update;
  if version_now<>_expected_version then raise exception 'Reload governance before saving' using errcode='PT409'; end if;
  -- Lock current actor membership/role while authorizing this transaction.
  perform 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id
    where m.company_id=_company_id and m.user_id=actor and r.role='admin'::public.app_role for share of m,r;
  if not found then raise exception 'Company admin required' using errcode='42501'; end if;

  if _action='initialize_owner' then
    if owner is not null then raise exception 'Owner already registered' using errcode='PT409'; end if;
    if legacy_owner is null or legacy_owner is distinct from actor then
      raise exception 'Legacy owner required' using errcode='42501'; end if;
    if (_payload->>'expected_legacy_owner_id')::uuid is distinct from legacy_owner then
      raise exception 'Legacy owner changed' using errcode='PT409'; end if;
    if exists(select 1 from public.company_ownership_requests where company_id=_company_id and status='pending') then
      raise exception 'Pending transfer' using errcode='PT409'; end if;
    update public.companies set owner_id=actor where id=_company_id and owner_id is null and owner_user_id=legacy_owner;
    if not found then raise exception 'Owner changed' using errcode='PT409'; end if;
    detail:=jsonb_build_object('source','legacy_owner','owner_id',actor);
  elsif _action='request_transfer' then
    if owner is distinct from actor then raise exception 'Current owner required' using errcode='42501'; end if;
    target:=(_payload->>'recipient_id')::uuid;
    if target is null or target=actor then raise exception 'Choose another existing company admin' using errcode='22023'; end if;
    perform 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id
      where m.company_id=_company_id and m.user_id=target and r.role='admin'::public.app_role for share of m,r;
    if not found then raise exception 'Recipient must already be a company admin' using errcode='22023'; end if;
    if exists(select 1 from public.company_ownership_requests where company_id=_company_id and status='pending' and expires_at>now()) then
      raise exception 'Pending ownership request exists' using errcode='PT409';
    end if;
    with expired as (update public.company_ownership_requests set status='expired',resolved_at=now()
      where company_id=_company_id and status='pending' and expires_at<=now() returning id)
    insert into public.company_governance_audit(company_id,actor_id,action,version,detail)
      select _company_id,actor,'expire_transfer',version_now+1,jsonb_build_object('request_id',id) from expired;
    insert into public.company_ownership_requests(company_id,requester_id,recipient_id)
      values(_company_id,actor,target) returning * into request;
    detail:=jsonb_build_object('request_id',request.id,'from',actor,'to',target);
  elsif _action in ('accept_transfer','cancel_transfer','expire_transfer') then
    select * into request from public.company_ownership_requests where company_id=_company_id and id=(_payload->>'request_id')::uuid for update;
    if not found then raise exception 'Request unavailable' using errcode='42501'; end if;
    if actor<>request.recipient_id and actor<>request.requester_id then raise exception 'Named participant required' using errcode='42501'; end if;
    if request.status<>'pending' then raise exception 'Request already resolved' using errcode='PT409'; end if;
    if _action='expire_transfer' then
      if request.expires_at>now() then raise exception 'Request has not expired' using errcode='22023'; end if;
      update public.company_ownership_requests set status='expired',resolved_at=now() where id=request.id;
    else
      if request.expires_at<=now() then raise exception 'Request expired' using errcode='PT409'; end if;
      if _action='accept_transfer' then
        if actor<>request.recipient_id then raise exception 'Named recipient required' using errcode='42501'; end if;
        if owner is distinct from request.requester_id then raise exception 'Owner changed' using errcode='PT409'; end if;
        -- Revalidate both parties. No new membership/global role; no admin is removed.
        perform 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id
          where m.company_id=_company_id and m.user_id=request.requester_id and r.role='admin'::public.app_role for share of m,r;
        if not found then raise exception 'Original owner no longer eligible' using errcode='PT409'; end if;
        update public.companies set owner_id=actor where id=_company_id and owner_id=request.requester_id;
        if not found then raise exception 'Owner changed' using errcode='PT409'; end if;
        update public.company_ownership_requests set status='accepted',resolved_at=now() where id=request.id;
      else
        update public.company_ownership_requests set status='cancelled',resolved_at=now() where id=request.id;
      end if;
    end if;
    detail:=jsonb_build_object('request_id',request.id,'from',request.requester_id,'to',request.recipient_id);
  elsif _action='save_role' then
    if jsonb_typeof(_payload->'permissions') is distinct from 'array' then raise exception 'Invalid permissions' using errcode='22023'; end if;
    select array_agg(value order by value) into v_permissions from jsonb_array_elements_text(_payload->'permissions');
    if v_permissions is distinct from array['company_dashboard_full']::text[] or coalesce(length(btrim(_payload->>'name')),0) not between 1 and 80 then
      raise exception 'Only existing staff permission bundles are allowed' using errcode='22023';
    end if;
    role_target:=nullif(_payload->>'role_id','')::uuid;
    if role_target is null then
      insert into public.company_governance_roles(company_id,name,permissions) values(_company_id,btrim(_payload->>'name'),v_permissions) returning id into role_target;
    else
      update public.company_governance_roles set name=btrim(_payload->>'name'),permissions=v_permissions
        where id=role_target and company_id=_company_id;
      if not found then raise exception 'Role unavailable' using errcode='42501'; end if;
    end if;
    detail:=jsonb_build_object('role_id',role_target,'name',btrim(_payload->>'name'),'permissions',to_jsonb(v_permissions));
  elsif _action in ('assign_role','unassign_role','delete_role') then
    role_target:=(_payload->>'role_id')::uuid;
    if not exists(select 1 from public.company_governance_roles where company_id=_company_id and id=role_target) then raise exception 'Role unavailable' using errcode='42501'; end if;
    if _action='delete_role' then
      delete from public.company_governance_roles where company_id=_company_id and id=role_target;
    else
      target:=(_payload->>'user_id')::uuid;
      if _action='assign_role' then
        perform 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id
          where m.company_id=_company_id and m.user_id=target and r.role='trainer'::public.app_role for share of m,r;
        if not found then raise exception 'Existing company trainer required' using errcode='22023'; end if;
        insert into public.company_governance_assignments(company_id,role_id,user_id) values(_company_id,role_target,target) on conflict do nothing;
      else
        delete from public.company_governance_assignments where company_id=_company_id and role_id=role_target and user_id=target;
      end if;
    end if;
    detail:=jsonb_build_object('role_id',role_target,'user_id',target);
  else raise exception 'Unknown governance action' using errcode='22023';
  end if;
  update public.company_governance_state set version=version+1 where company_id=_company_id;
  insert into public.company_governance_audit(company_id,actor_id,action,version,detail) values(_company_id,actor,_action,version_now+1,detail);
  return public.get_company_governance(_company_id);
end $$;
