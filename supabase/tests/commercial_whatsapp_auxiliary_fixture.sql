-- Extends the existing isolated feature fixture; all identities are synthetic.
alter type public.app_role add value if not exists 'coordinator';
create function public.is_company_staff(_user_id uuid,_company_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select _user_id is not null and _company_id is not null and (
    public.has_role(_user_id,'master') or (
      exists(select 1 from public.company_members where user_id=_user_id and company_id=_company_id)
      and exists(select 1 from public.user_roles where user_id=_user_id and role::text in ('admin','coordinator','trainer'))));
$$;
revoke all on function public.is_company_staff(uuid,uuid) from public;
grant execute on function public.is_company_staff(uuid,uuid) to authenticated,service_role;

alter table public.automation_flows add column name text default 'Synthetic flow';
create table public.whatsapp_chat_labels (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.whatsapp_chats on delete cascade,
  label_id uuid not null references public.whatsapp_labels on delete cascade,
  unique(chat_id,label_id)
);
create table public.flow_sessions (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.automation_flows on delete cascade,
  chat_id uuid references public.whatsapp_chats on delete cascade,
  current_node_id text,status text default 'active',context jsonb default '{}',
  started_at timestamptz default now(),last_activity_at timestamptz default now(),
  created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.intercycle_anamnesis_deliveries (
  id uuid primary key default gen_random_uuid(),company_id uuid,
  status text,last_error_code text,updated_at timestamptz default now()
);
-- Deliberately broad existing permission proves the new gate itself checks staff
-- and both parents; it does not rely on hidden parent RLS for its assertions.
alter table public.whatsapp_chat_labels enable row level security;
alter table public.flow_sessions enable row level security;
create policy fixture_existing on public.whatsapp_chat_labels for all to authenticated using(true) with check(true);
create policy fixture_existing on public.flow_sessions for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public.whatsapp_chat_labels,public.flow_sessions to authenticated,service_role;

-- Deliberately bypass RLS to exercise the trigger's actor and source/destination
-- checks, including calls where the table owner is now current_user.
create function public.fixture_aux_write(_table text,_id uuid,_first uuid,_second uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if _table='labels' then
    insert into public.whatsapp_chat_labels(id,chat_id,label_id) values(_id,_first,_second)
      on conflict(id) do update set chat_id=excluded.chat_id,label_id=excluded.label_id;
  else
    insert into public.flow_sessions(id,flow_id,chat_id) values(_id,_first,_second)
      on conflict(id) do update set flow_id=excluded.flow_id,chat_id=excluded.chat_id;
  end if;
end $$;
create function public.fixture_aux_cleanup(_flow uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_company_staff(auth.uid(),(select company_id from public.automation_flows where id=_flow)) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  delete from public.automation_flows where id=_flow;
end $$;
