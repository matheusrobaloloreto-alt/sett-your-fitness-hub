-- Auxiliary business APIs intersect existing tenant/role policies. This does
-- not migrate commercial snapshots, billing, clinical history or consent.
create function commercial_private.whatsapp_aux_company(
  _kind text, _first uuid, _second uuid
) returns uuid language sql stable security definer set search_path='' as $$
  select case _kind
    when 'labels' then (
      select c.company_id from public.whatsapp_chats c
      join public.whatsapp_labels l on l.id=_second and l.company_id=c.company_id
      where c.id=_first)
    when 'sessions' then (
      select f.company_id from public.automation_flows f
      where f.id=_first and (_second is null or exists (
        select 1 from public.whatsapp_chats c
        where c.id=_second and c.company_id=f.company_id)))
  end;
$$;

-- Public policy helper returns only a permission boolean; no alias/identity
-- metadata is exposed. is_company_staff deliberately excludes student members.
create function public.whatsapp_auxiliary_allowed(
  _kind text, _first uuid, _second uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.is_company_staff(auth.uid(),c.id)
    and commercial_private.feature_allowed(c.id,'hasWhatsApp')
    and (_kind='labels' or commercial_private.feature_allowed(c.id,'hasAutomation')),false)
  from (select commercial_private.whatsapp_aux_company(_kind,_first,_second) id) c;
$$;
revoke all on function public.whatsapp_auxiliary_allowed(text,uuid,uuid) from public,anon;
grant execute on function public.whatsapp_auxiliary_allowed(text,uuid,uuid) to authenticated;

create function commercial_private.guard_whatsapp_auxiliary_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; previous uuid; row_value jsonb; old_value jsonb;
  first_key text:=case tg_argv[0] when 'labels' then 'chat_id' else 'flow_id' end;
  second_key text:=case tg_argv[0] when 'labels' then 'label_id' else 'chat_id' end;
begin
  -- Commercial revocation must not veto FK cascades or authorized security
  -- cleanup, including a parent that has already disappeared.
  if tg_op='DELETE' then return old; end if;
  row_value:=to_jsonb(new);
  target:=commercial_private.whatsapp_aux_company(tg_argv[0],
    (row_value->>first_key)::uuid,(row_value->>second_key)::uuid);
  if target is null then raise exception 'WhatsApp auxiliary tenant mismatch' using errcode='42501'; end if;
  -- Service inbound ingestion/resume/receipt/checkpoint is a separate trusted
  -- system contract. Never infer that authority from an absent user/JWT alone.
  if current_setting('role',true)='service_role' then return new; end if;
  -- Local maintenance with no request identity is not an API actor. A definer
  -- invoked by authenticated retains role and uid and cannot take this branch.
  if auth.uid() is null and current_setting('role',true) in ('none','postgres') then return new; end if;
  if not public.whatsapp_auxiliary_allowed(tg_argv[0],
    (row_value->>first_key)::uuid,(row_value->>second_key)::uuid) then
    raise exception 'WhatsApp auxiliary capability unavailable' using errcode='42501';
  end if;
  if tg_op='UPDATE' then
    old_value:=to_jsonb(old);
    previous:=commercial_private.whatsapp_aux_company(tg_argv[0],
      (old_value->>first_key)::uuid,(old_value->>second_key)::uuid);
    if previous is distinct from target or not public.whatsapp_auxiliary_allowed(tg_argv[0],
      (old_value->>first_key)::uuid,(old_value->>second_key)::uuid) then
      raise exception 'WhatsApp auxiliary source unavailable' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function commercial_private.whatsapp_aux_company(text,uuid,uuid),
  commercial_private.guard_whatsapp_auxiliary_write() from public,anon,authenticated;

alter table public.whatsapp_chat_labels enable row level security;
alter table public.flow_sessions enable row level security;
-- Do not add a restrictive DELETE policy: existing authorization controls
-- cleanup, and cascades continue working after commercial revocation.
do $$ declare item record; command text; expression text; begin
  for item in select * from (values
    ('whatsapp_chat_labels','labels','chat_id','label_id'),
    ('flow_sessions','sessions','flow_id','chat_id')) t(tbl,kind,first_key,second_key)
  loop
    expression:=format('public.whatsapp_auxiliary_allowed(%L,%I,%I)',item.kind,item.first_key,item.second_key);
    foreach command in array array['select','insert','update'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'commercial_auxiliary_'||command,item.tbl,command,
        case command when 'insert' then 'with check ('||expression||')'
          when 'select' then 'using ('||expression||')'
          else 'using ('||expression||') with check ('||expression||')' end);
    end loop;
    execute format('create trigger commercial_auxiliary_write before insert or update or delete on public.%I for each row execute function commercial_private.guard_whatsapp_auxiliary_write(%L)',item.tbl,item.kind);
  end loop;
end $$;

-- Preserve the original status query and its identity/tenant authorization.
-- Its definer read otherwise bypasses the auxiliary RLS gate.
do $$ begin
  if to_regprocedure('public.get_company_dispatch_uncertainties(uuid)') is not null then
    alter function public.get_company_dispatch_uncertainties(uuid) set schema commercial_private;
    revoke all on function commercial_private.get_company_dispatch_uncertainties(uuid) from public,anon,authenticated,service_role;
    execute $wrapper$
      create function public.get_company_dispatch_uncertainties(_company_id uuid)
      returns jsonb language plpgsql stable security definer set search_path='' as $body$
      begin
        if auth.uid() is null or not public.is_company_staff(auth.uid(),_company_id)
          or not commercial_private.feature_allowed(_company_id,'hasAutomation')
          or not commercial_private.feature_allowed(_company_id,'hasWhatsApp') then
          raise exception 'Dispatch status capability unavailable' using errcode='42501';
        end if;
        return commercial_private.get_company_dispatch_uncertainties(_company_id);
      end $body$;
    $wrapper$;
    revoke all on function public.get_company_dispatch_uncertainties(uuid) from public,anon;
    grant execute on function public.get_company_dispatch_uncertainties(uuid) to authenticated;
  else
    raise notice 'Dispatch status RPC absent; no wrapper installed';
  end if;
end $$;

-- These existing service-only tables remain private. No paid feature guard on
-- account recovery, identity audit, ingress aliasing or delivery receipt ledger.
do $$ declare tbl text; begin
  foreach tbl in array array['whatsapp_jid_aliases','whatsapp_identity_repairs',
    'student_recovery_whatsapp_attempts','automation_dispatch_attempts'] loop
    if to_regclass('public.'||tbl) is not null then
      execute format('revoke all on public.%I from public,anon,authenticated',tbl);
    end if;
  end loop;
end $$;
