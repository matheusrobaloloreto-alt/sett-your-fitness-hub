-- Repair only missing workout JSON exercise references whose exercise_name has
-- exactly one normalized match in the library. Ambiguous names remain untouched.

create table if not exists public.workout_exercise_ref_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  workout_id uuid not null,
  exercise_index integer not null,
  exercise_name text not null,
  old_exercise_id text,
  new_exercise_id uuid not null,
  before_exercise jsonb not null,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (repair_key, workout_id, exercise_index)
);

alter table public.workout_exercise_ref_repair_audit enable row level security;
revoke all on table public.workout_exercise_ref_repair_audit from public, anon, authenticated;
grant select, insert, update on table public.workout_exercise_ref_repair_audit to service_role;

do $repair$
declare
  v_repair_key text := 'unique_missing_exercise_refs_20260903';
  v_expected integer := 0;
  v_updated integer := 0;
begin
  with target_company as (
    select id from public.companies where slug = 'bn-performance-training' limit 1
  ), unique_library_name as (
    select
      lower(regexp_replace(name, '\s+', ' ', 'g')) as normalized_name,
      (array_agg(id order by id::text))[1] as exercise_id,
      count(*) as candidate_count
    from public.exercise_library
    group by lower(regexp_replace(name, '\s+', ' ', 'g'))
    having count(*) = 1
  ), repairable_slots as (
    select
      workout.id as workout_id,
      slot.ordinality::integer - 1 as exercise_index,
      slot.exercise,
      nullif(slot.exercise->>'exercise_id', '') as old_exercise_id,
      nullif(slot.exercise->>'exercise_name', '') as exercise_name,
      library.exercise_id as new_exercise_id
    from public.workouts workout
    join target_company company on company.id = workout.company_id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(workout.exercises) = 'array' then workout.exercises else '[]'::jsonb end
    ) with ordinality as slot(exercise, ordinality)
    join unique_library_name library
      on library.normalized_name = lower(regexp_replace(nullif(slot.exercise->>'exercise_name', ''), '\s+', ' ', 'g'))
    where nullif(slot.exercise->>'exercise_id', '') is not null
      and not exists (
        select 1 from public.exercise_library existing
        where existing.id::text = nullif(slot.exercise->>'exercise_id', '')
      )
  ), audited as (
    insert into public.workout_exercise_ref_repair_audit (
      repair_key, workout_id, exercise_index, exercise_name, old_exercise_id, new_exercise_id, before_exercise
    )
    select
      v_repair_key, slot.workout_id, slot.exercise_index, slot.exercise_name,
      slot.old_exercise_id, slot.new_exercise_id, slot.exercise
    from repairable_slots slot
    on conflict (repair_key, workout_id, exercise_index) do nothing
    returning workout_id, exercise_index, new_exercise_id
  ), rebuilt as (
    select
      workout.id as workout_id,
      jsonb_agg(
        case when audited.workout_id is not null
          then jsonb_set(slot.exercise, '{exercise_id}', to_jsonb(audited.new_exercise_id::text), true)
          else slot.exercise
        end
        order by slot.ordinality
      ) as exercises
    from public.workouts workout
    cross join lateral jsonb_array_elements(workout.exercises) with ordinality as slot(exercise, ordinality)
    left join audited
      on audited.workout_id = workout.id
     and audited.exercise_index = slot.ordinality::integer - 1
    where workout.id in (select distinct workout_id from audited)
    group by workout.id
  ), updated as (
    update public.workouts workout
    set exercises = rebuilt.exercises
    from rebuilt
    where workout.id = rebuilt.workout_id
    returning workout.id
  )
  select (select count(*) from audited), (select count(*) from updated)
  into v_expected, v_updated;

  if v_expected > 0 and v_updated < 1 then
    raise exception 'unique_missing_exercise_refs_repair_no_workouts_updated';
  end if;
end
$repair$;
