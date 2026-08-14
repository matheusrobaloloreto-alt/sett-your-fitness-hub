-- Optimistic concurrency for per-set workout logs. A stale device may not
-- overwrite a newer revision saved by another device.
alter table public.workout_logs
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();

-- NOT VALID preserva possíveis linhas históricas legadas, mas já impede novas
-- identidades parciais (que burlariam a unicidade porque NULL <> NULL).
alter table public.workout_logs
  add constraint workout_logs_identity_fields_required
  check (
    student_id is not null
    and workout_id is not null
    and exercise_index is not null
    and set_number is not null
    and session_date is not null
  ) not valid;

create or replace function public.touch_workout_log_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_workout_log_revision on public.workout_logs;
create trigger touch_workout_log_revision
before update on public.workout_logs
for each row execute function public.touch_workout_log_revision();

create or replace function public.save_workout_logs_if_current(_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  current_row public.workout_logs%rowtype;
  expected_revision bigint;
  item_student_id uuid;
  item_workout_id uuid;
  item_exercise_index integer;
  item_set_number integer;
  item_session_date date;
  item_weight numeric;
  item_reps integer;
  item_rpe smallint;
  item_set_type text;
  item_completed boolean;
  workout_exercises jsonb;
  exercise_definition jsonb;
  base_set_count integer;
  weekly_set_count integer;
  max_set_number integer;
  saved jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(_rows) <> 'array' then
    raise exception '_rows must be a JSON array';
  end if;
  if jsonb_array_length(_rows) > 200 then
    raise exception '_rows exceeds the 200 item limit';
  end if;

  for item in select value from jsonb_array_elements(_rows)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'each workout log must be a JSON object';
    end if;

    item_student_id := (item->>'student_id')::uuid;
    item_workout_id := (item->>'workout_id')::uuid;
    item_exercise_index := (item->>'exercise_index')::integer;
    item_set_number := (item->>'set_number')::integer;
    item_session_date := (item->>'session_date')::date;
    item_weight := coalesce(nullif(item->>'weight', '')::numeric, 0);
    item_reps := coalesce(nullif(item->>'reps_done', '')::integer, 0);
    item_rpe := nullif(item->>'rpe', '')::smallint;
    item_set_type := coalesce(nullif(item->>'set_type', ''), 'normal');
    item_completed := coalesce(nullif(item->>'completed', '')::boolean, false);
    expected_revision := nullif(item->>'base_revision', '')::bigint;

    if item_student_id is null or item_workout_id is null then
      raise exception 'student_id and workout_id are required';
    end if;
    if item_exercise_index is null then
      raise exception 'exercise_index is required';
    end if;
    if item_set_number is null then
      raise exception 'set_number is required';
    end if;
    if item_session_date is null then
      raise exception 'session_date is required';
    end if;
    if item_weight < 0 or item_weight > 2000 then
      raise exception 'weight out of range';
    end if;
    if item_reps < 0 or item_reps > 1000 then
      raise exception 'reps_done out of range';
    end if;
    if item_rpe is not null and (item_rpe < 1 or item_rpe > 10) then
      raise exception 'rpe out of range';
    end if;
    if item_set_type not in ('warmup', 'normal', 'failure', 'drop') then
      raise exception 'invalid set_type';
    end if;
    if item_session_date < current_date - 3650 or item_session_date > current_date + 1 then
      raise exception 'session_date out of range';
    end if;
    if expected_revision is not null and expected_revision < 1 then
      raise exception 'base_revision out of range';
    end if;
    select w.exercises into workout_exercises
      from public.workouts w
      join public.training_cycles tc on tc.id = w.cycle_id
      join public.students s on s.id = item_student_id
      where w.id = item_workout_id
        and tc.student_id = s.id
        and tc.company_id = s.company_id
        and w.company_id = s.company_id;
    if not found then
      raise exception 'workout does not belong to student tenant';
    end if;
    if workout_exercises is null or jsonb_typeof(workout_exercises) <> 'array' then
      raise exception 'workout exercises must be a JSON array';
    end if;
    if item_exercise_index < 0
      or item_exercise_index >= jsonb_array_length(workout_exercises) then
      raise exception 'exercise_index out of workout range';
    end if;

    exercise_definition := workout_exercises -> item_exercise_index;
    if exercise_definition is null or jsonb_typeof(exercise_definition) <> 'object' then
      raise exception 'workout exercise entry must be a JSON object';
    end if;
    base_set_count := case
      when coalesce(exercise_definition->>'sets', '') ~ '^[0-9]+'
        and substring(exercise_definition->>'sets' from '^[0-9]+')::integer between 1 and 20
        then substring(exercise_definition->>'sets' from '^[0-9]+')::integer
      else 3
    end;
    select coalesce(max(
      case when coalesce(week_item->>'sets', '') ~ '^[0-9]+'
        then substring(week_item->>'sets' from '^[0-9]+')::integer
        else 0
      end
    ), 0) into weekly_set_count
    from jsonb_array_elements(
      case when jsonb_typeof(exercise_definition->'weekly_prescription') = 'array'
        then exercise_definition->'weekly_prescription'
        else '[]'::jsonb
      end
    ) as weekly_entries(week_item);
    -- O portal permite no máximo cinco séries adicionadas pelo aluno. O teto
    -- absoluto evita que uma prescrição corrompida abra espaço para logs fantasmas.
    max_set_number := least(greatest(base_set_count, weekly_set_count, 1) + 5, 25);
    if item_set_number < 1 or item_set_number > max_set_number then
      raise exception 'set_number exceeds prescribed sets plus five extras';
    end if;

    select * into current_row
    from public.workout_logs
    where student_id = item_student_id
      and workout_id = item_workout_id
      and exercise_index = item_exercise_index
      and set_number = item_set_number
      and session_date = item_session_date
    limit 1;

    if found then
      if expected_revision is null or current_row.revision <> expected_revision then
        conflicts := conflicts || jsonb_build_array(to_jsonb(current_row));
        continue;
      end if;

      update public.workout_logs
      set weight = item_weight,
          reps_done = item_reps,
          set_type = item_set_type,
          rpe = item_rpe,
          completed = item_completed
      where id = current_row.id and revision = expected_revision
      returning * into current_row;

      if found then
        saved := saved || jsonb_build_array(to_jsonb(current_row));
      else
        select * into current_row from public.workout_logs
        where student_id = item_student_id
          and workout_id = item_workout_id
          and exercise_index = item_exercise_index
          and set_number = item_set_number
          and session_date = item_session_date;
        conflicts := conflicts || jsonb_build_array(to_jsonb(current_row));
      end if;
    else
      begin
        insert into public.workout_logs (
          student_id, workout_id, exercise_index, set_number, session_date,
          weight, reps_done, set_type, rpe, completed
        ) values (
          item_student_id,
          item_workout_id,
          item_exercise_index,
          item_set_number,
          item_session_date,
          item_weight,
          item_reps,
          item_set_type,
          item_rpe,
          item_completed
        ) returning * into current_row;
        saved := saved || jsonb_build_array(to_jsonb(current_row));
      exception when unique_violation then
        select * into current_row from public.workout_logs
        where student_id = item_student_id
          and workout_id = item_workout_id
          and exercise_index = item_exercise_index
          and set_number = item_set_number
          and session_date = item_session_date;
        conflicts := conflicts || jsonb_build_array(to_jsonb(current_row));
      end;
    end if;
  end loop;

  return jsonb_build_object('saved', saved, 'conflicts', conflicts);
end;
$$;

revoke all on function public.save_workout_logs_if_current(jsonb) from public, anon;
grant execute on function public.save_workout_logs_if_current(jsonb) to authenticated;
