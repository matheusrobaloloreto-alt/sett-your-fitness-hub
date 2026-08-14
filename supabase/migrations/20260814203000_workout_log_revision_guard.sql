-- Optimistic concurrency for per-set workout logs. A stale device may not
-- overwrite a newer revision saved by another device.
alter table public.workout_logs
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();

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
  saved jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(_rows) <> 'array' then
    raise exception '_rows must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(_rows)
  loop
    expected_revision := nullif(item->>'base_revision', '')::bigint;
    select * into current_row
    from public.workout_logs
    where student_id = (item->>'student_id')::uuid
      and workout_id = (item->>'workout_id')::uuid
      and exercise_index = (item->>'exercise_index')::integer
      and set_number = (item->>'set_number')::integer
      and session_date = (item->>'session_date')::date
    limit 1;

    if found then
      if expected_revision is null or current_row.revision <> expected_revision then
        conflicts := conflicts || jsonb_build_array(to_jsonb(current_row));
        continue;
      end if;

      update public.workout_logs
      set weight = coalesce((item->>'weight')::numeric, 0),
          reps_done = coalesce((item->>'reps_done')::integer, 0),
          set_type = coalesce(nullif(item->>'set_type', ''), 'normal'),
          rpe = nullif(item->>'rpe', '')::smallint,
          completed = coalesce((item->>'completed')::boolean, false)
      where id = current_row.id and revision = expected_revision
      returning * into current_row;

      if found then
        saved := saved || jsonb_build_array(to_jsonb(current_row));
      else
        select * into current_row from public.workout_logs
        where student_id = (item->>'student_id')::uuid
          and workout_id = (item->>'workout_id')::uuid
          and exercise_index = (item->>'exercise_index')::integer
          and set_number = (item->>'set_number')::integer
          and session_date = (item->>'session_date')::date;
        conflicts := conflicts || jsonb_build_array(to_jsonb(current_row));
      end if;
    else
      begin
        insert into public.workout_logs (
          student_id, workout_id, exercise_index, set_number, session_date,
          weight, reps_done, set_type, rpe, completed
        ) values (
          (item->>'student_id')::uuid,
          (item->>'workout_id')::uuid,
          (item->>'exercise_index')::integer,
          (item->>'set_number')::integer,
          (item->>'session_date')::date,
          coalesce((item->>'weight')::numeric, 0),
          coalesce((item->>'reps_done')::integer, 0),
          coalesce(nullif(item->>'set_type', ''), 'normal'),
          nullif(item->>'rpe', '')::smallint,
          coalesce((item->>'completed')::boolean, false)
        ) returning * into current_row;
        saved := saved || jsonb_build_array(to_jsonb(current_row));
      exception when unique_violation then
        select * into current_row from public.workout_logs
        where student_id = (item->>'student_id')::uuid
          and workout_id = (item->>'workout_id')::uuid
          and exercise_index = (item->>'exercise_index')::integer
          and set_number = (item->>'set_number')::integer
          and session_date = (item->>'session_date')::date;
        conflicts := conflicts || jsonb_build_array(to_jsonb(current_row));
      end;
    end if;
  end loop;

  return jsonb_build_object('saved', saved, 'conflicts', conflicts);
end;
$$;

revoke all on function public.save_workout_logs_if_current(jsonb) from public, anon;
grant execute on function public.save_workout_logs_if_current(jsonb) to authenticated;
