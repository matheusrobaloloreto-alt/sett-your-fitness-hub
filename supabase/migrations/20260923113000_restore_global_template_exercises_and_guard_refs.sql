-- Restore official global exercises referenced by templates and make orphaned
-- template references impossible to persist again.

do $$
begin
  if exists (
    select 1
    from public.exercise_library exercise
    join (values
      ('2ea75295-c1ce-495f-9d59-e2f5e94d72b2'::uuid, 'Biset Remada Baixa Pronada + Supinada'),
      ('0db0d50d-5d72-4ade-97f2-3ec1c64218d8'::uuid, 'Remada Baixa Neutra'),
      ('0c6d0470-cc1d-4388-aec3-c86ebf4ab0b9'::uuid, 'Remada Baixa Unilateral com Rotação'),
      ('c582b327-3be8-457a-9540-d534d3811572'::uuid, 'Biset Prancha Frontal + Lateral'),
      ('a53b70fb-7cda-4018-8b55-68a6e9aa5d0a'::uuid, 'Prancha Lateral com Abdução de Quadril Isométrica')
    ) as official(id, name) on official.id = exercise.id
    where public.exercise_taxonomy_key(exercise.name)
      <> public.exercise_taxonomy_key(official.name)
  ) then
    raise exception 'official_exercise_id_name_conflict';
  end if;
end
$$;

with official(id, name, muscle_group, equipment, category, youtube_video_id) as (
  values
    ('2ea75295-c1ce-495f-9d59-e2f5e94d72b2'::uuid, 'Biset Remada Baixa Pronada + Supinada', 'Dorsal', 'Livre/Funcional', 'base', 'pfgEEiouvAs'),
    ('0db0d50d-5d72-4ade-97f2-3ec1c64218d8'::uuid, 'Remada Baixa Neutra', 'Dorsal', 'Livre/Funcional', 'base', 'dUy0chKG-yo'),
    ('0c6d0470-cc1d-4388-aec3-c86ebf4ab0b9'::uuid, 'Remada Baixa Unilateral com Rotação', 'Dorsal', 'Livre/Funcional', 'base', 'PIVzsKEbdOo'),
    ('c582b327-3be8-457a-9540-d534d3811572'::uuid, 'Biset Prancha Frontal + Lateral', 'Abdômen', 'Peso Corporal', 'core', 'jh0z3gbljUM'),
    ('a53b70fb-7cda-4018-8b55-68a6e9aa5d0a'::uuid, 'Prancha Lateral com Abdução de Quadril Isométrica', 'Abdômen', 'Peso Corporal', 'core', 'aPnNYaed4mI')
)
insert into public.exercise_library (
  id,
  company_id,
  name,
  muscle_group,
  muscle_group_id,
  equipment,
  difficulty,
  is_global,
  category,
  categories,
  video_url,
  youtube_video_id,
  updated_at
)
select
  official.id,
  null,
  official.name,
  official.muscle_group,
  (
    select muscle_group.id
    from public.muscle_groups muscle_group
    where public.canonical_volume_muscle_group(muscle_group.name)
      = public.canonical_volume_muscle_group(official.muscle_group)
    order by muscle_group.created_at, muscle_group.id
    limit 1
  ),
  official.equipment,
  'intermediate',
  true,
  official.category,
  array[official.category]::text[],
  'https://youtu.be/' || official.youtube_video_id,
  official.youtube_video_id,
  now()
from official
on conflict (id) do update set
  company_id = null,
  name = excluded.name,
  muscle_group = excluded.muscle_group,
  muscle_group_id = excluded.muscle_group_id,
  equipment = excluded.equipment,
  difficulty = excluded.difficulty,
  is_global = true,
  category = excluded.category,
  categories = excluded.categories,
  video_url = excluded.video_url,
  youtube_video_id = excluded.youtube_video_id,
  updated_at = now();

insert into public.exercise_muscle_targets (
  exercise_id,
  muscle_group_id,
  role,
  volume_percentage,
  is_primary
)
select
  exercise.id,
  exercise.muscle_group_id,
  'primary',
  100,
  true
from public.exercise_library exercise
where exercise.id in (
  '2ea75295-c1ce-495f-9d59-e2f5e94d72b2',
  '0db0d50d-5d72-4ade-97f2-3ec1c64218d8',
  '0c6d0470-cc1d-4388-aec3-c86ebf4ab0b9',
  'c582b327-3be8-457a-9540-d534d3811572',
  'a53b70fb-7cda-4018-8b55-68a6e9aa5d0a'
)
and exercise.muscle_group_id is not null
on conflict (exercise_id, muscle_group_id) do update set
  role = excluded.role,
  volume_percentage = excluded.volume_percentage,
  is_primary = excluded.is_primary;

-- Two templates still carried temporary ids for exercises that now have an
-- official global id. Rewrite those ids while preserving every other field.
with rebuilt as (
  select
    template.id,
    jsonb_agg(
      case
        when jsonb_typeof(workout.item->'exercises') = 'array' then
          jsonb_set(
            workout.item,
            '{exercises}',
            coalesce((
              select jsonb_agg(
                case exercise.item->>'exercise_id'
                  when 'b5c45c36-8d31-4a5a-bf6a-dad9a68eec20' then
                    jsonb_set(exercise.item, '{exercise_id}', to_jsonb('0db0d50d-5d72-4ade-97f2-3ec1c64218d8'::text), false)
                  when '22398d00-8120-4a29-b0f3-2e0cfa14441f' then
                    jsonb_set(exercise.item, '{exercise_id}', to_jsonb('c582b327-3be8-457a-9540-d534d3811572'::text), false)
                  else exercise.item
                end
                order by exercise.ordinality
              )
              from jsonb_array_elements(workout.item->'exercises')
                with ordinality as exercise(item, ordinality)
            ), '[]'::jsonb),
            false
          )
        else workout.item
      end
      order by workout.ordinality
    ) as workouts
  from public.workout_templates template
  cross join lateral jsonb_array_elements(template.workouts)
    with ordinality as workout(item, ordinality)
  where template.workouts::text like '%b5c45c36-8d31-4a5a-bf6a-dad9a68eec20%'
     or template.workouts::text like '%22398d00-8120-4a29-b0f3-2e0cfa14441f%'
  group by template.id
)
update public.workout_templates template
set workouts = rebuilt.workouts
from rebuilt
where rebuilt.id = template.id;

create or replace function public.validate_workout_template_exercises()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  workout jsonb;
  exercise jsonb;
  exercise_id text;
  exercise_name text;
begin
  for workout in select item from jsonb_array_elements(new.workouts) as source(item)
  loop
    if jsonb_typeof(workout) <> 'object'
       or jsonb_typeof(coalesce(workout->'exercises', 'null'::jsonb)) <> 'array' then
      raise exception 'workout_template_payload_invalid'
        using errcode = '23514';
    end if;

    for exercise in select item from jsonb_array_elements(workout->'exercises') as source(item)
    loop
      exercise_id := nullif(btrim(exercise->>'exercise_id'), '');
      exercise_name := coalesce(nullif(btrim(exercise->>'exercise_name'), ''), 'Exercício sem nome');
      if exercise_id is null then
        raise exception 'workout_template_exercise_missing_id: %', exercise_name
          using errcode = '23514';
      end if;
      if not exists (
        select 1
        from public.exercise_library exercise_library_row
        where exercise_library_row.id::text = exercise_id
          and (
            exercise_library_row.is_global
            or exercise_library_row.company_id = new.company_id
          )
      ) then
        raise exception 'workout_template_exercise_not_visible: % (%)', exercise_name, exercise_id
          using errcode = '23514';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

revoke all on function public.validate_workout_template_exercises() from public, anon, authenticated;

drop trigger if exists validate_workout_template_exercises
on public.workout_templates;
create trigger validate_workout_template_exercises
before insert or update of company_id, workouts on public.workout_templates
for each row execute function public.validate_workout_template_exercises();

create or replace function public.protect_referenced_exercise_library_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Do not obstruct an intentional company cascade. Global rows never enter
  -- this branch because their company_id is null.
  if old.company_id is not null and not exists (
    select 1 from public.companies company where company.id = old.company_id
  ) then
    return old;
  end if;

  if exists (
    select 1
    from public.workout_templates template
    cross join lateral jsonb_array_elements(template.workouts) workout(item)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(workout.item->'exercises') = 'array'
        then workout.item->'exercises' else '[]'::jsonb end
    ) exercise(item)
    where exercise.item->>'exercise_id' = old.id::text
  ) or exists (
    select 1
    from public.workouts workout
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(workout.exercises) = 'array'
        then workout.exercises else '[]'::jsonb end
    ) exercise(item)
    where exercise.item->>'exercise_id' = old.id::text
      and workout.superseded_at is null
  ) then
    raise exception 'exercise_library_row_is_referenced: % (%)', old.name, old.id
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function public.protect_referenced_exercise_library_row() from public, anon, authenticated;

drop trigger if exists protect_referenced_exercise_library_row
on public.exercise_library;
create trigger protect_referenced_exercise_library_row
before delete on public.exercise_library
for each row execute function public.protect_referenced_exercise_library_row();

do $$
declare
  invalid_count integer;
begin
  select count(*) into invalid_count
  from public.workout_templates template
  cross join lateral jsonb_array_elements(template.workouts) workout(item)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(workout.item->'exercises') = 'array'
      then workout.item->'exercises' else '[]'::jsonb end
  ) exercise(item)
  left join public.exercise_library library
    on library.id::text = exercise.item->>'exercise_id'
   and (library.is_global or library.company_id = template.company_id)
  where nullif(btrim(exercise.item->>'exercise_id'), '') is null
     or library.id is null;

  if invalid_count > 0 then
    raise exception 'workout_template_integrity_postflight_failed: % invalid reference(s)', invalid_count;
  end if;
end
$$;

comment on function public.validate_workout_template_exercises() is
  'Rejects template exercises outside the template company global-plus-owned library.';
comment on function public.protect_referenced_exercise_library_row() is
  'Prevents deleting exercises still referenced by a template or current workout.';
