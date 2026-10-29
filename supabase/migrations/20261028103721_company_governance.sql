-- A23/A29. Forward-only. No role/membership/student/billing mutations.
-- Ownership here is companies.owner_id; only an EXISTING company admin can accept.
create table public.company_governance_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  version bigint not null default 0 check(version >= 0)
);
create table public.company_ownership_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requester_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  status text not null default 'pending' check(status in ('pending','accepted','cancelled','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  resolved_at timestamptz,
  check(requester_id <> recipient_id)
);
create unique index company_ownership_one_pending on public.company_ownership_requests(company_id) where status='pending';
create table public.company_governance_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 80),
  permissions text[] not null check(cardinality(permissions)=1 and permissions=array['company_dashboard_full']::text[]),
  unique(company_id,id)
);
create unique index company_governance_role_name on public.company_governance_roles(company_id,lower(btrim(name)));
create table public.company_governance_assignments (
  company_id uuid not null,
  role_id uuid not null,
  user_id uuid not null references auth.users(id),
  primary key(company_id,role_id,user_id),
  foreign key(company_id,role_id) references public.company_governance_roles(company_id,id) on delete cascade,
  foreign key(company_id,user_id) references public.company_members(company_id,user_id) on delete cascade
);
create table public.company_governance_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  version bigint not null,
  detail jsonb not null,
  created_at timestamptz not null default now()
);
create index company_governance_audit_company on public.company_governance_audit(company_id,version desc);
-- Only RPCs expose these records. RLS deny-by-default also covers accidental future grants.
alter table public.company_governance_state enable row level security;
alter table public.company_ownership_requests enable row level security;
alter table public.company_governance_roles enable row level security;
alter table public.company_governance_assignments enable row level security;
alter table public.company_governance_audit enable row level security;
revoke all on public.company_governance_state, public.company_ownership_requests, public.company_governance_roles,
  public.company_governance_assignments, public.company_governance_audit from public,anon,authenticated;

create function public.get_company_governance(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); manager boolean; result jsonb;
begin
  if actor is null or not public.is_company_staff(actor,_company_id) then
    raise exception 'Company staff access required' using errcode='42501';
  end if;
  manager:=public.has_role(actor,'admin'::public.app_role);
  select jsonb_build_object(
    'company_id',c.id,'owner_id',c.owner_id,'version',coalesce(s.version,0),'can_manage',manager,
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

create function public.change_company_governance(_company_id uuid,_action text,_payload jsonb,_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); owner uuid; version_now bigint; target uuid; role_target uuid;
  request public.company_ownership_requests%rowtype; detail jsonb:='{}'::jsonb; v_permissions text[];
begin
  if actor is null or not public.is_company_staff(actor,_company_id) or not public.has_role(actor,'admin'::public.app_role) then
    raise exception 'Company admin required' using errcode='42501';
  end if;
  if _expected_version is null or _expected_version<0 or _payload is null or jsonb_typeof(_payload)<>'object' then
    raise exception 'Invalid request' using errcode='22023';
  end if;
  -- Serialize by company; the CAS also protects first write and all role/assignment edits.
  select owner_id into owner from public.companies where id=_company_id for update;
  if not found then raise exception 'Company missing' using errcode='42501'; end if;
  insert into public.company_governance_state(company_id) values(_company_id) on conflict do nothing;
  select version into version_now from public.company_governance_state where company_id=_company_id for update;
  if version_now<>_expected_version then raise exception 'Reload governance before saving' using errcode='PT409'; end if;
  -- Lock current actor membership/role while authorizing this transaction.
  perform 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id
    where m.company_id=_company_id and m.user_id=actor and r.role='admin'::public.app_role for share of m,r;
  if not found then raise exception 'Company admin required' using errcode='42501'; end if;

  if _action='request_transfer' then
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

-- Existing consumer: same trainer-only grant, now unioned with named bundles.
-- Does not touch can_manage_staff_student or clinical/financial/module roles.
create or replace function public.has_staff_permission(_company_id uuid,_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and _company_id is not null and _permission='company_dashboard_full'
    and exists(select 1 from public.company_members m join public.user_roles r on r.user_id=m.user_id
      where m.company_id=_company_id and m.user_id=auth.uid() and r.role='trainer'::public.app_role)
    and (exists(select 1 from public.staff_permissions p where p.company_id=_company_id and p.user_id=auth.uid() and p.permission=_permission and p.enabled)
      or exists(select 1 from public.company_governance_assignments a join public.company_governance_roles b
        on b.company_id=a.company_id and b.id=a.role_id where a.company_id=_company_id and a.user_id=auth.uid() and _permission=any(b.permissions)));
$$;
revoke all on function public.get_company_governance(uuid), public.change_company_governance(uuid,text,jsonb,bigint),public.has_staff_permission(uuid,text) from public,anon;
grant execute on function public.get_company_governance(uuid), public.change_company_governance(uuid,text,jsonb,bigint),public.has_staff_permission(uuid,text) to authenticated;
grant execute on function public.has_staff_permission(uuid,text) to service_role;
