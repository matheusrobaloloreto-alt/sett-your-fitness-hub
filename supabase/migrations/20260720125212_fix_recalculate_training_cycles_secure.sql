-- Reescreve recalculate_training_cycles: SECURITY DEFINER COM validação de tenant
-- (master OU membro da empresa da matrícula) e recálculo REAL dos ciclos:
-- encadeia os ciclos não-concluídos a partir da nova data preservando a duração de cada um.
create or replace function public.recalculate_training_cycles(p_enrollment_id uuid, p_new_start_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_cursor date := p_new_start_date;
  c record;
  v_len int;
begin
  select company_id into v_company from enrollments where id = p_enrollment_id;
  if v_company is null then
    raise exception 'Matrícula não encontrada';
  end if;
  -- Autorização: master OU membro da empresa dona da matrícula.
  if not (
    has_role(auth.uid(), 'master'::app_role)
    or exists (select 1 from company_members m where m.user_id = auth.uid() and m.company_id = v_company)
  ) then
    raise exception 'Sem permissão para recalcular ciclos desta matrícula';
  end if;

  update enrollments
     set training_start_date = p_new_start_date,
         start_date = p_new_start_date
   where id = p_enrollment_id;

  -- Encadeia os ciclos NÃO concluídos a partir da nova data, preservando a duração de cada um.
  for c in
    select id, start_date, end_date
      from training_cycles
     where enrollment_id = p_enrollment_id
       and status <> 'completed'
     order by cycle_number
  loop
    v_len := greatest(1, (c.end_date - c.start_date));
    update training_cycles
       set start_date = v_cursor,
           end_date   = v_cursor + v_len
     where id = c.id;
    v_cursor := v_cursor + v_len + 1;
  end loop;

  -- Fim da matrícula acompanha o fim do último ciclo (se houver ciclos).
  update enrollments e
     set end_date = coalesce((select max(end_date) from training_cycles t where t.enrollment_id = e.id), e.end_date)
   where e.id = p_enrollment_id;
end;
$function$;

revoke all on function public.recalculate_training_cycles(uuid, date) from public;
grant execute on function public.recalculate_training_cycles(uuid, date) to authenticated;;
