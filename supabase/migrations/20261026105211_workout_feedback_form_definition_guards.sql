-- Prospective guards added after the initial local QA migration was frozen.
create function public.guard_workout_feedback_definition() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.kind='workout_feedback' and not exists(select 1 from jsonb_array_elements(new.definition->'fields') f where f->>'key' in ('perception','reflection') and f->>'hidden'='false') then raise exception 'workout_feedback_canonical_question_required' using errcode='22023'; end if;
  return new;
end $$;
create trigger workout_feedback_definition before insert on public.company_form_definitions for each row execute function public.guard_workout_feedback_definition();
create or replace function public.guard_workout_feedback_form_snapshot() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_definition jsonb; v_difficulty integer; v_answers jsonb;
begin
  if tg_op='UPDATE' then
    if new.form_definition_id is distinct from old.form_definition_id or new.instrument_answers is distinct from old.instrument_answers then raise exception 'workout_feedback_form_snapshot_immutable'; end if;
    return new;
  end if;
  if new.form_definition_id is null then
    if exists(select 1 from public.company_form_definitions where company_id=new.company_id and kind='workout_feedback') then raise exception 'workout_feedback_form_version_required'; end if;
    if new.instrument_answers is not null then raise exception 'workout_feedback_form_version_required'; end if;
    return new;
  end if;
  select definition into v_definition from public.company_form_definitions where id=new.form_definition_id and company_id=new.company_id and kind='workout_feedback';
  if v_definition is null then raise exception 'workout_feedback_form_tenant_mismatch'; end if;
  v_answers:=new.instrument_answers;
  perform public.validate_company_form_answers(v_definition,v_answers);
  if length(coalesce(v_answers->>'reflection',''))>1000 then raise exception 'workout_feedback_reflection_limit'; end if;
  v_difficulty:=case v_answers->>'perception' when 'Difícil' then 8 when 'Bom' then 5 when 'Ótimo' then 3 else null end;
  if new.difficulty is distinct from v_difficulty then raise exception 'workout_feedback_canonical_value_mismatch'; end if;
  if coalesce(v_answers->>'perception','')='' and length(btrim(coalesce(v_answers->>'reflection','')))=0 then raise exception 'workout_feedback_empty'; end if;
  return new;
end $$;
