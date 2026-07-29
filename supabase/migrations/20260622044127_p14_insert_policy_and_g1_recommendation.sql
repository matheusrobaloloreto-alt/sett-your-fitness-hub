-- P14 — permite o app (professor) gravar a trilha de decisão da própria empresa.
create policy "Company members insert ai decision logs" on public.ai_decision_logs
  for insert with check (company_id = get_user_company_id(auth.uid()));

-- G1/T5 — recomendação do próximo ciclo a partir do último feedback (security invoker → RLS aplica).
create or replace function public.next_cycle_recommendation(_student_id uuid)
returns table(recommendation text, reduce_volume boolean, nps smallint, wants_adjustment boolean)
language sql stable set search_path = public as $$
  select
    case
      when cf.nps is not null and cf.nps <= 6 then 'NPS baixo: combine expectativas e reduza volume/intensidade no próximo ciclo.'
      when cf.wants_adjustment then 'O aluno pediu ajuste — leia a observação e adapte o próximo ciclo.'
      when cf.effort_score is not null and cf.effort_score >= 9 then 'Esforço percebido muito alto: considere deload ou menos volume.'
      else 'Sem sinais de alerta: pode progredir o estímulo.'
    end as recommendation,
    (coalesce(cf.nps, 10) <= 6 or coalesce(cf.effort_score, 0) >= 9) as reduce_volume,
    cf.nps, cf.wants_adjustment
  from public.cycle_feedback cf
  where cf.student_id = _student_id
  order by cf.created_at desc
  limit 1;
$$;
grant execute on function public.next_cycle_recommendation(uuid) to authenticated;;
