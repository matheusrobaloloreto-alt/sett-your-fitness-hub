-- A prescription is a revisioned set, not a bag of mutable workout rows.
-- Previous rows remain addressable by workout_logs/workout_sessions, while all
-- current screens read only rows whose superseded_at is null.

alter table public.workouts
  add column if not exists revision_id uuid,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_revision_id uuid,
  add column if not exists superseded_reason text;

create index if not exists idx_workouts_current_cycle_order
  on public.workouts(cycle_id, sort_order, created_at)
  where superseded_at is null;

create table if not exists public.workout_revision_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null,
  cycle_id uuid not null,
  workout_id uuid not null,
  before_row jsonb not null,
  before_sha256 text not null,
  repaired_at timestamptz not null default now(),
  unique (repair_key, workout_id)
);

alter table public.workout_revision_repair_audit enable row level security;
revoke all on table public.workout_revision_repair_audit from public, anon, authenticated;
grant all on table public.workout_revision_repair_audit to service_role;

-- The MFIT migration deliberately appended imported rows to a materialized
-- SETT cycle. That preserved data, but it exposed two independent plans as one
-- prescription. Restore the pre-existing SETT revision only when the imported
-- rows are pristine; usage is retained because the rows are superseded, never
-- deleted or rewritten.
with mixed_cycles as (
  select distinct imported.cycle_id
  from public.workouts imported
  where imported.superseded_at is null
    and imported.notes like 'mfit-import:v1:%'
    and imported.updated_at <= imported.created_at + interval '1 minute'
    and exists (
      select 1
      from public.workouts authored
      where authored.cycle_id = imported.cycle_id
        and authored.superseded_at is null
        and authored.notes is distinct from imported.notes
        and coalesce(authored.notes, '') not like 'mfit-import:v1:%'
        and jsonb_array_length(coalesce(authored.exercises, '[]'::jsonb)) > 0
        and authored.created_at < imported.created_at
    )
), imported_rows as (
  select
    workout.*,
    md5(workout.cycle_id::text || ':sett-native-restored')::uuid as restored_revision_id,
    md5(workout.cycle_id::text || ':mfit-appended')::uuid as imported_revision_id
  from public.workouts workout
  join mixed_cycles mixed on mixed.cycle_id = workout.cycle_id
  where workout.superseded_at is null
    and workout.notes like 'mfit-import:v1:%'
    and workout.updated_at <= workout.created_at + interval '1 minute'
), audit_rows as (
  insert into public.workout_revision_repair_audit (
    repair_key,
    cycle_id,
    workout_id,
    before_row,
    before_sha256
  )
  select
    '20260903_restore_native_after_mfit_append',
    row_value.cycle_id,
    row_value.id,
    to_jsonb(row_value) - 'restored_revision_id' - 'imported_revision_id',
    encode(extensions.digest(convert_to((to_jsonb(row_value) - 'restored_revision_id' - 'imported_revision_id')::text, 'UTF8'), 'sha256'), 'hex')
  from imported_rows row_value
  on conflict (repair_key, workout_id) do nothing
  returning workout_id
)
update public.workouts workout
set
  revision_id = imported.imported_revision_id,
  superseded_at = now(),
  superseded_by_revision_id = imported.restored_revision_id,
  superseded_reason = 'mfit_overlap_existing_sett_revision'
from imported_rows imported
where workout.id = imported.id
  and workout.superseded_at is null
  and (
    exists (select 1 from audit_rows audit where audit.workout_id = workout.id)
    or exists (
      select 1
      from public.workout_revision_repair_audit audit
      where audit.repair_key = '20260903_restore_native_after_mfit_append'
        and audit.workout_id = workout.id
    )
  );

-- Give every surviving legacy set a stable revision identity. All rows in one
-- current cycle belong to the same revision until the next atomic replacement.
with current_cycle_revisions as (
  select cycle_id, gen_random_uuid() as revision_id
  from public.workouts
  where superseded_at is null
  group by cycle_id
)
update public.workouts workout
set revision_id = revision.revision_id
from current_cycle_revisions revision
where workout.cycle_id = revision.cycle_id
  and workout.superseded_at is null
  and workout.revision_id is null;

alter table public.workouts
  alter column revision_id set default gen_random_uuid();

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

  -- A completed/historical cycle cannot update what the student sees today.
  -- Fail loudly instead of returning a false success.
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

  -- If overlapping cycles exist today, only the active one may be edited as
  -- the currently delivered prescription.
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
    if v_title is null
      or jsonb_typeof(coalesce(v_item->'exercises', 'null'::jsonb)) is distinct from 'array' then
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
      v_index,
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
