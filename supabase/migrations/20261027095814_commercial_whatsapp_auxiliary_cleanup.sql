-- R6: restrictive SELECT and parent RLS can make direct DELETE a silent no-op.
-- Explicit cleanup is actor/tenant authorized, even after commercial revocation.
-- No SELECT grant, metadata projection, parent mutation or feature restoration.
create function public.delete_company_whatsapp_auxiliary(
  _company_id uuid, _kind text, _row_id uuid
) returns integer language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  if auth.uid() is null or not public.is_company_staff(auth.uid(),_company_id) then
    raise exception 'Staff company access required' using errcode='42501';
  end if;
  if _kind='labels' then
    delete from public.whatsapp_chat_labels r using public.whatsapp_chats c
      where r.id=_row_id and c.id=r.chat_id and c.company_id=_company_id;
  elsif _kind='sessions' then
    delete from public.flow_sessions r using public.automation_flows f
      where r.id=_row_id and f.id=r.flow_id and f.company_id=_company_id;
  else
    raise exception 'Unknown WhatsApp auxiliary kind' using errcode='22023';
  end if;
  get diagnostics removed=row_count;
  return removed;
end $$;
revoke all on function public.delete_company_whatsapp_auxiliary(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.delete_company_whatsapp_auxiliary(uuid,text,uuid) to authenticated;

-- Moving a function does not change its OID. An existing owner-executed view or
-- SQL-standard definer caller can still reference that OID, bypassing a NEW
-- public wrapper despite revoked direct EXECUTE. Guard the original body too.
-- Retain its actual query/identity check and OID rather than copying the query.
create function commercial_private.require_dispatch_status(_company_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_company_staff(auth.uid(),_company_id)
    or not commercial_private.feature_allowed(_company_id,'hasAutomation')
    or not commercial_private.feature_allowed(_company_id,'hasWhatsApp') then
    raise exception 'Dispatch status capability unavailable' using errcode='42501';
  end if;
end $$;
revoke all on function commercial_private.require_dispatch_status(uuid) from public,anon,authenticated,service_role;
do $$ declare original_body text; guarded_body text; language_name text; granted_role text; begin
  if to_regprocedure('commercial_private.get_company_dispatch_uncertainties(uuid)') is null then
    raise notice 'Original dispatch status RPC absent; no OID guard installed';
    return;
  end if;
  select p.prosrc,l.lanname into original_body,language_name from pg_proc p
    join pg_language l on l.oid=p.prolang
    where p.oid='commercial_private.get_company_dispatch_uncertainties(uuid)'::regprocedure;
  if language_name<>'plpgsql' then
    raise exception 'Unexpected dispatch status function language';
  end if;
  guarded_body:=regexp_replace(original_body,'\mbegin\M',
    E'begin\n  perform commercial_private.require_dispatch_status(_company_id);','i');
  if guarded_body=original_body then raise exception 'Dispatch status body has no BEGIN'; end if;
  execute format('create or replace function commercial_private.get_company_dispatch_uncertainties(_company_id uuid) returns jsonb language plpgsql stable security definer set search_path=%L as %L','',guarded_body);
  revoke all on function commercial_private.get_company_dispatch_uncertainties(uuid) from public,anon,authenticated,service_role;
  -- Include inherited/custom application-role grants, not only Supabase's
  -- standard role names. The trusted owner retains its inherent privileges.
  for granted_role in
    select distinct r.rolname from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      join pg_roles r on r.oid=a.grantee
      where p.oid='commercial_private.get_company_dispatch_uncertainties(uuid)'::regprocedure
        and a.grantee<>p.proowner
  loop
    execute format('revoke all on function commercial_private.get_company_dispatch_uncertainties(uuid) from %I',granted_role);
  end loop;
end $$;
