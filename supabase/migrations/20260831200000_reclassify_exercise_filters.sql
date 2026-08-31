-- Canonicaliza somente os filtros da biblioteca. muscle_group e os alvos
-- musculares permanecem intactos; as telas de volume os validam por allowlist.
-- O bloco é tolerante ao drift histórico: category existe em todos os ambientes,
-- enquanto categories pode ser text[], jsonb ou ainda não existir.
do $$
declare
  v_category_udt text;
  v_categories_udt text;
begin
  select c.udt_name
    into v_category_udt
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'exercise_library'
     and c.column_name = 'category';

  if v_category_udt in ('text', 'varchar') then
    execute $migration$
      update public.exercise_library e
         set category = case
           when lower(regexp_replace(trim(e.category), '[^a-zA-Z0-9]+', '_', 'g')) in
             ('controle_motor', 'funcional', 'funcionais')
             then 'funcionais'
           when lower(regexp_replace(trim(e.category), '[^a-zA-Z0-9]+', '_', 'g')) = 'performance'
             then 'pliometria'
           when lower(regexp_replace(trim(e.category), '[^a-zA-Z0-9]+', '_', 'g')) in
             ('fisioterapia', 'fisio')
             then case
               when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                 'salto|jump|hop|bound|drop|pliom|arremesso|slam|rebote|aterriss'
                 then 'pliometria'
               when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                 'mobil|along|libera|foam|amplitude|rota'
                 then 'mobilidade'
               when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                 'prancha|abdom|pallof|bird dog|dead bug'
                 then 'core'
               when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                 'mini band|thera band|ativ|isometr'
                 then 'ativacao'
               when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                 'maquina|máquina|polia|leg press|cadeira|mesa flexora'
                 then 'maquinas'
               when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                 'halter|barra|kettlebell|anilha'
                 then 'pesos_livres'
               when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                 'agach|terra|levantamento|supino|remada|puxada'
                 then 'base'
               else 'funcionais'
             end
           else e.category
         end
       where lower(regexp_replace(trim(e.category), '[^a-zA-Z0-9]+', '_', 'g')) in
         ('controle_motor', 'funcional', 'funcionais', 'performance', 'fisioterapia', 'fisio');
    $migration$;
  end if;

  select c.udt_name
    into v_categories_udt
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'exercise_library'
     and c.column_name = 'categories';

  if v_categories_udt = '_text' then
    execute $migration$
      with affected as (
        select e.id
          from public.exercise_library e
         where exists (
           select 1
             from unnest(coalesce(e.categories, array[]::text[])) raw(category)
            where lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) in
              ('controle_motor', 'funcional', 'funcionais', 'performance', 'fisioterapia', 'fisio')
         )
      ), mapped as (
        select e.id,
               raw.ordinality,
               case
                 when lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) in
                   ('controle_motor', 'funcional', 'funcionais')
                   then 'funcionais'
                 when lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) = 'performance'
                   then 'pliometria'
                 when lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) in
                   ('fisioterapia', 'fisio')
                   then case
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'salto|jump|hop|bound|drop|pliom|arremesso|slam|rebote|aterriss'
                       then 'pliometria'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'mobil|along|libera|foam|amplitude|rota'
                       then 'mobilidade'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'prancha|abdom|pallof|bird dog|dead bug'
                       then 'core'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'mini band|thera band|ativ|isometr'
                       then 'ativacao'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'maquina|máquina|polia|leg press|cadeira|mesa flexora'
                       then 'maquinas'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'halter|barra|kettlebell|anilha'
                       then 'pesos_livres'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'agach|terra|levantamento|supino|remada|puxada'
                       then 'base'
                     else 'funcionais'
                   end
                 else raw.category
               end as category
          from public.exercise_library e
          join affected a on a.id = e.id
         cross join lateral unnest(coalesce(e.categories, array[]::text[]))
           with ordinality raw(category, ordinality)
      ), deduplicated as (
        select id, category, min(ordinality) as first_ordinality
          from mapped
         group by id, category
      ), rebuilt as (
        select id, array_agg(category order by first_ordinality) as categories
          from deduplicated
         group by id
      )
      update public.exercise_library e
         set categories = rebuilt.categories
        from rebuilt
       where e.id = rebuilt.id
         and e.categories is distinct from rebuilt.categories;
    $migration$;
  elsif v_categories_udt = 'jsonb' then
    execute $migration$
      with affected as (
        select e.id
          from public.exercise_library e
         where jsonb_typeof(e.categories) = 'array'
           and exists (
             select 1
               from jsonb_array_elements_text(e.categories) raw(category)
              where lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) in
                ('controle_motor', 'funcional', 'funcionais', 'performance', 'fisioterapia', 'fisio')
           )
      ), mapped as (
        select e.id,
               raw.ordinality,
               case
                 when lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) in
                   ('controle_motor', 'funcional', 'funcionais')
                   then 'funcionais'
                 when lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) = 'performance'
                   then 'pliometria'
                 when lower(regexp_replace(trim(raw.category), '[^a-zA-Z0-9]+', '_', 'g')) in
                   ('fisioterapia', 'fisio')
                   then case
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'salto|jump|hop|bound|drop|pliom|arremesso|slam|rebote|aterriss'
                       then 'pliometria'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'mobil|along|libera|foam|amplitude|rota'
                       then 'mobilidade'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'prancha|abdom|pallof|bird dog|dead bug'
                       then 'core'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'mini band|thera band|ativ|isometr'
                       then 'ativacao'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'maquina|máquina|polia|leg press|cadeira|mesa flexora'
                       then 'maquinas'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'halter|barra|kettlebell|anilha'
                       then 'pesos_livres'
                     when lower(concat_ws(' ', e.name, e.description, e.muscle_group)) ~
                       'agach|terra|levantamento|supino|remada|puxada'
                       then 'base'
                     else 'funcionais'
                   end
                 else raw.category
               end as category
          from public.exercise_library e
          join affected a on a.id = e.id
         cross join lateral jsonb_array_elements_text(e.categories)
           with ordinality raw(category, ordinality)
      ), deduplicated as (
        select id, category, min(ordinality) as first_ordinality
          from mapped
         group by id, category
      ), rebuilt as (
        select id, jsonb_agg(category order by first_ordinality) as categories
          from deduplicated
         group by id
      )
      update public.exercise_library e
         set categories = rebuilt.categories
        from rebuilt
       where e.id = rebuilt.id
         and e.categories is distinct from rebuilt.categories;
    $migration$;
  end if;
end
$$;
