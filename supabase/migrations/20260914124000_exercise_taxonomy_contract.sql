-- Canonical taxonomy contract for exercise filters and fixed volume muscles.
-- Categories are selectable/searchable filters; only explicit anatomical targets
-- contribute to volume. Historical company overrides stay stored but no longer
-- drive the fixed primary=1 / secondary=0.5 volume factor.

alter table public.exercise_library add column if not exists category text;
alter table public.exercise_library add column if not exists categories text[] default '{}'::text[];
alter table public.exercise_library add column if not exists taxonomy_legacy_categories jsonb;

create or replace function public.exercise_taxonomy_key(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(both '_' from regexp_replace(lower(translate(normalize(coalesce(p_value, ''), NFC),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  )), '[^a-z0-9]+', '_', 'g'));
$$;

revoke all on function public.exercise_taxonomy_key(text) from public, anon;
grant execute on function public.exercise_taxonomy_key(text) to authenticated, service_role;

create or replace function public.canonical_volume_muscle_group(p_group text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  group_key text := public.exercise_taxonomy_key(p_group);
begin
  if group_key = '' then return null; end if;
  if group_key in ('abdomen', 'abdominal', 'abdominais', 'abs') then return 'abdomen'; end if;
  if group_key in ('quadriceps', 'quadri', 'reto_femoral') then return 'quadriceps'; end if;
  if group_key in ('posterior_de_coxa', 'posterior', 'posteriores', 'isquiotibiais', 'hamstring', 'hamstrings') then return 'posterior_de_coxa'; end if;
  if group_key in ('gluteos', 'gluteo', 'gluteo_maximo', 'gluteo_medio', 'gluteo_minimo') then return 'gluteos'; end if;
  if group_key in ('adutores', 'adutor', 'adutor_magno') then return 'adutores'; end if;
  if group_key in ('panturrilha', 'panturrilhas', 'gastrocnemio', 'gastrocnemios', 'soleo') then return 'panturrilha'; end if;
  if group_key in ('deltoide_lateral', 'lateral_de_ombro') then return 'deltoide_lateral'; end if;
  if group_key in ('deltoide_posterior', 'posterior_de_ombro') then return 'deltoide_posterior'; end if;
  if group_key in ('deltoide_anterior', 'anterior_de_ombro', 'deltoide_frontal') then return 'deltoide_anterior'; end if;
  if group_key in ('antebraco', 'antebracos', 'braquiorradial') then return 'antebraco'; end if;
  if group_key = 'biceps' then return 'biceps'; end if;
  if group_key = 'triceps' then return 'triceps'; end if;
  if group_key in ('dorsal', 'dorsais', 'costas', 'latissimo', 'latissimos') then return 'dorsal'; end if;
  if group_key in ('trapezio', 'trapezios', 'trapezio_inferior') then return 'trapezio'; end if;
  if group_key in ('peitoral', 'peito', 'peitorais', 'chest') then return 'peitoral'; end if;
  return null;
end;
$$;

revoke all on function public.canonical_volume_muscle_group(text) from public, anon;
grant execute on function public.canonical_volume_muscle_group(text) to authenticated, service_role;

create or replace function public.volume_muscle_group_label(p_group text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  group_slug text := public.canonical_volume_muscle_group(p_group);
begin
  if group_slug = 'abdomen' then return 'Abdômen'; end if;
  if group_slug = 'quadriceps' then return 'Quadríceps'; end if;
  if group_slug = 'posterior_de_coxa' then return 'Posterior de coxa'; end if;
  if group_slug = 'gluteos' then return 'Glúteos'; end if;
  if group_slug = 'adutores' then return 'Adutores'; end if;
  if group_slug = 'panturrilha' then return 'Panturrilha'; end if;
  if group_slug = 'deltoide_lateral' then return 'Deltoide Lateral'; end if;
  if group_slug = 'deltoide_posterior' then return 'Deltoide Posterior'; end if;
  if group_slug = 'deltoide_anterior' then return 'Deltoide Anterior'; end if;
  if group_slug = 'antebraco' then return 'Antebraço'; end if;
  if group_slug = 'biceps' then return 'Biceps'; end if;
  if group_slug = 'triceps' then return 'Triceps'; end if;
  if group_slug = 'dorsal' then return 'Dorsal'; end if;
  if group_slug = 'trapezio' then return 'Trapezio'; end if;
  if group_slug = 'peitoral' then return 'Peitoral'; end if;
  return null;
end;
$$;

revoke all on function public.volume_muscle_group_label(text) from public, anon;
grant execute on function public.volume_muscle_group_label(text) to authenticated, service_role;

create or replace function public.canonical_exercise_category(
  p_category text,
  p_name text default null,
  p_description text default null,
  p_muscle_group text default null,
  p_equipment text default null
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  category_key text := public.exercise_taxonomy_key(p_category);
  clue text := public.exercise_taxonomy_key(concat_ws(' ', p_name, p_description, p_muscle_group, p_equipment));
  clue_text text := replace(clue, '_', ' ');
begin
  if category_key = '' then return null; end if;
  if category_key in ('core', 'abdomen', 'abdominal', 'abdominais', 'abs') then return 'core'; end if;
  if category_key in ('mobilidades', 'mobilidade', 'mobility', 'alongamento', 'stretching') then return 'mobilidades'; end if;
  if category_key in ('funcionais', 'funcional', 'controle_motor', 'fisioterapia', 'fisio', 'ativacao', 'estabilidade', 'propriocepcao') then
    if category_key in ('fisioterapia', 'fisio') then
      if clue_text ~ 'salto|jump|hop|bound|drop|pliometr|arremesso|slam|rebote|aterriss' then return 'pliometria'; end if;
      if clue_text ~ 'mobil|along|libera|foam|amplitude|rotacao articular' then return 'mobilidades'; end if;
      if clue_text ~ 'prancha|abdom|pallof|bird dog|dead bug|anti rotacao' then return 'core'; end if;
      if clue_text ~ 'maquina|polia|cabo|leg press|cadeira|mesa flexora' then return 'maquinas'; end if;
      if clue_text ~ 'halter|barra|kettlebell|anilha' then return 'pesos_livre'; end if;
      if clue_text ~ 'peso corporal|bodyweight|flexao|barra fixa|solo' then return 'peso_corporal'; end if;
      if clue_text ~ 'agach|terra|levantamento|supino|remada|puxada' then return 'base'; end if;
    end if;
    return 'funcionais';
  end if;
  if category_key in ('base', 'basico', 'composto', 'compostos') then return 'base'; end if;
  if category_key in ('pesos_livre', 'pesos_livres', 'peso_livre', 'halteres', 'barra', 'kettlebell', 'anilha') then return 'pesos_livre'; end if;
  if category_key in ('peso_corporal', 'calistenia', 'livre', 'bodyweight', 'solo') then return 'peso_corporal'; end if;
  if category_key in ('maquinas', 'maquina', 'polia', 'cabo', 'leg_press', 'cadeira', 'mesa_flexora') then return 'maquinas'; end if;
  if category_key in ('pliometria', 'performance', 'pliometrico', 'salto', 'jump', 'hop', 'bound') then return 'pliometria'; end if;
  return null;
end;
$$;

revoke all on function public.canonical_exercise_category(text, text, text, text, text) from public, anon;
grant execute on function public.canonical_exercise_category(text, text, text, text, text) to authenticated, service_role;

do $$
declare
  v_categories_udt text;
begin
  select c.udt_name
    into v_categories_udt
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'exercise_library'
     and c.column_name = 'categories';

  if v_categories_udt = '_text' then
    execute $migration$
      update public.exercise_library e
         set taxonomy_legacy_categories = jsonb_build_object(
           'category', e.category,
           'categories', to_jsonb(e.categories),
           'muscle_group', e.muscle_group
         )
       where e.taxonomy_legacy_categories is null
         and (e.category is not null or cardinality(coalesce(e.categories, '{}'::text[])) > 0 or e.muscle_group is not null);
    $migration$;

    execute $migration$
      with normalized as (
        select
          e.id,
          coalesce((
            select array_agg(category order by first_ord)
            from (
              select category, min(ord) as first_ord
              from (
                select public.canonical_exercise_category(raw.value, e.name, e.description, e.muscle_group, e.equipment) category, raw.ord
                from unnest(array_cat(
                  array_cat(coalesce(e.categories, '{}'::text[]), array[e.category]),
                  array[e.muscle_group]
                )) with ordinality raw(value, ord)
              ) raw_categories
              where category is not null
              group by category
            ) ordered_categories
          ), '{}'::text[]) as categories
        from public.exercise_library e
      )
      update public.exercise_library e
         set category = normalized.categories[1],
             categories = normalized.categories
        from normalized
       where e.id = normalized.id
         and cardinality(normalized.categories) > 0
         and (
           e.category is distinct from normalized.categories[1]
           or coalesce(e.categories, '{}'::text[]) is distinct from normalized.categories
         );
    $migration$;

    if not exists (
      select 1 from pg_constraint where conname = 'exercise_library_categories_canonical'
    ) then
      alter table public.exercise_library
        add constraint exercise_library_categories_canonical
        check (coalesce(categories, '{}'::text[]) <@ array[
          'core',
          'mobilidades',
          'funcionais',
          'base',
          'pesos_livre',
          'peso_corporal',
          'maquinas',
          'pliometria'
        ]::text[]) not valid;
    end if;
  elsif v_categories_udt = 'jsonb' then
    execute $migration$
      update public.exercise_library e
         set taxonomy_legacy_categories = jsonb_build_object(
           'category', e.category,
           'categories', e.categories,
           'muscle_group', e.muscle_group
         )
       where e.taxonomy_legacy_categories is null
         and (e.category is not null or coalesce(e.categories, '[]'::jsonb) <> '[]'::jsonb or e.muscle_group is not null);
    $migration$;

    execute $migration$
      with normalized as (
        select
          e.id,
          (
            select jsonb_agg(category order by first_ord)
            from (
              select category, min(ord) as first_ord
              from (
                select public.canonical_exercise_category(raw.value, e.name, e.description, e.muscle_group, e.equipment) category, raw.ord
                from jsonb_array_elements_text(case when jsonb_typeof(e.categories) = 'array' then e.categories else '[]'::jsonb end) with ordinality raw(value, ord)
                union all
                select public.canonical_exercise_category(e.category, e.name, e.description, e.muscle_group, e.equipment), 100000
                union all
                select public.canonical_exercise_category(e.muscle_group, e.name, e.description, e.muscle_group, e.equipment), 100001
              ) categories
              where category is not null
              group by category
            ) ordered_categories
          ) as categories
        from public.exercise_library e
      )
      update public.exercise_library e
         set category = normalized.categories->>0,
             categories = coalesce(normalized.categories, '[]'::jsonb)
        from normalized
       where e.id = normalized.id
         and normalized.categories is not null
         and (
           e.category is distinct from normalized.categories->>0
           or coalesce(e.categories, '[]'::jsonb) is distinct from coalesce(normalized.categories, '[]'::jsonb)
         );
    $migration$;
  end if;
end
$$;

create or replace function public.replace_exercise_muscle_targets(
  p_exercise_id uuid,
  p_targets jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_is_global boolean;
  v_targets jsonb := coalesce(p_targets, '[]'::jsonb);
begin
  select el.company_id, el.is_global into v_company_id, v_is_global
  from public.exercise_library el
  where el.id = p_exercise_id;
  if not found then
    raise exception 'Exercício não encontrado' using errcode = 'P0002';
  end if;
  if auth.role() is distinct from 'service_role'
     and not public.has_role(auth.uid(), 'master'::public.app_role)
     and (v_is_global or not public.is_company_staff(auth.uid(), v_company_id)) then
    raise exception 'Acesso negado ao exercício informado' using errcode = '42501';
  end if;
  if jsonb_typeof(v_targets) <> 'array' then
    raise exception 'Alvos musculares devem ser enviados como array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_targets) as target(
      muscle_group_id uuid,
      role text,
      is_primary boolean
    )
    where target.muscle_group_id is null
       or target.role is null
       or target.role not in ('primary', 'secondary')
       or target.is_primary is null
       or target.is_primary is distinct from (target.role = 'primary')
  ) then
    raise exception 'Alvo muscular inválido ou role/is_primary incoerente' using errcode = '22023';
  end if;
  if jsonb_array_length(v_targets) > 0 and not exists (
    select 1
    from jsonb_to_recordset(v_targets) as target(role text)
    where target.role = 'primary'
  ) then
    raise exception 'Ao menos um alvo primário é obrigatório quando houver alvos' using errcode = '22023';
  end if;
  if exists (
    select target.muscle_group_id
    from jsonb_to_recordset(v_targets) as target(muscle_group_id uuid)
    group by target.muscle_group_id
    having count(*) > 1
  ) then
    raise exception 'Grupamento muscular duplicado' using errcode = '23505';
  end if;
  if exists (
    select public.canonical_volume_muscle_group(mg.name) as muscle_slug
    from jsonb_to_recordset(v_targets) as target(muscle_group_id uuid)
    join public.muscle_groups mg on mg.id = target.muscle_group_id
    group by public.canonical_volume_muscle_group(mg.name)
    having count(*) > 1
  ) then
    raise exception 'Grupamento muscular duplicado na taxonomia canônica' using errcode = '23505';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_targets) as target(muscle_group_id uuid)
    left join public.muscle_groups mg on mg.id = target.muscle_group_id
    where mg.id is null
       or public.canonical_volume_muscle_group(mg.name) is null
  ) then
    raise exception 'Grupamento muscular inexistente ou fora da taxonomia de volume' using errcode = '23503';
  end if;

  delete from public.exercise_muscle_targets
  where exercise_id = p_exercise_id;

  insert into public.exercise_muscle_targets (
    exercise_id,
    muscle_group_id,
    role,
    is_primary,
    volume_percentage
  )
  select
    p_exercise_id,
    target.muscle_group_id,
    target.role,
    target.is_primary,
    case when target.role = 'primary' then 100 else 50 end
  from jsonb_to_recordset(v_targets) as target(
    muscle_group_id uuid,
    role text,
    is_primary boolean
  );
end;
$$;

revoke all on function public.replace_exercise_muscle_targets(uuid, jsonb) from public, anon;
grant execute on function public.replace_exercise_muscle_targets(uuid, jsonb) to authenticated, service_role;

comment on function public.canonical_volume_muscle_group(text) is
  'Returns one of the 15 fixed volume muscle slugs, or null for categories/generic labels.';
comment on function public.canonical_exercise_category(text, text, text, text, text) is
  'Returns one of the 8 exercise category filter slugs, using legacy muscle_group only as category clue.';
comment on function public.replace_exercise_muscle_targets(uuid, jsonb) is
  'Atomic replacement of explicit anatomical targets. Empty array clears targets for category-only exercises.';
