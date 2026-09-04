-- A null day_of_week is intentional for workouts without a fixed weekday.
-- Preserve it; only derive an ordinal day for legacy payloads that omit the key.

create or replace function public.replace_cycle_workout_revision(
  p_cycle_id uuid,
  p_expected_rows jsonb,
  p_workouts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor uuid := auth.uid();
  v_cycle public.training_cycles%rowtype;
  v_expected_count integer;
  v_live_count integer;
  v_revision_id uuid := gen_random_uuid();
  v_workout_ids uuid[] := '{}'::uuid[];
  v_item jsonb;
  v_index integer;
  v_day_of_week integer;
  v_workout_id uuid;
  v_title text;
begin
  if v_actor is null then
    raise exception 'workout_revision_forbidden';
  end if;
  if p_cycle_id is null
    or jsonb_typeof(p_expected_rows) is distinct from 'array'
    or jsonb_typeof(p_workouts) is distinct from 'array'
    or jsonb_array_length(p_workouts) < 1
    or jsonb_array_length(p_workouts) > 14 then
    raise exception 'workout_revision_payload_invalid';
  end if;

  select cycle.*
  into v_cycle
  from public.training_cycles cycle
  where cycle.id = p_cycle_id
  for update;

  if not found or v_cycle.status = 'superseded' or v_cycle.superseded_by_cycle_id is not null then
    raise exception 'workout_revision_cycle_not_found';
  end if;
  if not public.can_manage_staff_student(v_cycle.company_id, v_cycle.student_id) then
    raise exception 'workout_revision_forbidden';
  end if;

  if v_cycle.end_date < public.current_business_date()
    and exists (
      select 1
      from public.training_cycles current_cycle
      where current_cycle.enrollment_id = v_cycle.enrollment_id
        and current_cycle.id <> v_cycle.id
        and current_cycle.status <> 'superseded'
        and current_cycle.superseded_by_cycle_id is null
        and current_cycle.start_date <= public.current_business_date()
        and current_cycle.end_date >= public.current_business_date()
    ) then
    raise exception 'workout_revision_cycle_not_visible';
  end if;

  if v_cycle.start_date <= public.current_business_date()
    and v_cycle.end_date >= public.current_business_date()
    and v_cycle.status <> 'active'
    and exists (
      select 1
      from public.training_cycles active_cycle
      join public.workouts active_workout on active_workout.cycle_id = active_cycle.id
        and active_workout.superseded_at is null
        and jsonb_array_length(coalesce(active_workout.exercises, '[]'::jsonb)) > 0
      where active_cycle.enrollment_id = v_cycle.enrollment_id
        and active_cycle.id <> v_cycle.id
        and active_cycle.status = 'active'
        and active_cycle.superseded_by_cycle_id is null
        and active_cycle.start_date <= public.current_business_date()
        and active_cycle.end_date >= public.current_business_date()
    ) then
    raise exception 'workout_revision_cycle_not_visible';
  end if;

  perform 1
  from public.workouts workout
  where workout.cycle_id = p_cycle_id
    and workout.superseded_at is null
  for update;

  v_expected_count := jsonb_array_length(p_expected_rows);
  select count(*) into v_live_count
  from public.workouts workout
  where workout.cycle_id = p_cycle_id
    and workout.superseded_at is null;

  if v_live_count <> v_expected_count
    or exists (
      select 1
      from public.workouts workout
      where workout.cycle_id = p_cycle_id
        and workout.superseded_at is null
        and not exists (
          select 1
          from jsonb_array_elements(p_expected_rows) expected
          where (expected->>'id')::uuid = workout.id
            and (expected->>'updated_at')::timestamptz = workout.updated_at
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(p_expected_rows) expected
      where not exists (
        select 1
        from public.workouts workout
        where workout.cycle_id = p_cycle_id
          and workout.superseded_at is null
          and workout.id = (expected->>'id')::uuid
          and workout.updated_at = (expected->>'updated_at')::timestamptz
      )
    ) then
    raise exception 'workout_revision_changed';
  end if;

  update public.workouts
  set
    superseded_at = now(),
    superseded_by_revision_id = v_revision_id,
    superseded_reason = 'replaced_by_trainer_revision'
  where cycle_id = p_cycle_id
    and superseded_at is null;

  for v_item, v_index in
    select item, ordinality::integer
    from jsonb_array_elements(p_workouts) with ordinality as desired(item, ordinality)
  loop
    v_title := nullif(btrim(v_item->>'title'), '');
    v_day_of_week := case
      when not (v_item ? 'day_of_week') then v_index
      when jsonb_typeof(v_item->'day_of_week') = 'null' then null
      when jsonb_typeof(v_item->'day_of_week') = 'number' then (v_item->>'day_of_week')::integer
      else -1
    end;
    if v_title is null
      or jsonb_typeof(coalesce(v_item->'exercises', 'null'::jsonb)) is distinct from 'array'
      or (v_day_of_week is not null and (v_day_of_week < 1 or v_day_of_week > 7)) then
      raise exception 'workout_revision_payload_invalid';
    end if;

    insert into public.workouts (
      cycle_id,
      company_id,
      name,
      title,
      description,
      day_of_week,
      sort_order,
      exercises,
      created_by,
      revision_id
    ) values (
      p_cycle_id,
      v_cycle.company_id,
      v_title,
      v_title,
      nullif(btrim(v_item->>'description'), ''),
      v_day_of_week,
      v_index,
      v_item->'exercises',
      v_actor,
      v_revision_id
    )
    returning id into v_workout_id;
    v_workout_ids := array_append(v_workout_ids, v_workout_id);
  end loop;

  insert into public.ai_plan_versions (
    company_id,
    student_id,
    cycle_id,
    plan,
    edited,
    edit_summary,
    created_by
  ) values (
    v_cycle.company_id,
    v_cycle.student_id,
    v_cycle.id,
    jsonb_build_object('revision_id', v_revision_id, 'workouts', p_workouts),
    true,
    'Revisão manual atômica do conjunto de treinos',
    v_actor
  );

  return jsonb_build_object(
    'cycle_id', p_cycle_id,
    'revision_id', v_revision_id,
    'workouts_created', cardinality(v_workout_ids),
    'workout_ids', to_jsonb(v_workout_ids)
  );
end;
$$;

revoke all on function public.replace_cycle_workout_revision(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_cycle_workout_revision(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.replace_cycle_workout_revision(uuid, jsonb, jsonb) to service_role;
