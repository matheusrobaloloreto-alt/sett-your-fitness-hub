-- Keep delayed workout-template delivery inside the purchased plan window.
-- The runtime operation is atomic and lock-protected. The deterministic repair
-- at the end keeps before/after images and never deletes a cycle or workout.

create table if not exists public.training_cycle_delivery_repair_audit (
  id uuid primary key default gen_random_uuid(),
  repair_key text not null unique,
  enrollment_id uuid not null,
  target_cycle_id uuid not null,
  superseded_cycle_id uuid not null,
  before_enrollment jsonb not null,
  before_cycles jsonb not null,
  before_workouts jsonb not null,
  before_dependencies jsonb not null,
  after_enrollment jsonb,
  after_cycles jsonb,
  after_workouts jsonb,
  after_dependencies jsonb,
  after_sha256 text,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);
alter table public.training_cycle_delivery_repair_audit
  add column if not exists before_dependencies jsonb,
  add column if not exists after_dependencies jsonb;

alter table public.training_cycle_delivery_repair_audit enable row level security;
revoke all on table public.training_cycle_delivery_repair_audit from public, anon, authenticated;
grant select, insert, update on table public.training_cycle_delivery_repair_audit to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.training_cycle_rebase_authorizations (
  transaction_id bigint not null,
  enrollment_id uuid not null,
  primary key (transaction_id, enrollment_id)
);
revoke all on table private.training_cycle_rebase_authorizations from public, anon, authenticated;

create or replace function private.snapshot_training_cycle_dependencies(p_cycle_ids uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'workout_sessions', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.workout_sessions row_value join public.workouts workout on workout.id = row_value.workout_id
      where workout.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'workout_logs', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.workout_logs row_value join public.workouts workout on workout.id = row_value.workout_id
      where workout.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'prescription_bundles', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.prescription_bundles row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'ai_strength_plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.ai_strength_plans row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'running_plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.running_plans row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'nutrition_plans', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.nutrition_plans row_value where row_value.training_cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'cycle_feedback', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.cycle_feedback row_value where row_value.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'ai_plan_versions', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.ai_plan_versions row_value where row_value.cycle_id = any(p_cycle_ids)), '[]'::jsonb),
    'prescription_bundle_items', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id)
      from public.prescription_bundle_items row_value
      where row_value.entity_type = 'training_cycle' and row_value.entity_id = any(p_cycle_ids)), '[]'::jsonb)
  );
$function$;
revoke all on function private.snapshot_training_cycle_dependencies(uuid[]) from public, anon, authenticated;

-- A first production execution of the deterministic repair was recorded by an
-- older audit shape. Backfill the dependency snapshots only when every current
-- dependency predates that audit and no workout has been used since. The
-- repair itself never changes dependency tables, so the same locked snapshot
-- is the valid before/after image in this compatibility path.
do $backfill_existing_audit$
declare
  v_audit public.training_cycle_delivery_repair_audit%rowtype;
  v_current_enrollment jsonb;
  v_current_cycles jsonb;
  v_current_workouts jsonb;
  v_current_dependencies jsonb;
  v_post_apply_dependencies integer;
  v_workout_usage integer;
begin
  select audit.* into v_audit
  from public.training_cycle_delivery_repair_audit audit
  where audit.repair_key = 'delayed_template_delivery_fdbc3a0af2a5_20260903'
    and audit.state = 'applied'
    and (audit.before_dependencies is null or audit.after_dependencies is null)
  for update;
  if v_audit.id is null then return; end if;

  perform enrollment.id from public.enrollments enrollment
  where enrollment.id = v_audit.enrollment_id for update;
  perform cycle.id from public.training_cycles cycle
  where cycle.id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
  order by cycle.id for update;
  perform workout.id from public.workouts workout
  where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
  order by workout.id for update;
  lock table public.workout_sessions, public.workout_logs, public.prescription_bundles,
    public.ai_strength_plans, public.running_plans, public.nutrition_plans,
    public.cycle_feedback, public.ai_plan_versions, public.prescription_bundle_items
    in share row exclusive mode;

  select to_jsonb(enrollment) - 'updated_at' into v_current_enrollment
  from public.enrollments enrollment where enrollment.id = v_audit.enrollment_id;
  select jsonb_agg(to_jsonb(cycle) order by cycle.cycle_number, cycle.created_at)
  into v_current_cycles from public.training_cycles cycle
  where cycle.id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  select jsonb_agg(to_jsonb(workout) - 'updated_at' order by workout.sort_order, workout.id)
  into v_current_workouts from public.workouts workout
  where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id);
  v_current_dependencies := private.snapshot_training_cycle_dependencies(
    array[v_audit.target_cycle_id, v_audit.superseded_cycle_id]
  );

  select
    (select count(*) from public.workout_sessions session join public.workouts workout
      on workout.id = session.workout_id
      where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id))
    + (select count(*) from public.workout_logs log join public.workouts workout
      on workout.id = log.workout_id
      where workout.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id))
  into v_workout_usage;
  select
    (select count(*) from public.prescription_bundles row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.ai_strength_plans row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.running_plans row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.nutrition_plans row_value
      where row_value.training_cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.cycle_feedback row_value
      where row_value.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.ai_plan_versions row_value
      where row_value.cycle_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
    + (select count(*) from public.prescription_bundle_items row_value
      where row_value.entity_type = 'training_cycle'
        and row_value.entity_id in (v_audit.target_cycle_id, v_audit.superseded_cycle_id)
        and row_value.created_at > v_audit.applied_at)
  into v_post_apply_dependencies;

  if v_current_enrollment is distinct from v_audit.after_enrollment
    or v_current_cycles is distinct from v_audit.after_cycles
    or v_current_workouts is distinct from v_audit.after_workouts
    or v_workout_usage <> 0
    or v_post_apply_dependencies <> 0 then
    raise exception 'delayed_template_delivery_dependency_backfill_blocked';
  end if;

  update public.training_cycle_delivery_repair_audit audit
  set before_dependencies = v_current_dependencies,
    after_dependencies = v_current_dependencies,
    after_sha256 = encode(extensions.digest(
      concat_ws('|', v_current_enrollment::text, v_current_cycles::text,
        v_current_workouts::text, v_current_dependencies::text), 'sha256'), 'hex')
  where audit.id = v_audit.id
    and audit.state = 'applied'
    and (audit.before_dependencies is null or audit.after_dependencies is null);
  if not found then raise exception 'delayed_template_delivery_dependency_backfill_compare_and_swap_failed'; end if;
end
$backfill_existing_audit$;

-- Date edits normally rebuild only empty placeholders. A secured transaction
-- that already locked and rebased the schedule may bypass that rebuild locally.
create or replace function public.generate_training_cycles()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_start date; v_end date; v_cycle_days integer := 42; v_plan_days integer := 42;
  v_cycle_number integer := 1; v_cycle_start date; v_cycle_end date; v_existing_cycle_id uuid;
begin
  if exists (
    select 1 from private.training_cycle_rebase_authorizations authz
    where authz.transaction_id = txid_current()
      and authz.enrollment_id = new.id
  ) then return new; end if;
  if new.training_start_date is null then return new; end if;
  if tg_op = 'UPDATE' and old.training_start_date is not distinct from new.training_start_date then return new; end if;

  perform cycle.id from public.training_cycles cycle
  where cycle.enrollment_id = new.id and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null order by cycle.id for update;

  if tg_op = 'UPDATE' and exists (
    select 1 from public.training_cycles cycle
    where cycle.enrollment_id = new.id and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null and (
        cycle.prescribed_offline_at is not null or cycle.prescribed_offline_by is not null
        or nullif(btrim(coalesce(cycle.prescribed_offline_note, '')), '') is not null
        or cycle.anamnese_id is not null or cycle.bundle_id is not null
        or nullif(btrim(coalesce(cycle.objective, '')), '') is not null
        or nullif(btrim(coalesce(cycle.notes, '')), '') is not null
        or case when jsonb_typeof(coalesce(cycle.workouts, '[]'::jsonb)) = 'array'
          then jsonb_array_length(coalesce(cycle.workouts, '[]'::jsonb)) > 0
          else coalesce(cycle.workouts, 'null'::jsonb) <> 'null'::jsonb end
        or lower(coalesce(cycle.delivery_status, '')) in ('sent', 'viewed', 'delivered', 'published')
        or exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id)
        or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
        or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
        or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
        or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
        or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
        or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
      )
  ) then raise exception using errcode = '23514',
      message = 'A data inicial não pode ser alterada porque a matrícula possui prescrição ou histórico.';
  end if;

  if tg_op = 'UPDATE' then
    update public.training_cycles cycle set status = 'pending'
    where cycle.enrollment_id = new.id and cycle.status = 'active' and cycle.superseded_by_cycle_id is null;
  end if;
  select coalesce(plan.cycle_duration_days, 42), coalesce(plan.duration_days, plan.duration_weeks * 7, 42)
  into v_cycle_days, v_plan_days from public.plans plan where plan.id = new.plan_id;
  v_cycle_days := greatest(coalesce(v_cycle_days, 42), 1);
  v_plan_days := greatest(coalesce(v_plan_days, 42), 1);
  v_start := new.training_start_date;
  v_end := least(coalesce(new.end_date, v_start + v_plan_days - 1), v_start + v_plan_days - 1);
  if v_end < v_start then v_end := v_start + v_plan_days - 1; end if;

  v_cycle_start := v_start;
  while v_cycle_start <= v_end loop
    v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_end);
    select cycle.id into v_existing_cycle_id from public.training_cycles cycle
    where cycle.enrollment_id = new.id and cycle.cycle_number = v_cycle_number
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null for update;
    if v_existing_cycle_id is null then
      insert into public.training_cycles (
        enrollment_id, student_id, company_id, cycle_number, start_date, end_date, duration_weeks, status, name
      ) values (
        new.id, new.student_id, new.company_id, v_cycle_number, v_cycle_start, v_cycle_end,
        greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
        case when v_cycle_end < public.current_business_date() then 'completed'
          when public.current_business_date() between v_cycle_start and v_cycle_end then 'active' else 'pending' end,
        format('Ciclo %s', v_cycle_number)
      );
    else
      update public.training_cycles cycle set student_id = new.student_id, company_id = new.company_id,
        start_date = v_cycle_start, end_date = v_cycle_end,
        duration_weeks = greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
        status = case when v_cycle_end < public.current_business_date() then 'completed'
          when public.current_business_date() between v_cycle_start and v_cycle_end then 'active' else 'pending' end,
        name = coalesce(cycle.name, format('Ciclo %s', v_cycle_number))
      where cycle.id = v_existing_cycle_id;
    end if;
    v_cycle_number := v_cycle_number + 1; v_cycle_start := v_cycle_end + 1; v_existing_cycle_id := null;
  end loop;
  update public.training_cycles cycle set status = 'superseded', superseded_by_cycle_id = null,
    superseded_at = now(), superseded_by = null, superseded_previous_status = cycle.status,
    superseded_reason = 'empty_schedule_replaced_by_date_change'
  where cycle.enrollment_id = new.id and cycle.cycle_number >= v_cycle_number
    and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
  return new;
end;
$function$;

revoke execute on function public.generate_training_cycles() from public, anon, authenticated;
grant execute on function public.generate_training_cycles() to service_role;

create or replace function public.apply_workout_template_to_current_cycle(
  p_template_id uuid, p_student_id uuid, p_company_id uuid,
  p_duration_weeks integer default 6, p_created_by uuid default null
)
returns table(enrollment_id uuid, cycle_id uuid, workouts_created integer)
language plpgsql security definer set search_path = public
as $function$
declare
  v_actor uuid := auth.uid(); v_enrollment public.enrollments%rowtype;
  v_target public.training_cycles%rowtype; v_today date := public.current_business_date();
  v_template_workouts jsonb; v_current_count integer; v_shift_days integer;
  v_inserted integer; v_is_first boolean;
begin
  if p_template_id is null or p_student_id is null or p_company_id is null then
    raise exception using errcode = '22004', message = 'template_cycle_required_identifiers';
  end if;
  if p_duration_weeks is null or p_duration_weeks < 1 or p_duration_weeks > 52 then
    raise exception using errcode = '22023', message = 'template_cycle_invalid_duration';
  end if;
  if p_created_by is not null and coalesce(auth.jwt()->>'role', '') <> 'service_role'
    and p_created_by is distinct from v_actor then
    raise exception using errcode = '42501', message = 'template_cycle_actor_mismatch';
  end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
    and not public.can_manage_staff_student(p_company_id, p_student_id) then
    raise exception using errcode = '42501', message = 'template_cycle_forbidden';
  end if;
  if not exists (select 1 from public.students student
    where student.id = p_student_id and student.company_id = p_company_id) then
    raise exception using errcode = 'P0002', message = 'template_cycle_student_not_found';
  end if;
  select template.workouts into v_template_workouts from public.workout_templates template
  where template.id = p_template_id and (template.company_id = p_company_id or template.company_id is null);
  if v_template_workouts is null then
    raise exception using errcode = 'P0002', message = 'template_cycle_template_not_found';
  end if;
  if jsonb_typeof(v_template_workouts) <> 'array' or jsonb_array_length(v_template_workouts) < 1
    or jsonb_array_length(v_template_workouts) > 20 or octet_length(v_template_workouts::text) > 5242880 then
    raise exception using errcode = '22023', message = 'template_cycle_invalid_workouts';
  end if;
  if exists (select 1 from jsonb_array_elements(v_template_workouts) item
    where jsonb_typeof(coalesce(item->'exercises', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(item->'exercises', '[]'::jsonb)) > 200) then
    raise exception using errcode = '22023', message = 'template_cycle_invalid_exercises';
  end if;

  select enrollment.* into v_enrollment from public.enrollments enrollment
  where enrollment.student_id = p_student_id and enrollment.company_id = p_company_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by case enrollment.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    enrollment.end_date desc nulls last, enrollment.created_at desc limit 1 for update;
  if v_enrollment.id is null then raise exception using errcode = 'P0002', message = 'template_cycle_enrollment_not_found'; end if;

  perform cycle.id from public.training_cycles cycle where cycle.enrollment_id = v_enrollment.id
  order by cycle.id for update;
  if exists (
    select 1 from public.training_cycles left_cycle join public.training_cycles right_cycle
      on right_cycle.enrollment_id = left_cycle.enrollment_id and right_cycle.id > left_cycle.id
      and right_cycle.status <> 'superseded' and right_cycle.superseded_by_cycle_id is null
      and left_cycle.start_date <= right_cycle.end_date and right_cycle.start_date <= left_cycle.end_date
    where left_cycle.enrollment_id = v_enrollment.id and left_cycle.status <> 'superseded'
      and left_cycle.superseded_by_cycle_id is null
  ) then raise exception using errcode = '23514', message = 'template_cycle_overlap_ambiguous'; end if;

  select count(*)::integer into v_current_count from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null and v_today between cycle.start_date and cycle.end_date;
  if v_current_count = 0 then raise exception using errcode = 'P0002', message = 'template_cycle_no_current';
  elsif v_current_count <> 1 then raise exception using errcode = '23514', message = 'template_cycle_overlap_ambiguous'; end if;
  select cycle.* into v_target from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null and v_today between cycle.start_date and cycle.end_date
  order by cycle.cycle_number, cycle.created_at limit 1;
  if exists (select 1 from public.workouts workout where workout.cycle_id = v_target.id) then
    raise exception using errcode = '23514', message = 'template_cycle_already_has_workouts';
  end if;
  if v_target.end_date - v_target.start_date + 1 <> p_duration_weeks * 7 then
    raise exception using errcode = '23514', message = 'template_cycle_duration_mismatch';
  end if;

  v_shift_days := greatest(v_today - v_target.start_date, 0);
  select not exists (select 1 from public.training_cycles prior_cycle
    where prior_cycle.enrollment_id = v_enrollment.id and prior_cycle.status <> 'superseded'
      and prior_cycle.superseded_by_cycle_id is null and (prior_cycle.start_date < v_target.start_date
        or (prior_cycle.start_date = v_target.start_date and prior_cycle.cycle_number < v_target.cycle_number)))
  into v_is_first;
  if v_shift_days <> 0 then
    update public.training_cycles cycle set status = 'pending'
    where cycle.enrollment_id = v_enrollment.id and cycle.status = 'active'
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
    update public.training_cycles cycle set start_date = cycle.start_date + v_shift_days,
      end_date = cycle.end_date + v_shift_days,
      status = case when cycle.end_date + v_shift_days < v_today then 'completed'
        when v_today between cycle.start_date + v_shift_days and cycle.end_date + v_shift_days then 'active' else 'pending' end
    where cycle.enrollment_id = v_enrollment.id and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null and (cycle.start_date > v_target.start_date
        or (cycle.start_date = v_target.start_date and cycle.cycle_number >= v_target.cycle_number));
    insert into private.training_cycle_rebase_authorizations (transaction_id, enrollment_id)
    values (txid_current(), v_enrollment.id);
    update public.enrollments enrollment
    set training_start_date = case when v_is_first then v_today else enrollment.training_start_date end,
      end_date = enrollment.end_date + v_shift_days, updated_at = now()
    where enrollment.id = v_enrollment.id;
    delete from private.training_cycle_rebase_authorizations authz
    where authz.transaction_id = txid_current() and authz.enrollment_id = v_enrollment.id;
  end if;

  insert into public.workouts (cycle_id, company_id, name, title, description, notes, sort_order, exercises, created_by)
  select v_target.id, p_company_id,
    coalesce(nullif(btrim(item.value->>'title'), ''), format('Treino %s', item.ordinality)),
    coalesce(nullif(btrim(item.value->>'title'), ''), format('Treino %s', item.ordinality)),
    nullif(btrim(item.value->>'description'), ''), nullif(btrim(item.value->>'description'), ''),
    item.ordinality - 1, coalesce(item.value->'exercises', '[]'::jsonb), coalesce(v_actor, p_created_by)
  from jsonb_array_elements(v_template_workouts) with ordinality as item(value, ordinality);
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(v_template_workouts) then
    raise exception using errcode = '23514', message = 'template_cycle_insert_count_mismatch';
  end if;
  return query select v_enrollment.id, v_target.id, v_inserted;
end;
$function$;

revoke all on function public.apply_workout_template_to_current_cycle(uuid, uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.apply_workout_template_to_current_cycle(uuid, uuid, uuid, integer, uuid) to authenticated, service_role;
comment on function public.apply_workout_template_to_current_cycle(uuid, uuid, uuid, integer, uuid) is
  'Atomically materializes a workout template in the single current plan cycle and shifts an unused delayed cycle window without creating overlaps.';

create or replace function public.reschedule_training_cycles_from(p_enrollment_id uuid, p_cycle_id uuid, p_new_start_date date)
returns void language plpgsql security definer set search_path = public
as $function$
declare
  v_company_id uuid; v_student_id uuid; v_cycle_number integer; v_current_start date; v_previous_end date;
  v_shift_days integer; v_is_first boolean;
begin
  if p_new_start_date is null then raise exception 'Informe a nova data de inicio'; end if;
  select enrollment.company_id, enrollment.student_id into v_company_id, v_student_id from public.enrollments enrollment
  where enrollment.id = p_enrollment_id for update;
  if v_company_id is null then raise exception 'Matricula nao encontrada'; end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role'
    and not public.can_manage_staff_student(v_company_id, v_student_id) then
    raise exception 'Sem permissao para reagendar os ciclos desta matricula';
  end if;
  perform cycle.id from public.training_cycles cycle where cycle.enrollment_id = p_enrollment_id
  order by cycle.id for update;
  if exists (
    select 1 from public.training_cycles left_cycle join public.training_cycles right_cycle
      on right_cycle.enrollment_id = left_cycle.enrollment_id and right_cycle.id > left_cycle.id
      and right_cycle.status <> 'superseded' and right_cycle.superseded_by_cycle_id is null
      and left_cycle.start_date <= right_cycle.end_date and right_cycle.start_date <= left_cycle.end_date
    where left_cycle.enrollment_id = p_enrollment_id and left_cycle.status <> 'superseded'
      and left_cycle.superseded_by_cycle_id is null
  ) then raise exception 'Existem ciclos sobrepostos. Corrija a duplicidade antes de reagendar.'; end if;
  select cycle.cycle_number, cycle.start_date into v_cycle_number, v_current_start
  from public.training_cycles cycle where cycle.id = p_cycle_id and cycle.enrollment_id = p_enrollment_id
    and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
  if v_cycle_number is null or v_current_start is null then raise exception 'Ciclo nao encontrado nesta matricula'; end if;
  select cycle.end_date into v_previous_end from public.training_cycles cycle
  where cycle.enrollment_id = p_enrollment_id and cycle.cycle_number < v_cycle_number
    and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null
  order by cycle.cycle_number desc limit 1;
  if v_previous_end is not null and p_new_start_date <= v_previous_end then
    raise exception 'A nova data deve ser posterior ao termino do ciclo anterior (%)', to_char(v_previous_end, 'DD/MM/YYYY');
  end if;
  if exists (
    select 1 from public.training_cycles cycle join public.workouts workout on workout.cycle_id = cycle.id
    where cycle.enrollment_id = p_enrollment_id and cycle.cycle_number >= v_cycle_number
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null
      and (exists (select 1 from public.workout_sessions session where session.workout_id = workout.id)
        or exists (select 1 from public.workout_logs log where log.workout_id = workout.id))
  ) then raise exception 'A data não pode ser alterada porque já existem treinos realizados neste ciclo.'; end if;
  v_shift_days := p_new_start_date - v_current_start;
  select not exists (select 1 from public.training_cycles cycle
    where cycle.enrollment_id = p_enrollment_id and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null and cycle.cycle_number < v_cycle_number) into v_is_first;
  if v_shift_days <> 0 then
    update public.training_cycles cycle set status = 'pending'
    where cycle.enrollment_id = p_enrollment_id and cycle.status = 'active'
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
    update public.training_cycles cycle set start_date = cycle.start_date + v_shift_days,
      end_date = cycle.end_date + v_shift_days,
      status = case when cycle.end_date + v_shift_days < public.current_business_date() then 'completed'
        when public.current_business_date() between cycle.start_date + v_shift_days and cycle.end_date + v_shift_days then 'active' else 'pending' end
    where cycle.enrollment_id = p_enrollment_id and cycle.cycle_number >= v_cycle_number
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
    insert into private.training_cycle_rebase_authorizations (transaction_id, enrollment_id)
    values (txid_current(), p_enrollment_id);
    update public.enrollments enrollment
    set training_start_date = case when v_is_first then p_new_start_date else enrollment.training_start_date end,
      end_date = enrollment.end_date + v_shift_days, updated_at = now()
    where enrollment.id = p_enrollment_id;
    delete from private.training_cycle_rebase_authorizations authz
    where authz.transaction_id = txid_current() and authz.enrollment_id = p_enrollment_id;
  end if;
end;
$function$;

revoke all on function public.reschedule_training_cycles_from(uuid, uuid, date) from public, anon;
grant execute on function public.reschedule_training_cycles_from(uuid, uuid, date) to authenticated, service_role;
comment on function public.reschedule_training_cycles_from(uuid, uuid, date) is
  'Moves the selected visible cycle and following cycles while shifting the enrollment end date by the same amount.';

do $repair$
declare
  v_enrollment_id uuid; v_target_cycle_id uuid; v_source_cycle_id uuid;
  v_before_enrollment jsonb; v_before_cycles jsonb; v_before_workouts jsonb;
  v_before_dependencies jsonb; v_after_enrollment jsonb; v_after_cycles jsonb;
  v_after_workouts jsonb; v_after_dependencies jsonb;
  v_workouts integer; v_dependencies integer; v_applied integer;
begin
  if exists (select 1 from public.training_cycle_delivery_repair_audit
    where repair_key = 'delayed_template_delivery_fdbc3a0af2a5_20260903') then return; end if;
  select enrollment.id into v_enrollment_id from public.enrollments enrollment
  join public.plans plan on plan.id = enrollment.plan_id
  where substr(md5(enrollment.id::text), 1, 12) = 'fdbc3a0af2a5'
    and enrollment.start_date = date '2026-08-26' and enrollment.end_date = date '2026-10-06'
    and enrollment.training_start_date = date '2026-08-26'
    and greatest(coalesce(plan.duration_days, plan.duration_weeks * 7, 0), 0) = 42
  for update of enrollment;
  if v_enrollment_id is null then raise exception 'delayed_template_delivery_manifest_enrollment_mismatch'; end if;
  perform cycle.id from public.training_cycles cycle where cycle.enrollment_id = v_enrollment_id
  order by cycle.id for update;
  select cycle.id into v_target_cycle_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment_id and cycle.cycle_number = 1
    and cycle.start_date = date '2026-08-26' and cycle.end_date = date '2026-10-06'
    and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
  select cycle.id into v_source_cycle_id from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment_id and cycle.cycle_number = 2
    and cycle.start_date = date '2026-09-03' and cycle.end_date = date '2026-10-14'
    and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null;
  if v_target_cycle_id is null or v_source_cycle_id is null then
    raise exception 'delayed_template_delivery_manifest_cycle_mismatch';
  end if;
  perform workout.id from public.workouts workout
  where workout.cycle_id in (v_target_cycle_id, v_source_cycle_id)
  order by workout.id for update;
  lock table public.workout_sessions, public.workout_logs, public.prescription_bundles,
    public.ai_strength_plans, public.running_plans, public.nutrition_plans,
    public.cycle_feedback, public.ai_plan_versions, public.prescription_bundle_items
    in share row exclusive mode;
  select count(*)::integer into v_workouts from public.workouts workout where workout.cycle_id = v_source_cycle_id;
  select
    (select count(*) from public.workouts workout where workout.cycle_id = v_target_cycle_id)
    + (select count(*) from public.workout_sessions session join public.workouts workout on workout.id = session.workout_id where workout.cycle_id in (v_target_cycle_id, v_source_cycle_id))
    + (select count(*) from public.workout_logs log join public.workouts workout on workout.id = log.workout_id where workout.cycle_id in (v_target_cycle_id, v_source_cycle_id))
    + (select count(*) from public.prescription_bundles bundle where bundle.training_cycle_id = v_source_cycle_id)
    + (select count(*) from public.ai_strength_plans strength where strength.training_cycle_id = v_source_cycle_id)
    + (select count(*) from public.running_plans running where running.training_cycle_id = v_source_cycle_id)
    + (select count(*) from public.nutrition_plans nutrition where nutrition.training_cycle_id = v_source_cycle_id)
    + (select count(*) from public.cycle_feedback feedback where feedback.cycle_id = v_source_cycle_id)
    + (select count(*) from public.ai_plan_versions version where version.cycle_id = v_source_cycle_id)
    + (select count(*) from public.prescription_bundle_items item where item.entity_type = 'training_cycle' and item.entity_id = v_source_cycle_id)
  into v_dependencies;
  if v_workouts <> 4 or v_dependencies <> 0 then
    raise exception 'delayed_template_delivery_manifest_usage_mismatch workouts=% dependencies=%', v_workouts, v_dependencies;
  end if;
  select to_jsonb(enrollment) - 'updated_at' into v_before_enrollment
  from public.enrollments enrollment where enrollment.id = v_enrollment_id;
  select jsonb_agg(to_jsonb(cycle) order by cycle.cycle_number, cycle.created_at) into v_before_cycles
  from public.training_cycles cycle where cycle.id in (v_target_cycle_id, v_source_cycle_id);
  select jsonb_agg(to_jsonb(workout) - 'updated_at' order by workout.sort_order, workout.id) into v_before_workouts
  from public.workouts workout where workout.cycle_id = v_source_cycle_id;
  v_before_dependencies := private.snapshot_training_cycle_dependencies(array[v_target_cycle_id, v_source_cycle_id]);
  insert into public.training_cycle_delivery_repair_audit (
    repair_key, enrollment_id, target_cycle_id, superseded_cycle_id,
    before_enrollment, before_cycles, before_workouts, before_dependencies
  ) values ('delayed_template_delivery_fdbc3a0af2a5_20260903', v_enrollment_id,
    v_target_cycle_id, v_source_cycle_id, v_before_enrollment, v_before_cycles,
    v_before_workouts, v_before_dependencies);
  update public.training_cycles source_cycle set status = 'superseded',
    superseded_by_cycle_id = v_target_cycle_id, superseded_at = now(), superseded_by = null,
    superseded_previous_status = source_cycle.status,
    superseded_reason = 'template_delivery_merged_into_existing_plan_cycle'
  where source_cycle.id = v_source_cycle_id;
  update public.workouts workout set cycle_id = v_target_cycle_id where workout.cycle_id = v_source_cycle_id;
  get diagnostics v_applied = row_count;
  if v_applied <> 4 then raise exception 'delayed_template_delivery_workout_move_count_mismatch expected=4 actual=%', v_applied; end if;
  update public.training_cycles target_cycle set start_date = date '2026-09-03',
    end_date = date '2026-10-14', duration_weeks = 6, status = 'active'
  where target_cycle.id = v_target_cycle_id;
  insert into private.training_cycle_rebase_authorizations (transaction_id, enrollment_id)
  values (txid_current(), v_enrollment_id);
  update public.enrollments enrollment set training_start_date = date '2026-09-03',
    end_date = date '2026-10-14', updated_at = now() where enrollment.id = v_enrollment_id;
  delete from private.training_cycle_rebase_authorizations authz
  where authz.transaction_id = txid_current() and authz.enrollment_id = v_enrollment_id;
  if (select count(*) from public.training_cycles cycle where cycle.enrollment_id = v_enrollment_id
      and cycle.status <> 'superseded' and cycle.superseded_by_cycle_id is null) <> 1
    or (select count(*) from public.workouts workout where workout.cycle_id = v_target_cycle_id) <> 4
    or exists (select 1 from public.workouts workout where workout.cycle_id = v_source_cycle_id)
    or not exists (select 1 from public.enrollments enrollment where enrollment.id = v_enrollment_id
      and enrollment.training_start_date = date '2026-09-03' and enrollment.end_date = date '2026-10-14') then
    raise exception 'delayed_template_delivery_post_apply_failed';
  end if;
  select to_jsonb(enrollment) - 'updated_at' into v_after_enrollment
  from public.enrollments enrollment where enrollment.id = v_enrollment_id;
  select jsonb_agg(to_jsonb(cycle) order by cycle.cycle_number, cycle.created_at) into v_after_cycles
  from public.training_cycles cycle where cycle.id in (v_target_cycle_id, v_source_cycle_id);
  select jsonb_agg(to_jsonb(workout) - 'updated_at' order by workout.sort_order, workout.id) into v_after_workouts
  from public.workouts workout
  where workout.cycle_id in (v_target_cycle_id, v_source_cycle_id);
  v_after_dependencies := private.snapshot_training_cycle_dependencies(array[v_target_cycle_id, v_source_cycle_id]);
  update public.training_cycle_delivery_repair_audit audit
  set after_enrollment = v_after_enrollment, after_cycles = v_after_cycles,
    after_workouts = v_after_workouts, after_dependencies = v_after_dependencies,
    after_sha256 = encode(extensions.digest(
      concat_ws('|', v_after_enrollment::text, v_after_cycles::text,
        v_after_workouts::text, v_after_dependencies::text), 'sha256'), 'hex')
  where audit.repair_key = 'delayed_template_delivery_fdbc3a0af2a5_20260903';
end
$repair$;
