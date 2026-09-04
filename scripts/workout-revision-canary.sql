-- Transactional production canary. It exercises authorization, exact snapshot
-- comparison, atomic replacement, and stale-write rejection, then rolls back.
begin;

do $$
declare
  candidate record;
  selected_cycle uuid;
  expected_rows jsonb;
  desired_workouts jsonb;
  result jsonb;
  original_ids uuid[];
  desired_days integer[];
begin
  for candidate in
    select distinct
      member.user_id,
      cycle.id as cycle_id,
      cycle.company_id,
      cycle.student_id
    from public.company_members member
    join public.training_cycles cycle on cycle.company_id = member.company_id
    join public.workouts workout on workout.cycle_id = cycle.id
      and workout.superseded_at is null
    where cycle.status = 'active'
      and cycle.superseded_by_cycle_id is null
      and cycle.start_date <= public.current_business_date()
      and cycle.end_date >= public.current_business_date()
      and jsonb_array_length(coalesce(workout.exercises, '[]'::jsonb)) > 0
    order by cycle.id, member.user_id
  loop
    perform set_config('request.jwt.claim.sub', candidate.user_id::text, true);
    if public.can_manage_staff_student(candidate.company_id, candidate.student_id) then
      selected_cycle := candidate.cycle_id;
      exit;
    end if;
  end loop;

  if selected_cycle is null then
    raise exception 'canary_missing_authorized_cycle';
  end if;

  select
    jsonb_agg(jsonb_build_object('id', workout.id, 'updated_at', workout.updated_at) order by workout.sort_order, workout.created_at),
    jsonb_agg(jsonb_build_object(
      'title', coalesce(workout.title, workout.name),
      'description', workout.description,
      'day_of_week', workout.day_of_week,
      'exercises', workout.exercises
    ) order by workout.sort_order, workout.created_at),
    array_agg(workout.id order by workout.sort_order, workout.created_at),
    array_agg(workout.day_of_week order by workout.sort_order, workout.created_at)
  into expected_rows, desired_workouts, original_ids, desired_days
  from public.workouts workout
  where workout.cycle_id = selected_cycle
    and workout.superseded_at is null;

  result := public.replace_cycle_workout_revision(selected_cycle, expected_rows, desired_workouts);

  if (result->>'workouts_created')::integer <> jsonb_array_length(desired_workouts)
    or (select count(*) from public.workouts workout where workout.cycle_id = selected_cycle and workout.superseded_at is null)
       <> jsonb_array_length(desired_workouts)
    or (select count(*) from public.workouts workout where workout.id = any(original_ids) and workout.superseded_at is not null)
       <> cardinality(original_ids)
    or (select array_agg(workout.day_of_week order by workout.sort_order, workout.created_at)
        from public.workouts workout
        where workout.cycle_id = selected_cycle and workout.superseded_at is null)
       is distinct from desired_days then
    raise exception 'canary_atomic_replacement_failed';
  end if;

  begin
    perform public.replace_cycle_workout_revision(selected_cycle, expected_rows, desired_workouts);
    raise exception 'canary_stale_snapshot_was_accepted';
  exception
    when others then
      if sqlerrm not like '%workout_revision_changed%' then
        raise;
      end if;
  end;
end;
$$;

rollback;
select true as atomic_revision_canary_passed, true as all_changes_rolled_back;
