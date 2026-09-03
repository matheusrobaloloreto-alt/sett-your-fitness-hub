-- Quarantine only structurally empty, non-active schedule rows whose complete
-- date range is already covered by higher-priority visible cycles. No cycle,
-- workout, log or contract date is deleted, moved or shortened.

begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:empty-cycle-supersession:v1', 0));

create table if not exists public.training_cycle_empty_supersession_audit (
  id uuid primary key default gen_random_uuid(),
  batch_sha256 text not null,
  company_id uuid not null,
  student_id uuid not null,
  enrollment_id uuid not null,
  redundant_cycle_id uuid not null unique,
  before_snapshot jsonb not null,
  before_sha256 text not null,
  covering_cycle_ids uuid[] not null,
  covering_snapshots jsonb not null,
  post_sha256 text,
  state text not null default 'applied' check (state in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

alter table public.training_cycle_empty_supersession_audit enable row level security;
revoke all on table public.training_cycle_empty_supersession_audit from public, anon, authenticated;
grant select on table public.training_cycle_empty_supersession_audit to service_role;

comment on table public.training_cycle_empty_supersession_audit is
  'Restricted before-images and complete covering sets for reversible empty-cycle supersession.';

lock table public.enrollments in share row exclusive mode;
lock table public.training_cycles in share row exclusive mode;
lock table public.workouts in share row exclusive mode;
lock table public.workout_logs in share row exclusive mode;
lock table public.workout_sessions in share row exclusive mode;
lock table public.cycle_feedback in share row exclusive mode;
lock table public.ai_plan_versions in share row exclusive mode;
lock table public.ai_strength_plans in share row exclusive mode;
lock table public.running_plans in share row exclusive mode;
lock table public.nutrition_plans in share row exclusive mode;
lock table public.prescription_bundles in share row exclusive mode;

create temporary table pg_temp.empty_cycle_candidates on commit drop as
with visible_cycles as (
  select cycle.*
  from public.training_cycles cycle
  where cycle.status is distinct from 'superseded'
    and cycle.superseded_by_cycle_id is null
),
cycle_usage as (
  select
    cycle.id,
    exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id) as has_workouts,
    (
      exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
      or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
      or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
      or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
      or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
      or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
    ) as has_other_history,
    (
      cycle.prescribed_offline_at is not null
      or cycle.prescribed_offline_by is not null
      or nullif(btrim(coalesce(cycle.prescribed_offline_note, '')), '') is not null
      or cycle.anamnese_id is not null
      or cycle.bundle_id is not null
      or nullif(btrim(coalesce(cycle.objective, '')), '') is not null
      or nullif(btrim(coalesce(cycle.notes, '')), '') is not null
      or case
        when jsonb_typeof(coalesce(cycle.workouts, '[]'::jsonb)) = 'array'
          then jsonb_array_length(coalesce(cycle.workouts, '[]'::jsonb)) > 0
        else coalesce(cycle.workouts, 'null'::jsonb) <> 'null'::jsonb
      end
      or lower(coalesce(cycle.delivery_status, '')) in ('sent', 'viewed', 'delivered', 'published')
    ) as has_cycle_signal
  from visible_cycles cycle
),
safe_redundant as (
  select redundant.*
  from visible_cycles redundant
  join cycle_usage redundant_usage on redundant_usage.id = redundant.id
  where redundant.status <> 'active'
    and redundant.start_date <= redundant.end_date
    and not redundant_usage.has_workouts
    and not redundant_usage.has_other_history
    and not redundant_usage.has_cycle_signal
    and not exists (
      select 1
      from generate_series(redundant.start_date, redundant.end_date, interval '1 day') day
      where not exists (
        select 1
        from visible_cycles canonical
        join cycle_usage canonical_usage on canonical_usage.id = canonical.id
        where canonical.enrollment_id = redundant.enrollment_id
          and canonical.id <> redundant.id
          and day::date between canonical.start_date and canonical.end_date
          and (
            canonical_usage.has_workouts
            or canonical_usage.has_other_history
            or canonical.created_at < redundant.created_at
            or (canonical.created_at = redundant.created_at and canonical.id < redundant.id)
          )
      )
    )
)
select
  safe.*,
  encode(extensions.digest((to_jsonb(safe) - array[
    'superseded_by_cycle_id', 'superseded_at', 'superseded_by',
    'superseded_previous_status', 'superseded_reason', 'updated_at'
  ])::text, 'sha256'), 'hex') as before_sha256,
  array(
    select distinct canonical.id
    from visible_cycles canonical
    join cycle_usage canonical_usage on canonical_usage.id = canonical.id
    where canonical.enrollment_id = safe.enrollment_id
      and canonical.id <> safe.id
      and canonical.start_date <= safe.end_date
      and canonical.end_date >= safe.start_date
      and (
        canonical_usage.has_workouts
        or canonical_usage.has_other_history
        or canonical.created_at < safe.created_at
        or (canonical.created_at = safe.created_at and canonical.id < safe.id)
      )
    order by canonical.id
  ) as covering_cycle_ids
from safe_redundant safe
where cardinality(array(
  select distinct canonical.id
  from visible_cycles canonical
  join cycle_usage canonical_usage on canonical_usage.id = canonical.id
  where canonical.enrollment_id = safe.enrollment_id
    and canonical.id <> safe.id
    and canonical.start_date <= safe.end_date
    and canonical.end_date >= safe.start_date
    and (
      canonical_usage.has_workouts
      or canonical_usage.has_other_history
      or canonical.created_at < safe.created_at
      or (canonical.created_at = safe.created_at and canonical.id < safe.id)
    )
)) > 0;

create temporary table pg_temp.visible_calendar_before on commit drop as
select candidate.enrollment_id, count(distinct day::date)::integer as visible_days
from (select distinct enrollment_id from pg_temp.empty_cycle_candidates) candidate
join public.training_cycles cycle on cycle.enrollment_id = candidate.enrollment_id
cross join lateral generate_series(cycle.start_date, cycle.end_date, interval '1 day') day
where cycle.status is distinct from 'superseded'
  and cycle.superseded_by_cycle_id is null
group by candidate.enrollment_id;

create temporary table pg_temp.materialized_before on commit drop as
select
  candidate.enrollment_id,
  count(*)::integer as cycle_count,
  encode(extensions.digest(string_agg(
    (to_jsonb(cycle) - array['superseded_at', 'superseded_by', 'superseded_reason'])::text,
    E'\n' order by cycle.id
  ), 'sha256'), 'hex') as cycle_sha256
from (select distinct enrollment_id from pg_temp.empty_cycle_candidates) candidate
join public.training_cycles cycle on cycle.enrollment_id = candidate.enrollment_id
where exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id)
   or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
   or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
   or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
   or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
   or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
   or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
group by candidate.enrollment_id;

do $manifest_gate$
declare
  v_expected_count constant integer := 18;
  v_expected_enrollment_count constant integer := 6;
  v_expected_active_count constant integer := 0;
  v_expected_sha256 constant text := '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2';
  v_count integer;
  v_enrollment_count integer;
  v_active_count integer;
  v_actual_sha256 text;
begin
  select count(*), count(distinct enrollment_id), count(*) filter (where status = 'active')
  into v_count, v_enrollment_count, v_active_count
  from pg_temp.empty_cycle_candidates;

  select encode(extensions.digest(string_agg(
    concat_ws('|', id::text, enrollment_id::text, start_date::text, end_date::text,
      status, created_at::text, before_sha256, array_to_string(covering_cycle_ids, ',')),
    E'\n' order by id
  ), 'sha256'), 'hex')
  into v_actual_sha256
  from pg_temp.empty_cycle_candidates;

  if v_count = 0 and v_enrollment_count = 0 and v_active_count = 0 then
    return;
  end if;
  if v_count <> v_expected_count
    or v_enrollment_count <> v_expected_enrollment_count
    or v_active_count <> v_expected_active_count then
    raise exception 'empty_cycle_manifest_count_mismatch candidates=% enrollments=% active=%',
      v_count, v_enrollment_count, v_active_count;
  end if;
  if v_actual_sha256 is distinct from v_expected_sha256 then
    raise exception 'empty_cycle_manifest_sha256_mismatch';
  end if;
end
$manifest_gate$;

insert into public.training_cycle_empty_supersession_audit (
  batch_sha256,
  company_id,
  student_id,
  enrollment_id,
  redundant_cycle_id,
  before_snapshot,
  before_sha256,
  covering_cycle_ids,
  covering_snapshots
)
select
  '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2',
  candidate.company_id,
  candidate.student_id,
  candidate.enrollment_id,
  candidate.id,
  to_jsonb(cycle),
  candidate.before_sha256,
  candidate.covering_cycle_ids,
  coalesce((
    select jsonb_agg(to_jsonb(covering) order by covering.id)
    from public.training_cycles covering
    where covering.id = any(candidate.covering_cycle_ids)
  ), '[]'::jsonb)
from pg_temp.empty_cycle_candidates candidate
join public.training_cycles cycle on cycle.id = candidate.id;

update public.training_cycles cycle
set status = 'superseded',
    superseded_by_cycle_id = null,
    superseded_at = now(),
    superseded_by = null,
    superseded_previous_status = cycle.status,
    superseded_reason = 'empty_redundant_schedule_fully_covered'
from pg_temp.empty_cycle_candidates candidate
where cycle.id = candidate.id;

update public.training_cycle_empty_supersession_audit audit
set post_sha256 = encode(extensions.digest(to_jsonb(cycle)::text, 'sha256'), 'hex')
from public.training_cycles cycle
where audit.redundant_cycle_id = cycle.id
  and audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2';

do $post_apply_gate$
declare
  v_expected_applied integer;
  v_applied integer;
  v_visible_candidates integer;
  v_calendar_mismatches integer;
  v_materialized_mismatches integer;
begin
  select count(*)::integer into v_expected_applied from pg_temp.empty_cycle_candidates;
  select count(*) into v_applied
  from public.training_cycle_empty_supersession_audit audit
  join public.training_cycles cycle on cycle.id = audit.redundant_cycle_id
  where audit.batch_sha256 = '29dd196c80f1de7cb2e0def252d0a92cc919f6c336bd20191c32412be9b293f2'
    and audit.state = 'applied'
    and audit.post_sha256 is not null
    and cycle.status = 'superseded'
    and cycle.superseded_by_cycle_id is null
    and cycle.superseded_reason = 'empty_redundant_schedule_fully_covered';

  select count(*) into v_visible_candidates
  from pg_temp.empty_cycle_candidates candidate
  join public.training_cycles cycle on cycle.id = candidate.id
  where cycle.status is distinct from 'superseded'
    and cycle.superseded_by_cycle_id is null;

  with after_days as (
    select candidate.enrollment_id, count(distinct day::date)::integer as visible_days
    from (select distinct enrollment_id from pg_temp.empty_cycle_candidates) candidate
    join public.training_cycles cycle on cycle.enrollment_id = candidate.enrollment_id
    cross join lateral generate_series(cycle.start_date, cycle.end_date, interval '1 day') day
    where cycle.status is distinct from 'superseded'
      and cycle.superseded_by_cycle_id is null
    group by candidate.enrollment_id
  )
  select count(*) into v_calendar_mismatches
  from pg_temp.visible_calendar_before before_days
  full join after_days using (enrollment_id)
  where before_days.visible_days is distinct from after_days.visible_days;

  with after_materialized as (
    select
      candidate.enrollment_id,
      count(*)::integer as cycle_count,
      encode(extensions.digest(string_agg(
        (to_jsonb(cycle) - array['superseded_at', 'superseded_by', 'superseded_reason'])::text,
        E'\n' order by cycle.id
      ), 'sha256'), 'hex') as cycle_sha256
    from (select distinct enrollment_id from pg_temp.empty_cycle_candidates) candidate
    join public.training_cycles cycle on cycle.enrollment_id = candidate.enrollment_id
    where exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id)
       or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
       or exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
       or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
       or exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
       or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
       or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
    group by candidate.enrollment_id
  )
  select count(*) into v_materialized_mismatches
  from pg_temp.materialized_before before_set
  full join after_materialized after_set using (enrollment_id)
  where before_set.cycle_count is distinct from after_set.cycle_count
     or before_set.cycle_sha256 is distinct from after_set.cycle_sha256;

  if v_applied <> v_expected_applied or v_visible_candidates <> 0
    or v_calendar_mismatches <> 0 or v_materialized_mismatches <> 0 then
    raise exception 'empty_cycle_post_apply_failed applied=% visible=% calendar=% materialized=%',
      v_applied, v_visible_candidates, v_calendar_mismatches, v_materialized_mismatches;
  end if;
end
$post_apply_gate$;

-- Serialize one enrollment and either reuse a fully covered slot, insert into
-- empty calendar space, or fail closed on a partial overlap.
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
  v_covered_days integer;
  v_overlap_count integer;
  v_today date := public.current_business_date();
  v_previously_active uuid[];
begin
  select enrollment.* into v_enrollment
  from public.enrollments enrollment
  where enrollment.student_id = _student_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by case enrollment.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    enrollment.created_at desc
  limit 1
  for update;

  if v_enrollment.id is null then
    raise exception using errcode = 'P0002', message = 'Aluno sem matrícula vigente para agendar prescrições.';
  end if;
  v_company_id := v_enrollment.company_id;
  if not public.is_company_staff(auth.uid(), v_company_id) then
    raise exception using errcode = '42501', message = 'Acesso restrito à equipe da empresa do aluno.';
  end if;

  select coalesce(plan.cycle_duration_days, 42), coalesce(plan.duration_days, plan.duration_weeks * 7, 42)
  into v_cycle_days, v_plan_days
  from public.plans plan where plan.id = v_enrollment.plan_id;
  v_cycle_days := greatest(coalesce(v_cycle_days, 42), 1);
  v_plan_days := greatest(coalesce(v_plan_days, 42), 1);
  v_start := coalesce(v_enrollment.training_start_date, _start_date, v_enrollment.start_date, current_date);
  -- One enrollment represents one purchased plan period. Renewals must create
  -- another enrollment instead of extending the schedule horizon implicitly.
  v_end := least(
    coalesce(v_enrollment.end_date, v_start + v_plan_days - 1),
    v_start + v_plan_days - 1
  );
  if v_end < v_start then v_end := v_start + v_plan_days - 1; end if;

  if v_enrollment.training_start_date is null then
    update public.enrollments set training_start_date = v_start, updated_at = now()
    where public.enrollments.id = v_enrollment.id;
  end if;

  v_cycle_start := v_start;
  while v_cycle_start <= v_end loop
    v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_end);

    select count(distinct day::date)::integer into v_covered_days
    from generate_series(v_cycle_start, v_cycle_end, interval '1 day') day
    where exists (
      select 1 from public.training_cycles existing_cycle
      where existing_cycle.enrollment_id = v_enrollment.id
        and existing_cycle.status <> 'superseded'
        and existing_cycle.superseded_by_cycle_id is null
        and day::date between existing_cycle.start_date and existing_cycle.end_date
    );

    select count(*)::integer into v_overlap_count
    from public.training_cycles existing_cycle
    where existing_cycle.enrollment_id = v_enrollment.id
      and existing_cycle.status <> 'superseded'
      and existing_cycle.superseded_by_cycle_id is null
      and existing_cycle.start_date <= v_cycle_end
      and existing_cycle.end_date >= v_cycle_start;

    if v_covered_days = (v_cycle_end - v_cycle_start + 1) then
      -- intended_slot_fully_covered: reuse the immutable visible schedule.
      null;
    elsif v_overlap_count > 0 then
      raise exception using errcode = '23514', message = 'training_cycle_partial_overlap';
    elsif exists (
      select 1 from public.training_cycles existing_cycle
      where existing_cycle.enrollment_id = v_enrollment.id
        and existing_cycle.cycle_number = v_cycle_number
        and existing_cycle.status <> 'superseded'
        and existing_cycle.superseded_by_cycle_id is null
    ) then
      raise exception using errcode = '23514', message = 'training_cycle_number_conflict';
    else
      insert into public.training_cycles (
        enrollment_id, student_id, company_id, cycle_number, start_date, end_date,
        duration_weeks, status, name
      ) values (
        v_enrollment.id, _student_id, v_company_id, v_cycle_number, v_cycle_start, v_cycle_end,
        greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
        case when v_cycle_end < current_date then 'completed'
          when current_date between v_cycle_start and v_cycle_end then 'active' else 'pending' end,
        format('Ciclo %s', v_cycle_number)
      );
    end if;

    v_cycle_number := v_cycle_number + 1;
    v_cycle_start := v_cycle_end + 1;
  end loop;

  -- Advance only this enrollment. The previous implementation called the
  -- global lifecycle function and could mutate unrelated tenants/cycles while
  -- a single prescription was being synchronized.
  select coalesce(array_agg(cycle.id), '{}'::uuid[])
  into v_previously_active
  from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id
    and cycle.status = 'active'
    and cycle.superseded_by_cycle_id is null;

  update public.training_cycles cycle
  set status = 'completed'
  where cycle.enrollment_id = v_enrollment.id
    and cycle.status in ('active', 'pending')
    and cycle.superseded_by_cycle_id is null
    and cycle.end_date < v_today;

  update public.training_cycles cycle
  set status = 'pending'
  where cycle.enrollment_id = v_enrollment.id
    and cycle.status in ('active', 'pending')
    and cycle.superseded_by_cycle_id is null
    and cycle.start_date > v_today;

  update public.training_cycles cycle
  set status = 'pending'
  where cycle.enrollment_id = v_enrollment.id
    and cycle.status in ('active', 'pending')
    and cycle.superseded_by_cycle_id is null
    and v_today between cycle.start_date and cycle.end_date;

  with ranked_current_cycles as (
    select cycle.id,
      row_number() over (order by
        case when cycle.id = any(v_previously_active) then 0 else 1 end,
        case when exists (
          select 1 from public.prescription_bundles bundle
          where bundle.training_cycle_id = cycle.id
        ) then 0 else 1 end,
        cycle.start_date desc,
        cycle.cycle_number desc,
        cycle.created_at desc
      ) as current_rank
    from public.training_cycles cycle
    where cycle.enrollment_id = v_enrollment.id
      and cycle.status = 'pending'
      and cycle.superseded_by_cycle_id is null
      and v_today between cycle.start_date and cycle.end_date
  )
  update public.training_cycles cycle
  set status = 'active'
  from ranked_current_cycles ranked
  where cycle.id = ranked.id
    and ranked.current_rank = 1;
  return query
  select cycle.id, cycle.enrollment_id, cycle.cycle_number, cycle.start_date, cycle.end_date, cycle.status,
    (cycle.prescribed_offline_at is not null or exists (
      select 1 from public.workouts workout where workout.cycle_id = cycle.id
        and case when jsonb_typeof(workout.exercises) = 'array' then jsonb_array_length(workout.exercises) else 0 end > 0
    )),
    exists (select 1 from public.prescription_bundles bundle
      where bundle.training_cycle_id = cycle.id and bundle.status <> 'failed')
  from public.training_cycles cycle
  where cycle.enrollment_id = v_enrollment.id
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
  order by cycle.start_date, cycle.cycle_number;
end;
$function$;

revoke all on function public.sync_prescription_cycles(uuid, date) from public, anon;
grant execute on function public.sync_prescription_cycles(uuid, date) to authenticated, service_role;

-- Direct enrollment-date edits realign only structurally empty placeholders.
-- Materialized rows fail closed; excess placeholders become immutable history.
create or replace function public.generate_training_cycles()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_start date;
  v_end date;
  v_cycle_days integer := 42;
  v_plan_days integer := 42;
  v_cycle_number integer := 1;
  v_cycle_start date;
  v_cycle_end date;
  v_existing_cycle_id uuid;
begin
  if new.training_start_date is null then return new; end if;
  if tg_op = 'UPDATE' and old.training_start_date is not distinct from new.training_start_date then
    return new;
  end if;

  -- Lock the complete visible schedule before checking for workouts/history.
  -- A concurrent FK insert must then wait until the realignment commits and
  -- can only attach to the final dates, never materialize a row after it was
  -- checked but before it was moved.
  perform cycle.id
  from public.training_cycles cycle
  where cycle.enrollment_id = new.id
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
  order by cycle.id
  for update;

  if tg_op = 'UPDATE' and exists (
    select 1 from public.training_cycles cycle
    where cycle.enrollment_id = new.id
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
      and (
        cycle.prescribed_offline_at is not null
        or cycle.prescribed_offline_by is not null
        or nullif(btrim(coalesce(cycle.prescribed_offline_note, '')), '') is not null
        or cycle.anamnese_id is not null
        or cycle.bundle_id is not null
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
  ) then
    raise exception using errcode = '23514',
      message = 'A data inicial não pode ser alterada porque a matrícula possui prescrição ou histórico.';
  end if;

  if tg_op = 'UPDATE' then
    -- Avoid a transient violation of the one-active-cycle index while the
    -- empty placeholder schedule is shifted to its new dates.
    update public.training_cycles cycle
    set status = 'pending'
    where cycle.enrollment_id = new.id
      and cycle.status = 'active'
      and cycle.superseded_by_cycle_id is null;
  end if;

  select coalesce(plan.cycle_duration_days, 42), coalesce(plan.duration_days, plan.duration_weeks * 7, 42)
  into v_cycle_days, v_plan_days from public.plans plan where plan.id = new.plan_id;
  v_cycle_days := greatest(coalesce(v_cycle_days, 42), 1);
  v_plan_days := greatest(coalesce(v_plan_days, 42), 1);
  v_start := new.training_start_date;
  v_end := least(
    coalesce(new.end_date, v_start + v_plan_days - 1),
    v_start + v_plan_days - 1
  );
  if v_end < v_start then v_end := v_start + v_plan_days - 1; end if;

  v_cycle_start := v_start;
  while v_cycle_start <= v_end loop
    v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_end);

    select cycle.id into v_existing_cycle_id
    from public.training_cycles cycle
    where cycle.enrollment_id = new.id
      and cycle.cycle_number = v_cycle_number
      and cycle.status <> 'superseded'
      and cycle.superseded_by_cycle_id is null
    for update;

    if v_existing_cycle_id is null then
      insert into public.training_cycles (
        enrollment_id, student_id, company_id, cycle_number, start_date, end_date,
        duration_weeks, status, name
      ) values (
        new.id, new.student_id, new.company_id, v_cycle_number, v_cycle_start, v_cycle_end,
        greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
        case when v_cycle_end < current_date then 'completed'
          when current_date between v_cycle_start and v_cycle_end then 'active' else 'pending' end,
        format('Ciclo %s', v_cycle_number)
      );
    else
      update public.training_cycles cycle
      set student_id = new.student_id,
          company_id = new.company_id,
          start_date = v_cycle_start,
          end_date = v_cycle_end,
          duration_weeks = greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
          status = case when v_cycle_end < current_date then 'completed'
            when current_date between v_cycle_start and v_cycle_end then 'active' else 'pending' end,
          name = coalesce(cycle.name, format('Ciclo %s', v_cycle_number))
      where cycle.id = v_existing_cycle_id;
    end if;
    v_cycle_number := v_cycle_number + 1;
    v_cycle_start := v_cycle_end + 1;
    v_existing_cycle_id := null;
  end loop;

  update public.training_cycles cycle
  set status = 'superseded',
      superseded_by_cycle_id = null,
      superseded_at = now(),
      superseded_by = null,
      superseded_previous_status = cycle.status,
      superseded_reason = 'empty_schedule_replaced_by_date_change'
  where cycle.enrollment_id = new.id
    and cycle.cycle_number >= v_cycle_number
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null;

  return new;
end;
$function$;

revoke execute on function public.generate_training_cycles() from public, anon, authenticated;
grant execute on function public.generate_training_cycles() to service_role;

-- Recalculate an empty enrollment from the canonical plan duration. The old
-- implementation derived end_date from the last generated placeholder, which
-- made each reschedule capable of ratcheting the contract farther into the
-- future and then generating another batch of cycles.
create or replace function public.recalculate_training_cycles(
  p_enrollment_id uuid,
  p_new_start_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_company_id uuid;
  v_plan_days integer;
begin
  if p_new_start_date is null then
    raise exception using errcode = '23514', message = 'A data inicial é obrigatória.';
  end if;

  select enrollment.company_id,
    greatest(coalesce(plan.duration_days, plan.duration_weeks * 7, 42), 1)
  into v_company_id, v_plan_days
  from public.enrollments enrollment
  left join public.plans plan on plan.id = enrollment.plan_id
  where enrollment.id = p_enrollment_id
  for update of enrollment;

  if v_company_id is null then
    raise exception using errcode = 'P0002', message = 'Matrícula não encontrada.';
  end if;
  if not public.is_company_staff(auth.uid(), v_company_id) then
    raise exception using errcode = '42501', message = 'Sem permissão para recalcular esta matrícula.';
  end if;

  update public.enrollments enrollment
  set training_start_date = p_new_start_date,
      start_date = p_new_start_date,
      end_date = p_new_start_date + v_plan_days - 1,
      updated_at = now()
  where enrollment.id = p_enrollment_id;
end;
$function$;

revoke all on function public.recalculate_training_cycles(uuid, date) from public, anon;
grant execute on function public.recalculate_training_cycles(uuid, date) to authenticated, service_role;

-- Superseded rows are immutable history and cannot be acknowledged by a pupil.
create or replace function public.mark_training_cycle_viewed(_cycle_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare v_cycle_id uuid;
begin
  update public.training_cycles cycle
  set delivery_status = 'viewed'
  where cycle.id = _cycle_id
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
    and (cycle.start_date is null or cycle.start_date <= public.current_business_date())
    and exists (select 1 from public.students student
      where student.id = cycle.student_id and student.user_id = auth.uid())
  returning cycle.id into v_cycle_id;
  return v_cycle_id is not null;
end;
$function$;

revoke all on function public.mark_training_cycle_viewed(uuid) from public, anon;
grant execute on function public.mark_training_cycle_viewed(uuid) to authenticated, service_role;

commit;
