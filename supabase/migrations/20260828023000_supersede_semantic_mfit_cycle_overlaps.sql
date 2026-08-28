-- Preserve, but remove from active scheduling, the three legacy MFIT cycles
-- that overlap a newer integrated Studio prescription. Unlike the previous
-- lossless consolidation, both prescriptions contain real content, so this
-- migration never moves or deletes workouts. The MFIT row becomes a reversible
-- superseded record and the integrated cycle remains canonical.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(hashtextextended('sett:mfit-semantic-supersession:v1', 0));

alter table public.training_cycles
  add column if not exists superseded_by_cycle_id uuid,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid,
  add column if not exists superseded_previous_status text,
  add column if not exists superseded_reason text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.training_cycles'::regclass
      and conname = 'training_cycles_superseded_by_cycle_id_fkey'
  ) then
    alter table public.training_cycles
      add constraint training_cycles_superseded_by_cycle_id_fkey
      foreign key (superseded_by_cycle_id)
      references public.training_cycles(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.training_cycles'::regclass
      and conname = 'training_cycles_not_self_superseded_check'
  ) then
    alter table public.training_cycles
      add constraint training_cycles_not_self_superseded_check
      check (superseded_by_cycle_id is null or superseded_by_cycle_id <> id);
  end if;
end
$constraints$;

create index if not exists idx_training_cycles_superseded_by
  on public.training_cycles (superseded_by_cycle_id)
  where superseded_by_cycle_id is not null;

comment on column public.training_cycles.superseded_by_cycle_id is
  'Canonical cycle chosen instead of this preserved overlapping cycle.';
comment on column public.training_cycles.superseded_reason is
  'Audit-safe reason for removing a preserved cycle from active scheduling.';

create table if not exists public.training_cycle_supersession_audit (
  id uuid primary key default gen_random_uuid(),
  batch_sha256 text not null,
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  superseded_cycle_id uuid not null unique,
  canonical_cycle_id uuid not null,
  superseded_snapshot jsonb not null,
  canonical_snapshot jsonb not null,
  workout_ids uuid[] not null,
  workout_count integer not null check (workout_count > 0),
  exercise_row_count integer not null check (exercise_row_count >= 0),
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

alter table public.training_cycle_supersession_audit enable row level security;
revoke all on table public.training_cycle_supersession_audit from public, anon, authenticated;
grant select on table public.training_cycle_supersession_audit to service_role;

comment on table public.training_cycle_supersession_audit is
  'Restricted before-images for reversible MFIT semantic supersession; no public mutation API exists.';

lock table
  public.training_cycles,
  public.workouts,
  public.workout_exercises,
  public.workout_logs,
  public.workout_sessions,
  public.cycle_feedback,
  public.ai_plan_versions,
  public.ai_strength_plans,
  public.running_plans,
  public.nutrition_plans,
  public.prescription_bundles
in share row exclusive mode;

create temporary table pg_temp.mfit_semantic_candidates
on commit drop
as
with marker_workouts as (
  select
    workout.*,
    substring(
      split_part(coalesce(workout.notes, ''), E'\n', 1)
      from '^mfit-import:v1:([0-9a-f]+)$'
    ) as marker_hash
  from public.workouts as workout
  where split_part(coalesce(workout.notes, ''), E'\n', 1) like 'mfit-import:v1:%'
),
imported_cycles as (
  select
    cycle.*,
    count(workout.id)::integer as imported_workouts,
    count(*) filter (where workout.marker_hash is null)::integer as imported_non_mfit_workouts,
    count(distinct workout.marker_hash)::integer as marker_count,
    array_agg(workout.id order by workout.sort_order, workout.id) as imported_workout_ids,
    encode(extensions.digest((to_jsonb(cycle) - array[
      'superseded_by_cycle_id', 'superseded_at', 'superseded_by',
      'superseded_previous_status', 'superseded_reason'
    ])::text, 'sha256'), 'hex') as imported_cycle_sha256,
    encode(extensions.digest(
      string_agg((to_jsonb(workout) - 'marker_hash')::text, E'\n' order by workout.id),
      'sha256'
    ), 'hex') as imported_workouts_sha256
  from public.training_cycles as cycle
  join marker_workouts as workout on workout.cycle_id = cycle.id
  group by cycle.id
),
paired as (
  select
    imported.*,
    original.id as canonical_cycle_id,
    original.cycle_number as canonical_cycle_number,
    original.status as canonical_status,
    encode(extensions.digest((to_jsonb(original) - array[
      'superseded_by_cycle_id', 'superseded_at', 'superseded_by',
      'superseded_previous_status', 'superseded_reason'
    ])::text, 'sha256'), 'hex') as canonical_cycle_sha256,
    count(*) over (partition by imported.id) as canonical_candidates,
    count(*) over (partition by original.id) as imported_candidates
  from imported_cycles as imported
  join public.training_cycles as original
    on original.company_id = imported.company_id
   and original.student_id = imported.student_id
   and original.enrollment_id = imported.enrollment_id
   and original.id <> imported.id
   and imported.start_date = original.start_date
   and abs(imported.end_date - original.end_date) <= 1
   and not exists (
     select 1 from marker_workouts as marker where marker.cycle_id = original.id
   )
),
classified as (
  select
    pair.*,
    (select count(*) from public.workouts w where w.cycle_id = pair.canonical_cycle_id)::integer as canonical_workouts,
    (select count(*) from public.workout_exercises e where e.workout_id = any(pair.imported_workout_ids))::integer as imported_exercises,
    (select count(*) from public.workout_logs l where l.workout_id = any(pair.imported_workout_ids))::integer as imported_logs,
    (select count(*) from public.workout_sessions s where s.workout_id = any(pair.imported_workout_ids))::integer as imported_sessions,
    (select count(*) from public.cycle_feedback f where f.cycle_id = pair.id)::integer as imported_feedback,
    (select count(*) from public.ai_plan_versions p where p.cycle_id = pair.id)::integer as imported_versions,
    (select count(*) from public.ai_strength_plans p where p.training_cycle_id = pair.id)::integer as imported_strength,
    (select count(*) from public.running_plans p where p.training_cycle_id = pair.id)::integer as imported_running,
    (select count(*) from public.nutrition_plans p where p.training_cycle_id = pair.id)::integer as imported_nutrition,
    (select count(*) from public.prescription_bundles p where p.training_cycle_id = pair.id)::integer as imported_bundles,
    (select count(*) from public.ai_plan_versions p where p.cycle_id = pair.canonical_cycle_id)::integer as canonical_versions,
    (select count(*) from public.ai_strength_plans p where p.training_cycle_id = pair.canonical_cycle_id)::integer as canonical_strength,
    (select count(*) from public.running_plans p where p.training_cycle_id = pair.canonical_cycle_id)::integer as canonical_running,
    (select count(*) from public.prescription_bundles p where p.training_cycle_id = pair.canonical_cycle_id)::integer as canonical_bundles
  from paired as pair
)
select *
from classified
where canonical_candidates = 1
  and imported_candidates = 1
  and status = 'pending'
  and canonical_status in ('active', 'pending')
  and superseded_by_cycle_id is null
  and imported_non_mfit_workouts = 0
  and marker_count = 1
  and canonical_workouts > 0
  and imported_logs = 0
  and imported_sessions = 0
  and imported_feedback = 0
  and imported_versions = 0
  and imported_strength = 0
  and imported_running = 0
  and imported_nutrition = 0
  and imported_bundles = 0
  and canonical_versions > 0
  and canonical_strength > 0
  and canonical_running > 0
  and canonical_bundles > 0;

do $manifest_gate$
declare
  v_count integer;
  v_manifest text;
begin
  select count(*) into v_count from pg_temp.mfit_semantic_candidates;
  select encode(extensions.digest(string_agg(
    concat_ws('|',
      safe.company_id::text,
      safe.student_id::text,
      safe.enrollment_id::text,
      safe.id::text,
      safe.canonical_cycle_id::text,
      safe.imported_cycle_sha256,
      safe.canonical_cycle_sha256,
      safe.imported_workouts_sha256,
      array_to_string(safe.imported_workout_ids, ','),
      safe.imported_workouts::text,
      safe.imported_exercises::text,
      safe.canonical_workouts::text,
      safe.canonical_versions::text,
      safe.canonical_strength::text,
      safe.canonical_running::text,
      safe.canonical_bundles::text
    ),
    E'\n' order by safe.id
  ), 'sha256'), 'hex')
  into v_manifest
  from pg_temp.mfit_semantic_candidates as safe;

  if v_count <> 3 then
    raise exception 'mfit_semantic_candidate_count expected=3 actual=%', v_count;
  end if;
  if v_manifest is distinct from 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247' then
    raise exception 'mfit_semantic_manifest_mismatch actual=%', coalesce(v_manifest, 'null');
  end if;
end
$manifest_gate$;

insert into public.training_cycle_supersession_audit (
  batch_sha256,
  company_id,
  student_id,
  enrollment_id,
  superseded_cycle_id,
  canonical_cycle_id,
  superseded_snapshot,
  canonical_snapshot,
  workout_ids,
  workout_count,
  exercise_row_count
)
select
  'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247',
  candidate.company_id,
  candidate.student_id,
  candidate.enrollment_id,
  candidate.id,
  candidate.canonical_cycle_id,
  to_jsonb(imported),
  to_jsonb(canonical),
  candidate.imported_workout_ids,
  candidate.imported_workouts,
  candidate.imported_exercises
from pg_temp.mfit_semantic_candidates candidate
join public.training_cycles imported on imported.id = candidate.id
join public.training_cycles canonical on canonical.id = candidate.canonical_cycle_id;

update public.training_cycles imported
set
  superseded_by_cycle_id = candidate.canonical_cycle_id,
  superseded_at = now(),
  superseded_by = null,
  superseded_previous_status = imported.status,
  superseded_reason = 'legacy_mfit_replaced_by_integrated_prescription',
  status = 'superseded'
from pg_temp.mfit_semantic_candidates candidate
where imported.id = candidate.id;

do $post_apply_gate$
declare
  v_updated integer;
  v_audit integer;
begin
  select count(*) into v_updated
  from public.training_cycles cycle
  join pg_temp.mfit_semantic_candidates candidate on candidate.id = cycle.id
  where cycle.status = 'superseded'
    and cycle.superseded_by_cycle_id = candidate.canonical_cycle_id
    and cycle.superseded_previous_status = 'pending';

  select count(*) into v_audit
  from public.training_cycle_supersession_audit audit
  where audit.batch_sha256 = 'd3f2acfadde8b69cf647456fa958ed36ec7195100b94a029af3371b56c589247'
    and audit.state = 'applied';

  if v_updated <> 3 or v_audit <> 3 then
    raise exception 'mfit_semantic_post_apply_failed updated=% audit=%', v_updated, v_audit;
  end if;
end
$post_apply_gate$;

-- Superseded rows are historical and must not reserve a visible cycle number.
-- This lets the next canonical prescription reuse the sequential number while
-- the preserved MFIT record remains addressable by its UUID and audit link.
drop index if exists public.training_cycles_enrollment_number_uidx;
create unique index training_cycles_enrollment_number_uidx
  on public.training_cycles (enrollment_id, cycle_number)
  where enrollment_id is not null
    and status is distinct from 'superseded'
    and superseded_by_cycle_id is null;

-- Scheduling RPCs must treat superseded cycles as immutable history. Keeping
-- this in the same transaction prevents a later date recalculation from
-- reviving or moving one of the preserved MFIT records.
create or replace function public.recalculate_training_cycles(
  p_enrollment_id uuid,
  p_new_start_date date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_cursor date := p_new_start_date;
  c record;
  v_len int;
begin
  select company_id into v_company
  from public.enrollments
  where id = p_enrollment_id;

  if v_company is null then
    raise exception 'Matrícula não encontrada';
  end if;

  if not (
    public.has_role(auth.uid(), 'master'::public.app_role)
    or exists (
      select 1
      from public.company_members member
      where member.user_id = auth.uid()
        and member.company_id = v_company
    )
  ) then
    raise exception 'Sem permissão para recalcular ciclos desta matrícula';
  end if;

  update public.enrollments
  set training_start_date = p_new_start_date,
      start_date = p_new_start_date
  where id = p_enrollment_id;

  for c in
    select id, start_date, end_date
    from public.training_cycles
    where enrollment_id = p_enrollment_id
      and status not in ('completed', 'superseded')
      and superseded_by_cycle_id is null
    order by cycle_number
  loop
    v_len := greatest(1, (c.end_date - c.start_date));
    update public.training_cycles
    set start_date = v_cursor,
        end_date = v_cursor + v_len
    where id = c.id;
    v_cursor := v_cursor + v_len + 1;
  end loop;

  update public.enrollments enrollment
  set end_date = coalesce((
    select max(cycle.end_date)
    from public.training_cycles cycle
    where cycle.enrollment_id = enrollment.id
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
  ), enrollment.end_date)
  where enrollment.id = p_enrollment_id;
end;
$function$;

revoke all on function public.recalculate_training_cycles(uuid, date) from public;
grant execute on function public.recalculate_training_cycles(uuid, date) to authenticated;

create or replace function public.reschedule_training_cycles_from(
  p_enrollment_id uuid,
  p_cycle_id uuid,
  p_new_start_date date
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_cycle_number integer;
  v_current_start date;
  v_previous_end date;
  v_shift_days integer;
begin
  if p_new_start_date is null then
    raise exception 'Informe a nova data de inicio';
  end if;

  select enrollment.company_id
  into v_company_id
  from public.enrollments enrollment
  where enrollment.id = p_enrollment_id;

  if v_company_id is null then
    raise exception 'Matricula nao encontrada';
  end if;

  if not (
    public.has_role(auth.uid(), 'master'::public.app_role)
    or exists (
      select 1
      from public.company_members member
      where member.user_id = auth.uid()
        and member.company_id = v_company_id
    )
  ) then
    raise exception 'Sem permissao para reagendar os ciclos desta matricula';
  end if;

  perform 1
  from public.training_cycles cycle
  where cycle.enrollment_id = p_enrollment_id
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
  order by cycle.cycle_number
  for update;

  select cycle.cycle_number, cycle.start_date
  into v_cycle_number, v_current_start
  from public.training_cycles cycle
  where cycle.id = p_cycle_id
    and cycle.enrollment_id = p_enrollment_id
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null;

  if v_cycle_number is null or v_current_start is null then
    raise exception 'Ciclo nao encontrado nesta matricula';
  end if;

  select cycle.end_date
  into v_previous_end
  from public.training_cycles cycle
  where cycle.enrollment_id = p_enrollment_id
    and cycle.cycle_number < v_cycle_number
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
  order by cycle.cycle_number desc
  limit 1;

  if v_previous_end is not null and p_new_start_date <= v_previous_end then
    raise exception 'A nova data deve ser posterior ao termino do ciclo anterior (%)',
      to_char(v_previous_end, 'DD/MM/YYYY');
  end if;

  v_shift_days := p_new_start_date - v_current_start;

  if v_shift_days <> 0 then
    update public.training_cycles cycle
    set start_date = cycle.start_date + v_shift_days,
        end_date = cycle.end_date + v_shift_days
    where cycle.enrollment_id = p_enrollment_id
      and cycle.cycle_number >= v_cycle_number
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null;
  end if;

  if v_cycle_number = 1 then
    update public.enrollments enrollment
    set training_start_date = p_new_start_date
    where enrollment.id = p_enrollment_id;
  end if;
end;
$function$;

revoke all on function public.reschedule_training_cycles_from(uuid, uuid, date)
  from public, anon;
grant execute on function public.reschedule_training_cycles_from(uuid, uuid, date)
  to authenticated;

comment on function public.reschedule_training_cycles_from(uuid, uuid, date) is
  'Moves the selected non-superseded cycle and every following visible cycle without changing enrollment contract dates.';

create or replace function public.sync_prescription_cycles(
  _student_id uuid,
  _start_date date default null
)
returns table (
  id uuid,
  enrollment_id uuid,
  cycle_number integer,
  start_date date,
  end_date date,
  status text,
  has_workouts boolean,
  has_bundle boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_enrollment public.enrollments%rowtype;
  v_company_id uuid;
  v_start date;
  v_end date;
  v_cycle_start date;
  v_cycle_end date;
  v_cycle_days integer := 42;
  v_plan_days integer := 42;
  v_cycle_number integer := 1;
begin
  select enrollment.*
  into v_enrollment
  from public.enrollments enrollment
  where enrollment.student_id = _student_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by
    case enrollment.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    enrollment.created_at desc
  limit 1;

  if v_enrollment.id is null then
    raise exception using errcode = 'P0002', message = 'Aluno sem matrícula vigente para agendar prescrições.';
  end if;

  v_company_id := v_enrollment.company_id;
  if not public.is_company_staff(auth.uid(), v_company_id) then
    raise exception using errcode = '42501', message = 'Acesso restrito à equipe da empresa do aluno.';
  end if;

  select
    coalesce(plan.cycle_duration_days, 42),
    coalesce(plan.duration_days, plan.duration_weeks * 7, 42)
  into v_cycle_days, v_plan_days
  from public.plans plan
  where plan.id = v_enrollment.plan_id;

  v_cycle_days := greatest(coalesce(v_cycle_days, 42), 1);
  v_plan_days := greatest(coalesce(v_plan_days, 42), 1);
  v_start := coalesce(v_enrollment.training_start_date, _start_date, v_enrollment.start_date, current_date);
  v_end := coalesce(v_enrollment.end_date, v_start + v_plan_days - 1);
  if v_end < v_start then
    v_end := v_start + v_plan_days - 1;
  end if;

  if v_enrollment.training_start_date is null then
    update public.enrollments
    set training_start_date = v_start,
        updated_at = now()
    where public.enrollments.id = v_enrollment.id;
  end if;

  v_cycle_start := v_start;
  while v_cycle_start <= v_end loop
    v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_end);

    insert into public.training_cycles (
      enrollment_id,
      student_id,
      company_id,
      cycle_number,
      start_date,
      end_date,
      duration_weeks,
      status,
      name
    )
    select
      v_enrollment.id,
      _student_id,
      v_company_id,
      v_cycle_number,
      v_cycle_start,
      v_cycle_end,
      greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
      case
        when v_cycle_end < current_date then 'completed'
        when current_date between v_cycle_start and v_cycle_end then 'active'
        else 'pending'
      end,
      format('Ciclo %s', v_cycle_number)
    where not exists (
      select 1
      from public.training_cycles existing_cycle
      where existing_cycle.enrollment_id = v_enrollment.id
        and existing_cycle.cycle_number = v_cycle_number
        and existing_cycle.status <> 'superseded'
        and existing_cycle.superseded_by_cycle_id is null
    );

    update public.training_cycles existing_cycle
    set student_id = _student_id,
        company_id = v_company_id
    where existing_cycle.enrollment_id = v_enrollment.id
      and existing_cycle.cycle_number = v_cycle_number
      and existing_cycle.status <> 'superseded'
      and existing_cycle.superseded_by_cycle_id is null;

    v_cycle_number := v_cycle_number + 1;
    v_cycle_start := v_cycle_end + 1;
  end loop;

  perform public.advance_training_cycles();

  return query
  select
    cycle.id,
    cycle.enrollment_id,
    cycle.cycle_number,
    cycle.start_date,
    cycle.end_date,
    cycle.status,
    (
      cycle.prescribed_offline_at is not null
      or exists (
        select 1
        from public.workouts workout
        where workout.cycle_id = cycle.id
          and case
            when jsonb_typeof(workout.exercises) = 'array' then jsonb_array_length(workout.exercises)
            else 0
          end > 0
      )
    ) as has_workouts,
    exists (
      select 1
      from public.prescription_bundles bundle
      where bundle.training_cycle_id = cycle.id
        and bundle.status <> 'failed'
    ) as has_bundle
  from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
  order by cycle.cycle_number;
end;
$function$;

revoke all on function public.sync_prescription_cycles(uuid, date) from public, anon;
grant execute on function public.sync_prescription_cycles(uuid, date) to authenticated, service_role;

commit;
