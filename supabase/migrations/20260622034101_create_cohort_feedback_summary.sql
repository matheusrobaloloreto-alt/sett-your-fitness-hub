-- G2/T6 — coorte por satisfação (NPS) a partir do feedback de fim de ciclo.
-- security INVOKER (default): a RLS de cycle_feedback aplica, então o caller só agrega a própria empresa.
create or replace function public.cohort_feedback_summary(_company_id uuid)
returns table(bucket text, alunos int, media_nps numeric, pct_ajuste numeric)
language sql stable set search_path = public as $$
  select
    case when nps >= 9 then 'Promotores (9-10)'
         when nps >= 7 then 'Neutros (7-8)'
         when nps is null then 'Sem nota'
         else 'Detratores (0-6)' end as bucket,
    count(distinct student_id)::int,
    round(avg(nps)::numeric, 1),
    round(100.0 * sum(case when wants_adjustment then 1 else 0 end) / nullif(count(*), 0), 0)
  from public.cycle_feedback
  where company_id = _company_id
  group by 1
  order by 1;
$$;
grant execute on function public.cohort_feedback_summary(uuid) to authenticated;;
