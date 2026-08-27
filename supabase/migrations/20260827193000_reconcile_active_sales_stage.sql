-- Corrige cadastros operacionais já ativos que ficaram presos em etapas antigas
-- do pré-cadastro. Não ativa pendentes e não altera onboarding em andamento.
update public.students
set sales_stage = 'active', updated_at = now()
where status in ('active', 'awaiting_renewal')
  and coalesce(sales_stage, '') not in ('active', 'active_onboarding');
