-- Read-only verification for the 2026-09-14 cycle library repair.

with expected(id, category, categories) as (
  values
    ('c78ec371-9f27-5abb-aa6c-a24bdd8015e7'::uuid, 'base', array['base','peso_corporal']::text[]),
    ('bdfadd50-d76a-5dc1-8496-bae5f85db591'::uuid, 'base', array['base','pesos_livre']::text[]),
    ('ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01'::uuid, 'funcionais', array['funcionais','base','pesos_livre']::text[]),
    ('627da02e-17f0-5878-84e0-263787e4ac3d'::uuid, 'base', array['base','pliometria','peso_corporal']::text[]),
    ('7bf6dc5d-28c0-57e3-b104-5a059e2af3d0'::uuid, 'mobilidades', array['mobilidades']::text[]),
    ('7bdb19e1-e88e-59d8-89f1-9a5ae09f7b4a'::uuid, 'mobilidades', array['mobilidades']::text[]),
    ('68435077-73bf-4ad9-9f10-1cf1f7fe35b8'::uuid, 'base', array['base','peso_corporal']::text[]),
    ('7a8976b1-789e-4ea7-b499-8b81ece87d25'::uuid, 'base', array['base','pesos_livre']::text[]),
    ('da6ed290-59ef-49c0-a831-51ee224233bf'::uuid, 'base', array['base','pesos_livre']::text[]),
    ('3e192862-ed2e-4063-b6f9-13b433844cf8'::uuid, 'base', array['base','peso_corporal']::text[]),
    ('d65552e0-a929-4a03-9be0-0bb86899e428'::uuid, 'funcionais', array['funcionais','pesos_livre']::text[])
),
cycle_refs as (
  select case
    when item->>'exercise_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (item->>'exercise_id')::uuid
    else null
  end as exercise_id
  from public.workouts workout
  cross join lateral jsonb_array_elements(coalesce(workout.exercises, '[]'::jsonb)) item
  where workout.cycle_id = 'be282d1b-6d73-407f-b67c-5086337c9022'::uuid
),
target_rows as (
  select target.exercise_id, target.role, target.is_primary, target.volume_percentage,
         muscle.name as muscle_group_name
  from public.exercise_muscle_targets target
  join public.muscle_groups muscle on muscle.id = target.muscle_group_id
  where target.exercise_id in (select id from expected)
)
select
  (select count(*) from expected) as expected_library_rows,
  (select count(*) from expected join public.exercise_library library using (id)) as found_library_rows,
  (select count(*) from expected join public.exercise_library library using (id)
    where library.category = expected.category and library.categories = expected.categories) as exact_taxonomy_rows,
  (select count(*) from target_rows) as target_rows,
  (select count(*) from target_rows
    where public.canonical_volume_muscle_group(muscle_group_name) is null) as noncanonical_target_rows,
  (select count(*) from target_rows
    where (role = 'primary' and (not is_primary or volume_percentage <> 100))
       or (role = 'secondary' and (is_primary or volume_percentage <> 50))
       or role not in ('primary', 'secondary')) as invalid_weight_rows,
  (select count(*) from target_rows
    where exercise_id in (
      '7bf6dc5d-28c0-57e3-b104-5a059e2af3d0'::uuid,
      '7bdb19e1-e88e-59d8-89f1-9a5ae09f7b4a'::uuid
    )) as mobility_target_rows,
  (select count(*) from cycle_refs) as cycle_reference_rows,
  (select count(*) from cycle_refs refs
    left join public.exercise_library library on library.id = refs.exercise_id
    where refs.exercise_id is not null and library.id is null) as invalid_cycle_reference_rows,
  (select count(*) from public.workouts workout
    cross join lateral jsonb_array_elements(coalesce(workout.exercises, '[]'::jsonb)) item
    where item->>'exercise_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (item->>'exercise_id')::uuid in (select id from expected)) as historical_reference_rows;
