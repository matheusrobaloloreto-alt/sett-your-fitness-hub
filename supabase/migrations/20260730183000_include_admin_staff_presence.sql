-- Administradores também são colaboradores da empresa e precisam aparecer
-- na atividade da equipe. A tabela original aceitava apenas coordinator/trainer.
alter table public.staff_sessions
  drop constraint if exists staff_sessions_role_check;

alter table public.staff_sessions
  add constraint staff_sessions_role_check
  check (role in (
    'admin'::app_role,
    'coordinator'::app_role,
    'trainer'::app_role
  ));
