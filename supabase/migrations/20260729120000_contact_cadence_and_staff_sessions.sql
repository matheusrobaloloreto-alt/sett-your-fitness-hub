-- ============================================================================
-- Cadência de Contatos + Presença de Colaboradores (2026-07-29)
-- 1) whatsapp_chats.cadence_muted — tira o contato do countdown de cadência.
-- 2) RPC contact_cadence(_company_id) — última msg RECEBIDA por chat (leads + alunos).
-- 3) staff_sessions — registro de entrada/saída/tempo online de colaboradores.
-- ============================================================================

-- 1) Botão "inativar do countdown"
alter table public.whatsapp_chats
  add column if not exists cadence_muted boolean not null default false;

-- 2) Cadência: último inbound por chat da empresa (security invoker → RLS aplica).
create or replace function public.contact_cadence(_company_id uuid)
returns table(
  chat_id uuid,
  contact_name text,
  student_id uuid,
  student_name text,
  student_status text,
  kind text,
  last_inbound_at timestamptz,
  hours_since numeric
)
language sql stable
set search_path = public
as $$
  select
    c.id as chat_id,
    c.contact_name,
    s.id as student_id,
    s.full_name as student_name,
    s.status as student_status,
    case when s.id is null then 'lead' else 'aluno' end as kind,
    m.last_inbound_at,
    round(extract(epoch from (now() - m.last_inbound_at)) / 3600.0, 1) as hours_since
  from whatsapp_chats c
  left join students s on s.id = c.student_id
  join lateral (
    select max(wm.timestamp) as last_inbound_at
    from whatsapp_messages wm
    where wm.chat_id = c.id and wm.is_from_me = false
  ) m on true
  where c.company_id = _company_id
    and coalesce(c.cadence_muted, false) = false
    and c.remote_jid not like '%@g.us'
    and m.last_inbound_at is not null
    and (s.id is null or s.status in ('active', 'pending', 'awaiting_renewal'))
  order by m.last_inbound_at asc;
$$;
grant execute on function public.contact_cadence(uuid) to authenticated;

-- 3) Presença de colaboradores (entrada = insert; heartbeat = last_seen_at; saída = ended_at)
create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  company_id uuid,
  role text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists idx_staff_sessions_user on public.staff_sessions(user_id, started_at desc);
create index if not exists idx_staff_sessions_company on public.staff_sessions(company_id, started_at desc);

alter table public.staff_sessions enable row level security;

drop policy if exists staff_sessions_own_insert on public.staff_sessions;
create policy staff_sessions_own_insert on public.staff_sessions
  for insert with check (user_id = auth.uid());

drop policy if exists staff_sessions_own_update on public.staff_sessions;
create policy staff_sessions_own_update on public.staff_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Leitura: o próprio colaborador, master, ou ADMIN da mesma empresa.
drop policy if exists staff_sessions_read on public.staff_sessions;
create policy staff_sessions_read on public.staff_sessions
  for select using (
    user_id = auth.uid()
    or has_role(auth.uid(), 'master'::app_role)
    or exists (
      select 1
      from public.company_members m
      join public.user_roles r on r.user_id = m.user_id
      where m.user_id = auth.uid()
        and m.company_id = staff_sessions.company_id
        and r.role = 'admin'::app_role
    )
  );
