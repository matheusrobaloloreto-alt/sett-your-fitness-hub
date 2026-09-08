-- Limpeza reversível da prescrição inteira de um ciclo atual/futuro.
--
-- Objetivo operacional:
-- - permitir que a equipe remova a prescrição de um ciclo para refazer do zero
--   ou deixar o ciclo intencionalmente vazio;
-- - preservar IDs, logs, sessões e histórico por snapshots auditáveis;
-- - impedir que bundles/plano de força/cardio ligados ao ciclo continuem
--   aparecendo como conteúdo vigente depois da limpeza.

do $cycle_prescription_clear_preflight$
declare
  required_column record;
begin
  if to_regclass('public.training_cycles') is null
    or to_regclass('public.workouts') is null
    or to_regclass('public.prescription_bundles') is null
    or to_regclass('public.prescription_bundle_items') is null
    or to_regclass('public.ai_strength_plans') is null
    or to_regclass('public.running_plans') is null then
    raise exception 'missing_dependency_cycle_prescription_tables_apply_prescription_schema_first'
      using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_cycles'
      and column_name = 'superseded_by_cycle_id'
  ) then
    raise exception 'missing_dependency_training_cycles_superseded_by_cycle_id_apply_20260828023000_first'
      using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workouts'
      and column_name = 'superseded_at'
  ) then
    raise exception 'missing_dependency_workouts_superseded_at_apply_20260903234059_first'
      using errcode = '42P01';
  end if;

  if to_regprocedure('public.archive_student_workout(uuid, uuid, uuid, text)') is null
    or to_regprocedure('public.restore_student_workout(uuid, uuid, uuid, text)') is null then
    raise exception 'missing_dependency_archive_student_workouts_apply_20260908120000_first'
      using errcode = '42883';
  end if;

  if to_regprocedure('public.can_manage_staff_student(uuid, uuid)') is null
    or to_regprocedure('public.can_read_staff_student(uuid, uuid)') is null
    or to_regprocedure('public.current_business_date()') is null then
    raise exception 'missing_dependency_staff_scope_helpers_apply_20260820113000_first'
      using errcode = '42883';
  end if;

  for required_column in
    select *
    from (
      values
        ('training_cycles', 'id'),
        ('training_cycles', 'company_id'),
        ('training_cycles', 'student_id'),
        ('training_cycles', 'status'),
        ('training_cycles', 'end_date'),
        ('training_cycles', 'prescribed_offline_at'),
        ('training_cycles', 'prescribed_offline_by'),
        ('training_cycles', 'prescribed_offline_note'),
        ('workouts', 'id'),
        ('workouts', 'cycle_id'),
        ('workouts', 'company_id'),
        ('workouts', 'exercises'),
        ('workouts', 'updated_at'),
        ('prescription_bundles', 'id'),
        ('prescription_bundles', 'company_id'),
        ('prescription_bundles', 'student_id'),
        ('prescription_bundles', 'training_cycle_id'),
        ('prescription_bundles', 'status'),
        ('prescription_bundles', 'modalities'),
        ('prescription_bundles', 'strength_plan_id'),
        ('prescription_bundles', 'running_plan_id'),
        ('prescription_bundles', 'nutrition_plan_id'),
        ('prescription_bundles', 'has_strength'),
        ('prescription_bundles', 'has_cardio'),
        ('prescription_bundles', 'has_swimming'),
        ('prescription_bundles', 'has_cycling'),
        ('prescription_bundles', 'has_nutrition'),
        ('prescription_bundles', 'generation_error'),
        ('prescription_bundles', 'notes'),
        ('prescription_bundles', 'updated_at'),
        ('prescription_bundle_items', 'id'),
        ('prescription_bundle_items', 'company_id'),
        ('prescription_bundle_items', 'student_id'),
        ('prescription_bundle_items', 'bundle_id'),
        ('prescription_bundle_items', 'entity_id'),
        ('ai_strength_plans', 'id'),
        ('ai_strength_plans', 'company_id'),
        ('ai_strength_plans', 'student_id'),
        ('ai_strength_plans', 'training_cycle_id'),
        ('ai_strength_plans', 'bundle_id'),
        ('ai_strength_plans', 'updated_at'),
        ('running_plans', 'id'),
        ('running_plans', 'company_id'),
        ('running_plans', 'student_id'),
        ('running_plans', 'training_cycle_id'),
        ('running_plans', 'bundle_id'),
        ('running_plans', 'weeks'),
        ('running_plans', 'status'),
        ('running_plans', 'sport'),
        ('running_plans', 'end_date'),
        ('running_plans', 'updated_at')
    ) as dependency(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = required_column.table_name
        and column_name = required_column.column_name
    ) then
      raise exception 'missing_dependency_cycle_prescription_column_%.%',
        required_column.table_name,
        required_column.column_name
        using errcode = '42703';
    end if;
  end loop;
end
$cycle_prescription_clear_preflight$;

create table if not exists public.cycle_prescription_clear_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  student_id uuid not null references public.students(id),
  cycle_id uuid not null references public.training_cycles(id),
  reason text,
  cycle_snapshot jsonb not null,
  workout_snapshot jsonb not null default '[]'::jsonb,
  bundle_snapshot jsonb not null default '[]'::jsonb,
  bundle_item_snapshot jsonb not null default '[]'::jsonb,
  strength_plan_snapshot jsonb not null default '[]'::jsonb,
  running_plan_snapshot jsonb not null default '[]'::jsonb,
  content_signature text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid,
  restored_reason text,
  check ((restored_at is null and restored_by is null) or (restored_at is not null and restored_by is not null))
);

alter table public.cycle_prescription_clear_events enable row level security;

revoke all on public.cycle_prescription_clear_events from public, anon;
grant select on public.cycle_prescription_clear_events to authenticated;
grant all on public.cycle_prescription_clear_events to service_role;

drop policy if exists "cycle prescription clear events tenant read"
  on public.cycle_prescription_clear_events;
create policy "cycle prescription clear events tenant read"
on public.cycle_prescription_clear_events
for select
to authenticated
using (
  public.can_read_staff_student(company_id, student_id)
);

create index if not exists cycle_prescription_clear_events_cycle_created_idx
  on public.cycle_prescription_clear_events (cycle_id, created_at desc);

create index if not exists cycle_prescription_clear_events_student_created_idx
  on public.cycle_prescription_clear_events (student_id, created_at desc);

alter table public.training_cycles
  add column if not exists prescription_cleared_at timestamptz,
  add column if not exists prescription_cleared_by uuid,
  add column if not exists prescription_cleared_reason text,
  add column if not exists prescription_cleared_event_id uuid,
  add column if not exists prescription_cleared_signature text;

do $cycle_clear_event_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_cycles_prescription_cleared_event_id_fkey'
      and conrelid = 'public.training_cycles'::regclass
  ) then
    alter table public.training_cycles
      add constraint training_cycles_prescription_cleared_event_id_fkey
      foreign key (prescription_cleared_event_id)
      references public.cycle_prescription_clear_events(id)
      on delete restrict;
  end if;
end
$cycle_clear_event_fk$;

create index if not exists training_cycles_prescription_cleared_idx
  on public.training_cycles (student_id, prescription_cleared_at desc)
  where prescription_cleared_at is not null;

create or replace function public.compute_cycle_prescription_content_signature(
  p_student_id uuid,
  p_cycle_id uuid,
  p_company_id uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(jsonb_build_object(
    'workouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', workout.id,
        'updated_at', workout.updated_at,
        'superseded_at', workout.superseded_at,
        'exercise_count', jsonb_array_length(coalesce(workout.exercises, '[]'::jsonb))
      ) order by workout.id)
      from public.workouts workout
      where workout.cycle_id = p_cycle_id
        and workout.superseded_at is null
    ), '[]'::jsonb),
    'bundles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bundle.id,
        'status', bundle.status,
        'updated_at', bundle.updated_at,
        'modalities', bundle.modalities,
        'strength_plan_id', bundle.strength_plan_id,
        'running_plan_id', bundle.running_plan_id,
        'nutrition_plan_id', bundle.nutrition_plan_id,
        'has_strength', bundle.has_strength,
        'has_cardio', bundle.has_cardio,
        'has_swimming', bundle.has_swimming,
        'has_cycling', bundle.has_cycling,
        'has_nutrition', bundle.has_nutrition
      ) order by bundle.id)
      from public.prescription_bundles bundle
      where bundle.training_cycle_id = p_cycle_id
        and bundle.company_id = p_company_id
        and bundle.student_id = p_student_id
        and coalesce(bundle.status, 'active') <> 'failed'
        and (
          coalesce(bundle.has_strength, false)
          or coalesce(bundle.has_cardio, false)
          or coalesce(bundle.has_swimming, false)
          or coalesce(bundle.has_cycling, false)
          or bundle.strength_plan_id is not null
          or bundle.running_plan_id is not null
          or coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[]
        )
    ), '[]'::jsonb),
    'strength', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', strength.id,
        'updated_at', strength.updated_at,
        'bundle_id', strength.bundle_id
      ) order by strength.id)
      from public.ai_strength_plans strength
      where strength.training_cycle_id = p_cycle_id
        and strength.company_id = p_company_id
        and strength.student_id = p_student_id
    ), '[]'::jsonb),
    'running', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', running.id,
        'updated_at', running.updated_at,
        'bundle_id', running.bundle_id,
        'status', running.status,
        'sport', running.sport,
        'end_date', running.end_date
      ) order by running.id)
      from public.running_plans running
      where running.training_cycle_id = p_cycle_id
        and running.company_id = p_company_id
        and running.student_id = p_student_id
    ), '[]'::jsonb)
  )::text);
$$;

revoke all on function public.compute_cycle_prescription_content_signature(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.compute_cycle_prescription_content_signature(uuid, uuid, uuid) to service_role;

create or replace function public.preview_student_cycle_prescription_archive(
  p_student_id uuid,
  p_cycle_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  cycle public.training_cycles%rowtype;
  active_workout_ids uuid[];
  active_content_signature text;
  active_workouts integer := 0;
  active_bundles integer := 0;
  active_strength integer := 0;
  active_running integer := 0;
  today date := public.current_business_date();
begin
  if actor is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into cycle
  from public.training_cycles
  where id = p_cycle_id;

  if not found or cycle.student_id = p_student_id is not true then
    raise exception 'cycle_not_found_for_student' using errcode = 'P0001';
  end if;

  if cycle.status = 'superseded' or cycle.superseded_by_cycle_id is not null then
    raise exception 'cycle_not_clearable' using errcode = 'P0001';
  end if;

  if cycle.end_date is null or cycle.end_date < today then
    raise exception 'only_current_or_future_cycles_can_be_cleared' using errcode = '22023';
  end if;

  if not public.can_manage_staff_student(cycle.company_id, p_student_id) then
    raise exception 'forbidden_cross_tenant_cycle_prescription_preview' using errcode = '42501';
  end if;

  select coalesce(array_agg(workout.id order by workout.id), '{}'::uuid[]), count(*)::integer
  into active_workout_ids, active_workouts
  from public.workouts workout
  where workout.cycle_id = p_cycle_id
    and workout.company_id = cycle.company_id
    and workout.superseded_at is null;

  select count(*)::integer
  into active_bundles
  from public.prescription_bundles bundle
  where bundle.training_cycle_id = p_cycle_id
    and bundle.company_id = cycle.company_id
    and bundle.student_id = p_student_id
    and coalesce(bundle.status, 'active') <> 'failed'
    and (
      coalesce(bundle.has_strength, false)
      or coalesce(bundle.has_cardio, false)
      or coalesce(bundle.has_swimming, false)
      or coalesce(bundle.has_cycling, false)
      or bundle.strength_plan_id is not null
      or bundle.running_plan_id is not null
      or coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[]
    );

  select count(*)::integer
  into active_strength
  from public.ai_strength_plans strength
  where strength.training_cycle_id = p_cycle_id
    and strength.company_id = cycle.company_id
    and strength.student_id = p_student_id;

  select count(*)::integer
  into active_running
  from public.running_plans running
  where running.training_cycle_id = p_cycle_id
    and running.company_id = cycle.company_id
    and running.student_id = p_student_id;

  active_content_signature := public.compute_cycle_prescription_content_signature(p_student_id, p_cycle_id, cycle.company_id);

  return jsonb_build_object(
    'ok', true,
    'action', 'preview_cycle_prescription_archive',
    'student_id', p_student_id,
    'cycle_id', p_cycle_id,
    'content_signature', active_content_signature,
    'active_workout_ids', active_workout_ids,
    'active_workouts', active_workouts,
    'active_bundles', active_bundles,
    'active_strength_plans', active_strength,
    'active_running_plans', active_running,
    'already_cleared', cycle.prescription_cleared_at is not null
  );
end;
$$;

create or replace function public.archive_student_cycle_prescription(
  p_student_id uuid,
  p_cycle_id uuid,
  p_expected_content_signature text,
  p_expected_workout_ids uuid[] default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  cycle public.training_cycles%rowtype;
  active_workout_ids uuid[];
  expected_workout_ids uuid[];
  active_content_signature text;
  clear_event_id uuid;
  workout_row public.workouts%rowtype;
  archived_workouts integer := 0;
  detached_bundles integer := 0;
  detached_strength integer := 0;
  detached_running integer := 0;
  today date := public.current_business_date();
begin
  if actor is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into cycle
  from public.training_cycles
  where id = p_cycle_id
  for update;

  if not found or cycle.student_id = p_student_id is not true then
    raise exception 'cycle_not_found_for_student' using errcode = 'P0001';
  end if;

  if cycle.status = 'superseded' or cycle.superseded_by_cycle_id is not null then
    raise exception 'cycle_not_clearable' using errcode = 'P0001';
  end if;

  if cycle.end_date is null or cycle.end_date < today then
    raise exception 'only_current_or_future_cycles_can_be_cleared' using errcode = '22023';
  end if;

  if not public.can_manage_staff_student(cycle.company_id, p_student_id) then
    raise exception 'forbidden_cross_tenant_cycle_prescription_archive' using errcode = '42501';
  end if;

  perform 1
  from public.workouts workout
  where workout.cycle_id = p_cycle_id
    and workout.company_id = cycle.company_id
    and workout.superseded_at is null
  for update;

  perform 1
  from public.prescription_bundles bundle
  where bundle.training_cycle_id = p_cycle_id
    and bundle.company_id = cycle.company_id
    and bundle.student_id = p_student_id
    and coalesce(bundle.status, 'active') <> 'failed'
    and (
      coalesce(bundle.has_strength, false)
      or coalesce(bundle.has_cardio, false)
      or coalesce(bundle.has_swimming, false)
      or coalesce(bundle.has_cycling, false)
      or bundle.strength_plan_id is not null
      or bundle.running_plan_id is not null
      or coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[]
    )
  for update;

  perform 1
  from public.ai_strength_plans strength
  where strength.training_cycle_id = p_cycle_id
    and strength.company_id = cycle.company_id
    and strength.student_id = p_student_id
  for update;

  perform 1
  from public.running_plans running
  where running.training_cycle_id = p_cycle_id
    and running.company_id = cycle.company_id
    and running.student_id = p_student_id
  for update;

  select coalesce(array_agg(workout.id order by workout.id), '{}'::uuid[])
  into active_workout_ids
  from public.workouts workout
  where workout.cycle_id = p_cycle_id
    and workout.company_id = cycle.company_id
    and workout.superseded_at is null;

  expected_workout_ids := (
    select coalesce(array_agg(id order by id), '{}'::uuid[])
    from unnest(coalesce(p_expected_workout_ids, active_workout_ids)) as id
  );

  if expected_workout_ids is distinct from active_workout_ids then
    raise exception 'cycle_prescription_changed_reload_before_clearing' using errcode = '40001';
  end if;

  active_content_signature := public.compute_cycle_prescription_content_signature(p_student_id, p_cycle_id, cycle.company_id);

  if nullif(trim(p_expected_content_signature), '') is null then
    raise exception 'cycle_prescription_signature_required' using errcode = '22023';
  end if;

  if nullif(trim(p_expected_content_signature), '') is distinct from active_content_signature then
    raise exception 'cycle_prescription_content_changed_reload_before_clearing' using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.cycle_prescription_clear_events event
    where event.cycle_id = p_cycle_id
      and event.restored_at is null
  ) then
    raise exception 'cycle_prescription_already_cleared' using errcode = 'P0001';
  end if;

  insert into public.cycle_prescription_clear_events (
    company_id,
    student_id,
    cycle_id,
    reason,
    cycle_snapshot,
    workout_snapshot,
    bundle_snapshot,
    bundle_item_snapshot,
    strength_plan_snapshot,
    running_plan_snapshot,
    content_signature,
    actor_id
  )
  values (
    cycle.company_id,
    p_student_id,
    p_cycle_id,
    nullif(trim(p_reason), ''),
    to_jsonb(cycle),
    coalesce((select jsonb_agg(to_jsonb(workout) order by workout.id)
      from public.workouts workout
      where workout.cycle_id = p_cycle_id
        and workout.company_id = cycle.company_id
        and workout.superseded_at is null), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(bundle) order by bundle.id)
      from public.prescription_bundles bundle
      where bundle.training_cycle_id = p_cycle_id
        and bundle.company_id = cycle.company_id
        and bundle.student_id = p_student_id
        and coalesce(bundle.status, 'active') <> 'failed'
        and (
          coalesce(bundle.has_strength, false)
          or coalesce(bundle.has_cardio, false)
          or coalesce(bundle.has_swimming, false)
          or coalesce(bundle.has_cycling, false)
          or bundle.strength_plan_id is not null
          or bundle.running_plan_id is not null
          or coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[]
        )), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(item) order by item.id)
      from public.prescription_bundle_items item
      where item.company_id = cycle.company_id
        and item.student_id = p_student_id
        and (
          item.entity_id = p_cycle_id
          or exists (
            select 1
            from public.prescription_bundles bundle
            where bundle.id = item.bundle_id
              and bundle.training_cycle_id = p_cycle_id
              and bundle.company_id = cycle.company_id
              and bundle.student_id = p_student_id
              and coalesce(bundle.status, 'active') <> 'failed'
              and (
                coalesce(bundle.has_strength, false)
                or coalesce(bundle.has_cardio, false)
                or coalesce(bundle.has_swimming, false)
                or coalesce(bundle.has_cycling, false)
                or bundle.strength_plan_id is not null
                or bundle.running_plan_id is not null
                or coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[]
              )
          )
        )), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(strength) order by strength.id)
      from public.ai_strength_plans strength
      where strength.training_cycle_id = p_cycle_id
        and strength.company_id = cycle.company_id
        and strength.student_id = p_student_id), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(running) order by running.id)
      from public.running_plans running
      where running.training_cycle_id = p_cycle_id
        and running.company_id = cycle.company_id
        and running.student_id = p_student_id), '[]'::jsonb),
    active_content_signature,
    actor
  )
  returning id into clear_event_id;

  for workout_row in
    select *
    from public.workouts workout
    where workout.cycle_id = p_cycle_id
      and workout.company_id = cycle.company_id
      and workout.superseded_at is null
    order by workout.id
    for update
  loop
    perform public.archive_student_workout(
      p_student_id,
      p_cycle_id,
      workout_row.id,
      concat_ws(
        ' · ',
        'cycle_prescription_clear',
        'clear_event_id=' || clear_event_id::text,
        nullif(trim(p_reason), '')
      )
    );
    archived_workouts := archived_workouts + 1;
  end loop;

  update public.prescription_bundles bundle
  set
    status = case
      when coalesce(bundle.has_nutrition, false)
        or bundle.nutrition_plan_id is not null
        or coalesce(bundle.modalities, '{}'::text[]) && array['nutricao']::text[]
      then bundle.status
      else 'superseded'
    end,
    training_cycle_id = null,
    strength_plan_id = null,
    running_plan_id = null,
    has_strength = false,
    has_cardio = false,
    has_swimming = false,
    has_cycling = false,
    modalities = case
      when bundle.modalities is null then null
      else array(
        select modality
        from unnest(bundle.modalities) as modality
        where modality = 'nutricao'
      )
    end,
    generation_error = null,
    notes = concat_ws(
      E'\n',
      nullif(bundle.notes, ''),
      'Superseded by manual cycle prescription clear event ' || clear_event_id::text
    ),
    updated_at = now()
  where bundle.training_cycle_id = p_cycle_id
    and bundle.company_id = cycle.company_id
    and bundle.student_id = p_student_id
    and coalesce(bundle.status, 'active') <> 'failed'
    and (
      coalesce(bundle.has_strength, false)
      or coalesce(bundle.has_cardio, false)
      or coalesce(bundle.has_swimming, false)
      or coalesce(bundle.has_cycling, false)
      or bundle.strength_plan_id is not null
      or bundle.running_plan_id is not null
      or coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[]
    );
  get diagnostics detached_bundles = row_count;

  update public.ai_strength_plans strength
  set
    training_cycle_id = null,
    bundle_id = null,
    updated_at = now()
  where strength.training_cycle_id = p_cycle_id
    and strength.company_id = cycle.company_id
    and strength.student_id = p_student_id;
  get diagnostics detached_strength = row_count;

  update public.running_plans running
  set
    training_cycle_id = null,
    bundle_id = null,
    status = 'superseded',
    end_date = least(coalesce(running.end_date, today), today - 1),
    updated_at = now()
  where running.training_cycle_id = p_cycle_id
    and running.company_id = cycle.company_id
    and running.student_id = p_student_id;
  get diagnostics detached_running = row_count;

  update public.training_cycles training_cycle
  set
    prescribed_offline_at = null,
    prescribed_offline_by = null,
    prescribed_offline_note = null,
    prescription_cleared_at = now(),
    prescription_cleared_by = actor,
    prescription_cleared_reason = nullif(trim(p_reason), ''),
    prescription_cleared_event_id = clear_event_id,
    prescription_cleared_signature = active_content_signature
  where training_cycle.id = p_cycle_id
    and training_cycle.student_id = p_student_id
    and training_cycle.company_id = cycle.company_id;
  if not found then
    raise exception 'cycle_prescription_clear_cycle_update_failed' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'archive_cycle_prescription',
    'student_id', p_student_id,
    'cycle_id', p_cycle_id,
    'clear_event_id', clear_event_id,
    'archived_workouts', archived_workouts,
    'detached_bundles', detached_bundles,
    'detached_strength_plans', detached_strength,
    'detached_running_plans', detached_running
  );
end;
$$;

create or replace function public.restore_student_cycle_prescription(
  p_student_id uuid,
  p_cycle_id uuid,
  p_clear_event_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  cycle public.training_cycles%rowtype;
  clear_event public.cycle_prescription_clear_events%rowtype;
  snapshot_item jsonb;
  restored_workouts integer := 0;
  restored_bundles integer := 0;
  restored_strength integer := 0;
  restored_running integer := 0;
begin
  if actor is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into cycle
  from public.training_cycles
  where id = p_cycle_id
  for update;

  if not found or cycle.student_id = p_student_id is not true then
    raise exception 'cycle_not_found_for_student' using errcode = 'P0001';
  end if;

  if not public.can_manage_staff_student(cycle.company_id, p_student_id) then
    raise exception 'forbidden_cross_tenant_cycle_prescription_restore' using errcode = '42501';
  end if;

  select * into clear_event
  from public.cycle_prescription_clear_events event
  where event.cycle_id = p_cycle_id
    and event.student_id = p_student_id
    and event.company_id = cycle.company_id
    and event.restored_at is null
    and (p_clear_event_id is null or event.id = p_clear_event_id)
  order by event.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'cycle_prescription_clear_event_not_found' using errcode = 'P0001';
  end if;

  if cycle.prescription_cleared_event_id is distinct from clear_event.id
    or cycle.prescription_cleared_at is null then
    raise exception 'cycle_prescription_clear_event_not_current_for_cycle' using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.workouts workout
    where workout.cycle_id = p_cycle_id
      and workout.company_id = cycle.company_id
      and workout.superseded_at is null
  )
  or exists (
    select 1
    from public.prescription_bundles bundle
    where bundle.training_cycle_id = p_cycle_id
      and bundle.company_id = cycle.company_id
      and bundle.student_id = p_student_id
      and coalesce(bundle.status, 'active') <> 'failed'
      and (
        coalesce(bundle.has_strength, false)
        or coalesce(bundle.has_cardio, false)
        or coalesce(bundle.has_swimming, false)
        or coalesce(bundle.has_cycling, false)
        or bundle.strength_plan_id is not null
        or bundle.running_plan_id is not null
        or coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[]
      )
  )
  or exists (
    select 1
    from public.ai_strength_plans strength
    where strength.training_cycle_id = p_cycle_id
      and strength.company_id = cycle.company_id
      and strength.student_id = p_student_id
  )
  or exists (
    select 1
    from public.running_plans running
    where running.training_cycle_id = p_cycle_id
      and running.company_id = cycle.company_id
      and running.student_id = p_student_id
  )
  then
    raise exception 'cycle_prescription_restore_conflict_new_content_exists' using errcode = '40001';
  end if;

  if clear_event.bundle_item_snapshot is distinct from coalesce((
    select jsonb_agg(to_jsonb(item) order by item.id)
    from public.prescription_bundle_items item
    where item.id in (
      select (snapshot.value->>'id')::uuid
      from jsonb_array_elements(clear_event.bundle_item_snapshot) snapshot(value)
    )
      and item.company_id = cycle.company_id
      and item.student_id = p_student_id
  ), '[]'::jsonb) then
    raise exception 'cycle_prescription_restore_conflict_bundle_items_changed' using errcode = '40001';
  end if;

  for snapshot_item in
    select value
    from jsonb_array_elements(clear_event.workout_snapshot)
  loop
    perform public.restore_student_workout(
      p_student_id,
      p_cycle_id,
      (snapshot_item->>'id')::uuid,
      concat_ws(
        ' · ',
        'cycle_prescription_restore',
        'clear_event_id=' || clear_event.id::text,
        nullif(trim(p_reason), '')
      )
    );
    restored_workouts := restored_workouts + 1;
  end loop;

  for snapshot_item in
    select value
    from jsonb_array_elements(clear_event.bundle_snapshot)
  loop
    update public.prescription_bundles bundle
    set
      training_cycle_id = nullif(snapshot_item->>'training_cycle_id', '')::uuid,
      status = snapshot_item->>'status',
      strength_plan_id = nullif(snapshot_item->>'strength_plan_id', '')::uuid,
      running_plan_id = nullif(snapshot_item->>'running_plan_id', '')::uuid,
      nutrition_plan_id = nullif(snapshot_item->>'nutrition_plan_id', '')::uuid,
      modalities = case
        when jsonb_typeof(snapshot_item->'modalities') = 'array'
          then array(select jsonb_array_elements_text(snapshot_item->'modalities'))
        else null
      end,
      has_strength = (snapshot_item->>'has_strength')::boolean,
      has_cardio = (snapshot_item->>'has_cardio')::boolean,
      has_swimming = (snapshot_item->>'has_swimming')::boolean,
      has_cycling = (snapshot_item->>'has_cycling')::boolean,
      has_nutrition = (snapshot_item->>'has_nutrition')::boolean,
      notes = snapshot_item->>'notes',
      generation_error = snapshot_item->>'generation_error',
      updated_at = now()
    where bundle.id = (snapshot_item->>'id')::uuid
      and bundle.company_id = cycle.company_id
      and bundle.student_id = p_student_id
      and bundle.training_cycle_id is null
      and bundle.strength_plan_id is null
      and bundle.running_plan_id is null
      and coalesce(bundle.has_strength, false) is false
      and coalesce(bundle.has_cardio, false) is false
      and coalesce(bundle.has_swimming, false) is false
      and coalesce(bundle.has_cycling, false) is false
      and not (coalesce(bundle.modalities, '{}'::text[]) && array['musculacao','corrida','natacao','ciclismo']::text[])
      and (
        coalesce(bundle.status, 'active') = 'superseded'
        or (
          coalesce((snapshot_item->>'has_nutrition')::boolean, false)
          and bundle.nutrition_plan_id is not distinct from nullif(snapshot_item->>'nutrition_plan_id', '')::uuid
          and coalesce(bundle.has_nutrition, false) is not distinct from coalesce((snapshot_item->>'has_nutrition')::boolean, false)
        )
      );
    if not found then
      raise exception 'cycle_prescription_restore_conflict_archived_bundle_changed' using errcode = '40001';
    end if;
    restored_bundles := restored_bundles + 1;
  end loop;

  for snapshot_item in
    select value
    from jsonb_array_elements(clear_event.strength_plan_snapshot)
  loop
    update public.ai_strength_plans strength
    set
      training_cycle_id = nullif(snapshot_item->>'training_cycle_id', '')::uuid,
      bundle_id = nullif(snapshot_item->>'bundle_id', '')::uuid,
      updated_at = now()
    where strength.id = (snapshot_item->>'id')::uuid
      and strength.company_id = cycle.company_id
      and strength.student_id = p_student_id
      and strength.training_cycle_id is null
      and strength.bundle_id is null;
    if not found then
      raise exception 'cycle_prescription_restore_conflict_archived_strength_changed' using errcode = '40001';
    end if;
    restored_strength := restored_strength + 1;
  end loop;

  for snapshot_item in
    select value
    from jsonb_array_elements(clear_event.running_plan_snapshot)
  loop
    update public.running_plans running
    set
      training_cycle_id = nullif(snapshot_item->>'training_cycle_id', '')::uuid,
      bundle_id = nullif(snapshot_item->>'bundle_id', '')::uuid,
      status = snapshot_item->>'status',
      end_date = (snapshot_item->>'end_date')::date,
      updated_at = now()
    where running.id = (snapshot_item->>'id')::uuid
      and running.company_id = cycle.company_id
      and running.student_id = p_student_id
      and running.training_cycle_id is null
      and running.bundle_id is null
      and coalesce(running.status, 'active') = 'superseded';
    if not found then
      raise exception 'cycle_prescription_restore_conflict_archived_running_changed' using errcode = '40001';
    end if;
    restored_running := restored_running + 1;
  end loop;

  update public.training_cycles training_cycle
  set
    prescribed_offline_at = (clear_event.cycle_snapshot->>'prescribed_offline_at')::timestamptz,
    prescribed_offline_by = nullif(clear_event.cycle_snapshot->>'prescribed_offline_by', '')::uuid,
    prescribed_offline_note = clear_event.cycle_snapshot->>'prescribed_offline_note',
    prescription_cleared_at = null,
    prescription_cleared_by = null,
    prescription_cleared_reason = null,
    prescription_cleared_event_id = null,
    prescription_cleared_signature = null
  where training_cycle.id = p_cycle_id
    and training_cycle.student_id = p_student_id
    and training_cycle.company_id = cycle.company_id;
  if not found then
    raise exception 'cycle_prescription_restore_cycle_update_failed' using errcode = '40001';
  end if;

  update public.cycle_prescription_clear_events event
  set
    restored_at = now(),
    restored_by = actor,
    restored_reason = nullif(trim(p_reason), '')
  where event.id = clear_event.id;
  if not found then
    raise exception 'cycle_prescription_restore_event_update_failed' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ok', true,
    'action', 'restore_cycle_prescription',
    'student_id', p_student_id,
    'cycle_id', p_cycle_id,
    'clear_event_id', clear_event.id,
    'restored_workouts', restored_workouts,
    'restored_bundles', restored_bundles,
    'restored_strength_plans', restored_strength,
    'restored_running_plans', restored_running
  );
end;
$$;

create or replace function public.reset_cycle_prescription_clear_marker_for_training_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cycle_id uuid;
  current_event_id uuid;
  current_actor_id uuid;
  cycle_company_id uuid;
  cycle_student_id uuid;
begin
  if tg_table_name = 'workouts' then
    target_cycle_id := new.cycle_id;
  else
    target_cycle_id := new.training_cycle_id;
  end if;

  if target_cycle_id is null then
    return new;
  end if;

  select
    training_cycle.company_id,
    training_cycle.student_id,
    training_cycle.prescription_cleared_event_id,
    training_cycle.prescription_cleared_by
  into cycle_company_id, cycle_student_id, current_event_id, current_actor_id
  from public.training_cycles training_cycle
  where training_cycle.id = target_cycle_id
  for update;

  if not found then
    raise exception 'cycle_prescription_clear_marker_cycle_not_found'
      using errcode = '23503';
  end if;

  if tg_table_name = 'workouts' then
    if cycle_company_id is distinct from new.company_id then
      raise exception 'cycle_prescription_clear_marker_workout_cycle_company_mismatch'
        using errcode = '42501';
    end if;
  else
    if cycle_company_id is distinct from new.company_id
      or cycle_student_id is distinct from new.student_id then
      raise exception 'cycle_prescription_clear_marker_running_cycle_scope_mismatch'
        using errcode = '42501';
    end if;
  end if;

  if current_event_id is null then
    return new;
  end if;

  update public.training_cycles training_cycle
  set
    prescription_cleared_at = null,
    prescription_cleared_by = null,
    prescription_cleared_reason = null,
    prescription_cleared_event_id = null,
    prescription_cleared_signature = null
  where training_cycle.id = target_cycle_id
    and training_cycle.prescription_cleared_event_id = current_event_id;

  update public.cycle_prescription_clear_events event
  set
    restored_at = coalesce(event.restored_at, now()),
    restored_by = coalesce(event.restored_by, auth.uid(), current_actor_id),
    restored_reason = coalesce(event.restored_reason, 'new_training_content_created')
  where event.id = current_event_id
    and event.restored_at is null;

  return new;
end;
$$;

revoke all on function public.reset_cycle_prescription_clear_marker_for_training_content()
from public, anon, authenticated;

drop trigger if exists workouts_reset_cycle_prescription_clear_marker on public.workouts;
create trigger workouts_reset_cycle_prescription_clear_marker
after insert or update of cycle_id, exercises
on public.workouts
for each row
when (
  new.superseded_at is null
  and case
    when jsonb_typeof(coalesce(new.exercises, '[]'::jsonb)) = 'array'
      then jsonb_array_length(coalesce(new.exercises, '[]'::jsonb))
    else 0
  end > 0
)
execute function public.reset_cycle_prescription_clear_marker_for_training_content();

drop trigger if exists running_reset_cycle_prescription_clear_marker on public.running_plans;
create trigger running_reset_cycle_prescription_clear_marker
after insert or update of training_cycle_id, status, weeks
on public.running_plans
for each row
when (
  new.training_cycle_id is not null
  and coalesce(new.status, 'active') in ('active', 'scheduled')
  and case
    when jsonb_typeof(coalesce(new.weeks, '[]'::jsonb)) = 'array'
      then jsonb_array_length(coalesce(new.weeks, '[]'::jsonb))
    else 0
  end > 0
)
execute function public.reset_cycle_prescription_clear_marker_for_training_content();

revoke all on function public.preview_student_cycle_prescription_archive(uuid, uuid) from public, anon;
grant execute on function public.preview_student_cycle_prescription_archive(uuid, uuid) to authenticated, service_role;
revoke all on function public.archive_student_cycle_prescription(uuid, uuid, text, uuid[], text) from public, anon;
revoke all on function public.restore_student_cycle_prescription(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.archive_student_cycle_prescription(uuid, uuid, text, uuid[], text) to authenticated, service_role;
grant execute on function public.restore_student_cycle_prescription(uuid, uuid, uuid, text) to authenticated, service_role;
