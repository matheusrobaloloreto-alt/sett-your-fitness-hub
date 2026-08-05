-- Expõe ao aluno somente a identidade pública do assistente da própria empresa.
-- A metodologia, credenciais, limites e demais campos privados continuam protegidos pela RLS.
create or replace function public.get_company_ai_identity(_company_id uuid)
returns table (
  assistant_name text,
  consultancy_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(nullif(btrim(config.assistant_name), ''), 'Setty') as assistant_name,
    config.consultancy_name
  from public.company_ai_config config
  where config.company_id = _company_id
    and (
      exists (
        select 1
        from public.students student
        where student.user_id = auth.uid()
          and student.company_id = _company_id
      )
      or exists (
        select 1
        from public.company_members member
        where member.user_id = auth.uid()
          and member.company_id = _company_id
      )
      or exists (
        select 1
        from public.user_roles role_row
        where role_row.user_id = auth.uid()
          and role_row.role = 'master'::public.app_role
      )
    )
  limit 1;
$$;

revoke all on function public.get_company_ai_identity(uuid) from public;
grant execute on function public.get_company_ai_identity(uuid) to authenticated;
grant execute on function public.get_company_ai_identity(uuid) to service_role;

comment on function public.get_company_ai_identity(uuid) is
  'Retorna apenas nome público do assistente e consultoria para usuários vinculados à empresa.';
