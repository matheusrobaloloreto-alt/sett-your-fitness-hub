-- Emergency rollback for single_enrollment_6d6035153239_overlap_20260909_v1.
-- Restores only the fields changed by the repair and aborts on any drift.
begin;

set local lock_timeout = '8s';
set local statement_timeout = '180s';

select pg_advisory_xact_lock(hashtextextended('sett:single-enrollment-cycle-overlap:6d6035153239:v1', 0));

lock table
  public.training_cycles,
  public.workouts,
  public.workout_exercises,
  public.workout_logs,
  public.workout_sessions,
  public.intercycle_anamneses,
  public.intercycle_anamnesis_deliveries,
  public.intercycle_anamnesis_invites,
  public.intercycle_anamnesis_waivers,
  public.training_cycle_overlap_repair_audit
in share row exclusive mode;

do $rollback$
declare
  v_audit public.training_cycle_overlap_repair_audit%rowtype;
  v_cycle_ids uuid[];
  v_current_cycles_sha text;
  v_current_workouts_sha text;
  v_restored_cycles_sha text;
begin
  select * into v_audit
  from public.training_cycle_overlap_repair_audit
  where repair_key = 'single_enrollment_6d6035153239_overlap_20260909_v1'
    and state = 'applied'
  for update;
  if not found then raise exception 'overlap_repair_rollback_not_available'; end if;

  select array_agg((snapshot.row_value).id order by (snapshot.row_value).id)
  into v_cycle_ids
  from (
    select jsonb_populate_record(null::public.training_cycles, item.value) as row_value
    from jsonb_array_elements(v_audit.after_cycles) item
  ) snapshot;

  select encode(extensions.digest(string_agg(
    (to_jsonb(cycle) - array['student_id','company_id','enrollment_id'])::text,
    E'\n' order by cycle.id
  ), 'sha256'), 'hex')
  into v_current_cycles_sha
  from public.training_cycles cycle where cycle.id = any(v_cycle_ids);

  select encode(extensions.digest(string_agg(
    (to_jsonb(workout) - array['company_id','created_by'])::text,
    E'\n' order by workout.id
  ), 'sha256'), 'hex')
  into v_current_workouts_sha
  from public.workouts workout where workout.cycle_id = any(v_cycle_ids);

  if v_current_cycles_sha is distinct from v_audit.after_cycles_sha256
    or v_current_workouts_sha is distinct from v_audit.after_workouts_sha256
    or exists (select 1 from public.workout_logs log join public.workouts workout on workout.id=log.workout_id where workout.cycle_id=any(v_cycle_ids))
    or exists (select 1 from public.workout_sessions session join public.workouts workout on workout.id=session.workout_id where workout.cycle_id=any(v_cycle_ids))
    or exists (select 1 from public.intercycle_anamneses answer where answer.training_cycle_id=any(v_cycle_ids) and answer.created_at > v_audit.applied_at)
    or exists (select 1 from public.intercycle_anamnesis_deliveries delivery where delivery.training_cycle_id=any(v_cycle_ids) and delivery.created_at > v_audit.applied_at)
    or exists (select 1 from public.intercycle_anamnesis_invites invite where invite.training_cycle_id=any(v_cycle_ids) and invite.created_at > v_audit.applied_at)
    or exists (select 1 from public.intercycle_anamnesis_waivers waiver where (waiver.training_cycle_id=any(v_cycle_ids) or waiver.prior_cycle_id=any(v_cycle_ids)) and waiver.waived_at > v_audit.applied_at) then
    raise exception 'overlap_repair_rollback_compare_and_swap_failed';
  end if;

  with snapshots as (
    select jsonb_populate_record(null::public.training_cycles, item.value) as row_value
    from jsonb_array_elements(v_audit.before_cycles) item
  )
  update public.training_cycles cycle
  set start_date = (snapshot.row_value).start_date,
    end_date = (snapshot.row_value).end_date,
    status = (snapshot.row_value).status,
    superseded_by_cycle_id = (snapshot.row_value).superseded_by_cycle_id,
    superseded_at = (snapshot.row_value).superseded_at,
    superseded_by = (snapshot.row_value).superseded_by,
    superseded_previous_status = (snapshot.row_value).superseded_previous_status,
    superseded_reason = (snapshot.row_value).superseded_reason
  from snapshots snapshot
  where cycle.id = (snapshot.row_value).id;

  select encode(extensions.digest(string_agg(
    (to_jsonb(cycle) - array['student_id','company_id','enrollment_id'])::text,
    E'\n' order by cycle.id
  ), 'sha256'), 'hex')
  into v_restored_cycles_sha
  from public.training_cycles cycle where cycle.id = any(v_cycle_ids);
  if v_restored_cycles_sha is distinct from v_audit.before_cycles_sha256 then
    raise exception 'overlap_repair_rollback_restore_failed';
  end if;

  update public.training_cycle_overlap_repair_audit
  set state = 'rolled_back', rolled_back_at = now()
  where id = v_audit.id and state = 'applied';
end
$rollback$;

commit;
