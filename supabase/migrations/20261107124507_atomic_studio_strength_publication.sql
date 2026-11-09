-- Keep integrated strength drafts separate from the plan the student can use.
alter table public.prescription_bundles
  add column studio_strength_draft boolean not null default false,
  add column studio_strength_snapshot jsonb;

alter table public.ai_strength_plans
  add column studio_draft_cycle_id uuid references public.training_cycles(id) on delete cascade,
  add column studio_superseded_cycle_id uuid,
  add column studio_publication jsonb,
  add constraint studio_strength_plan_lifecycle check (
    num_nonnulls(studio_draft_cycle_id, studio_superseded_cycle_id, training_cycle_id) <= 1
  );

create policy studio_strength_plans_visibility on public.ai_strength_plans
  as restrictive for select to authenticated
  using (
    (studio_draft_cycle_id is null and studio_superseded_cycle_id is null
      and (studio_publication is null or training_cycle_id is not null)
      and (plan->>'studio_draft_only') is distinct from 'true')
    or public.can_manage_staff_student(company_id, student_id)
  );

create policy studio_strength_bundles_visibility on public.prescription_bundles
  as restrictive for select to authenticated
  using (not studio_strength_draft or public.can_manage_staff_student(company_id, student_id));

create policy studio_strength_bundle_items_visibility on public.prescription_bundle_items
  as restrictive for select to authenticated
  using (
    exists (select 1 from public.prescription_bundles bundle where bundle.id = bundle_id)
  );

-- Freeze the original cycle and workout versions when a new draft bundle is opened.
create function public.guard_studio_strength_bundle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.studio_strength_draft then
    select jsonb_build_object(
      'start_date', cycle.start_date, 'end_date', cycle.end_date,
      'offline_at', cycle.prescribed_offline_at, 'cleared_at', cycle.prescription_cleared_at,
      'clear_event_id', cycle.prescription_cleared_event_id,
      'bundle_id', cycle.bundle_id, 'expected_rows', (
        select coalesce(jsonb_agg(jsonb_build_object('id', workout.id, 'updated_at', workout.updated_at)), '[]'::jsonb)
        from public.workouts workout where workout.cycle_id = cycle.id and workout.superseded_at is null
      )
    ) into new.studio_strength_snapshot
    from public.training_cycles cycle
    where cycle.id = new.training_cycle_id and cycle.company_id = new.company_id
      and cycle.student_id = new.student_id and cycle.superseded_at is null
      and cycle.superseded_by_cycle_id is null and coalesce(cycle.status, '') not in ('cancelled', 'superseded');
    if new.studio_strength_snapshot is null or not coalesce(new.has_strength, false)
      or new.strength_plan_id is not null or coalesce(new.status, '') not in ('generating', 'draft') then
      raise exception 'studio_strength_cycle_changed';
    end if;
  elsif tg_op = 'UPDATE' and current_user in ('authenticated', 'anon', 'service_role') then
    if new.studio_strength_snapshot is distinct from old.studio_strength_snapshot
      or new.studio_strength_draft is distinct from old.studio_strength_draft
      or (old.studio_strength_draft and (
        row(new.training_cycle_id, new.company_id, new.student_id, new.has_strength)
          is distinct from row(old.training_cycle_id, old.company_id, old.student_id, old.has_strength)
        or new.strength_plan_id is not null or coalesce(new.status, '') not in ('generating', 'draft', 'failed')
      )) then
      raise exception 'studio_strength_draft_link_invalid';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_studio_strength_bundle before insert or update on public.prescription_bundles
for each row execute function public.guard_studio_strength_bundle();

-- Reject a legacy generator trying to persist directly into a Studio draft's target.
-- The promotion clears the bundle's marker inside the same transaction.
create function public.guard_studio_strength_plan_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon', 'service_role') then
    if tg_op = 'INSERT' and (new.studio_publication is not null or new.studio_superseded_cycle_id is not null) then
      raise exception 'studio_strength_draft_link_invalid';
    elsif tg_op = 'UPDATE' then
      if (old.studio_publication is not null and new is distinct from old)
        or row(new.studio_publication, new.studio_superseded_cycle_id, new.studio_draft_cycle_id)
          is distinct from row(old.studio_publication, old.studio_superseded_cycle_id, old.studio_draft_cycle_id)
        or (old.studio_draft_cycle_id is not null and row(new.bundle_id, new.training_cycle_id, new.company_id, new.student_id)
          is distinct from row(old.bundle_id, old.training_cycle_id, old.company_id, old.student_id)) then
        raise exception 'studio_strength_draft_link_invalid';
      end if;
    end if;
  end if;
  if new.studio_draft_cycle_id is not null and not exists (
    select 1 from public.prescription_bundles bundle
    where bundle.id = new.bundle_id and bundle.studio_strength_draft
      and bundle.training_cycle_id = new.studio_draft_cycle_id
      and bundle.company_id = new.company_id and bundle.student_id = new.student_id
  ) or new.studio_draft_cycle_id is null and exists (
    select 1 from public.prescription_bundles bundle
    where bundle.id = new.bundle_id and bundle.studio_strength_draft
  ) then
    raise exception 'studio_strength_draft_link_invalid';
  end if;
  return new;
end;
$$;

create trigger guard_studio_strength_plan_link
before insert or update
on public.ai_strength_plans
for each row execute function public.guard_studio_strength_plan_link();

create function public.publish_studio_strength_draft(
  p_draft_id uuid,
  p_cycle_id uuid,
  p_expected_draft_updated_at timestamptz,
  p_plan jsonb,
  p_workouts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle public.training_cycles%rowtype;
  v_draft public.ai_strength_plans%rowtype;
  v_bundle public.prescription_bundles%rowtype;
  v_today date := public.current_business_date();
  v_current boolean;
  v_plan jsonb := p_plan - 'studio_draft_only';
  v_revision jsonb;
  v_receipt jsonb;
  v_prior_cycle_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'studio_strength_forbidden';
  end if;
  if p_expected_draft_updated_at is null
    or jsonb_typeof(p_plan) is distinct from 'object'
    or jsonb_typeof(p_plan->'workouts') is distinct from 'array'
    or jsonb_typeof(p_workouts) is distinct from 'array' then
    raise exception 'studio_strength_payload_invalid';
  end if;
  if jsonb_array_length(p_workouts) = 0
    or jsonb_array_length(p_workouts) <> jsonb_array_length(p_plan->'workouts')
    or exists (
      select 1 from jsonb_array_elements(p_workouts) as workout(item)
      where jsonb_typeof(item->'exercises') is distinct from 'array'
         or item->'exercises' = '[]'::jsonb
    ) then
    raise exception 'studio_strength_payload_invalid';
  end if;

  -- Serialize publishers, while allowing intercycle submission's foreign-key
  -- checks to take KEY SHARE on this enrollment while it holds the prior cycle.
  perform 1 from public.enrollments enrollment
  join public.training_cycles cycle on cycle.enrollment_id = enrollment.id
    and cycle.company_id = enrollment.company_id and cycle.student_id = enrollment.student_id
  where cycle.id = p_cycle_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and public.can_manage_staff_student(cycle.company_id, cycle.student_id)
    and public.company_feature_allowed(cycle.company_id, 'hasPrescription')
  for no key update of enrollment;
  if not found then
    raise exception 'studio_strength_forbidden';
  end if;

  select * into v_cycle from public.training_cycles where id = p_cycle_id for update;
  if not found or v_cycle.status in ('superseded', 'cancelled')
    or v_cycle.superseded_at is not null or v_cycle.superseded_by_cycle_id is not null then
    raise exception 'studio_strength_cycle_changed';
  end if;

  select * into v_draft from public.ai_strength_plans
    where id = p_draft_id and company_id = v_cycle.company_id and student_id = v_cycle.student_id
    for update;
  if not found then
    raise exception 'studio_strength_draft_changed';
  end if;

  select * into v_bundle from public.prescription_bundles
    where id = v_draft.bundle_id and training_cycle_id = v_cycle.id and has_strength
      and company_id = v_cycle.company_id and student_id = v_cycle.student_id
    for update;
  if not found then
    raise exception 'studio_strength_draft_changed';
  end if;

  -- Replay a confirmed operation after a lost response, while the revision is still current.
  if v_draft.training_cycle_id = v_cycle.id and v_bundle.strength_plan_id = v_draft.id
    and v_draft.plan = v_plan and v_draft.studio_publication is not null
    and v_draft.studio_publication->>'workouts_fingerprint' = md5(p_workouts::text)
    and not v_bundle.studio_strength_draft
    and v_cycle.bundle_id = v_bundle.id
    and v_cycle.start_date = (v_bundle.studio_strength_snapshot->>'start_date')::date
    and v_cycle.end_date = (v_bundle.studio_strength_snapshot->>'end_date')::date
    and not exists (
      select 1 from public.workouts
      where cycle_id = v_cycle.id and superseded_at is null
        and (revision_id is distinct from (v_draft.studio_publication->>'revision_id')::uuid
          or not exists (
            select 1 from jsonb_array_elements(v_draft.studio_publication->'workout_rows') receipt(row)
            where (receipt.row->>'id')::uuid = workouts.id
              and (receipt.row->>'updated_at')::timestamptz = workouts.updated_at
          ))
    )
    and (select count(*) from public.workouts where cycle_id = v_cycle.id and superseded_at is null)
      = (v_draft.studio_publication->>'workouts_created')::integer then
    return (v_draft.studio_publication - 'workouts_fingerprint' - 'workout_rows') || jsonb_build_object('replayed', true);
  end if;

  if v_draft.studio_draft_cycle_id is distinct from v_cycle.id
    or v_draft.updated_at is distinct from p_expected_draft_updated_at
    or not v_bundle.studio_strength_draft or v_bundle.status is distinct from 'draft'
    or v_bundle.strength_plan_id is not null then
    raise exception 'studio_strength_draft_changed';
  end if;

  if v_cycle.start_date is distinct from (v_bundle.studio_strength_snapshot->>'start_date')::date
    or v_cycle.end_date is distinct from (v_bundle.studio_strength_snapshot->>'end_date')::date
    or v_cycle.prescribed_offline_at is distinct from (v_bundle.studio_strength_snapshot->>'offline_at')::timestamptz
    or v_cycle.prescription_cleared_at is distinct from (v_bundle.studio_strength_snapshot->>'cleared_at')::timestamptz
    or v_cycle.prescription_cleared_event_id is distinct from (v_bundle.studio_strength_snapshot->>'clear_event_id')::uuid
    or v_cycle.bundle_id is distinct from (v_bundle.studio_strength_snapshot->>'bundle_id')::uuid then
    raise exception 'studio_strength_cycle_changed';
  end if;
  -- Match generation's previous-cycle scope. If legacy rows share the
  -- closest start date, consider every candidate instead of hiding a red flag.
  if v_cycle.cycle_number > 1 then
    select array(
      select prior.id from public.training_cycles prior
      where prior.enrollment_id = v_cycle.enrollment_id
        and prior.student_id = v_cycle.student_id and prior.company_id = v_cycle.company_id
        and prior.superseded_at is null and coalesce(prior.status, '') not in ('cancelled', 'superseded')
        and prior.start_date = (
          select max(candidate.start_date) from public.training_cycles candidate
          where candidate.enrollment_id = v_cycle.enrollment_id
            and candidate.student_id = v_cycle.student_id and candidate.company_id = v_cycle.company_id
            and candidate.superseded_at is null and coalesce(candidate.status, '') not in ('cancelled', 'superseded')
            and candidate.start_date < v_cycle.start_date
        )
      order by prior.id
      for update of prior
    ) into v_prior_cycle_ids;

    -- submit_intercycle_anamnesis locks this same cycle before saving its
    -- response. Use a separate read after acquiring the lock so a response
    -- that committed while this transaction waited is visible.
    if exists (
      select 1 from public.intercycle_anamneses answer
      where answer.company_id = v_cycle.company_id and answer.student_id = v_cycle.student_id
        and answer.enrollment_id = v_cycle.enrollment_id
        and answer.training_cycle_id = any(v_prior_cycle_ids)
        and answer.pain_present and answer.pain_eva > 5
    ) then
      raise exception 'studio_strength_intercycle_review_required';
    end if;
  end if;

  v_revision := public.replace_cycle_workout_revision(v_cycle.id, v_bundle.studio_strength_snapshot->'expected_rows', p_workouts);
  v_current := v_today between v_cycle.start_date and v_cycle.end_date;
  v_receipt := jsonb_build_object(
    'cycle_id', v_cycle.id, 'bundle_id', v_bundle.id, 'strength_plan_id', v_draft.id,
    'revision_id', v_revision->'revision_id', 'workouts_created', v_revision->'workouts_created',
    'scheduled', v_cycle.start_date > v_today, 'current', v_current,
    'workouts_fingerprint', md5(p_workouts::text), 'workout_rows', v_revision->'workout_rows'
  );

  -- Retain the old plan and its original bundle for audit. Only one plan can own the cycle.
  update public.ai_strength_plans
  set training_cycle_id = null, studio_superseded_cycle_id = v_cycle.id
  where training_cycle_id = v_cycle.id and company_id = v_cycle.company_id and student_id = v_cycle.student_id;

  update public.prescription_bundles
  set studio_strength_draft = false, strength_plan_id = v_draft.id, generation_error = null,
    status = case when v_current then 'active' else 'scheduled' end
  where id = v_bundle.id;

  update public.ai_strength_plans
  set training_cycle_id = v_cycle.id, studio_draft_cycle_id = null, plan = v_plan,
    cycle_name = coalesce(v_plan->>'cycle_name', v_draft.cycle_name), objective = v_plan->>'objective',
    studio_publication = v_receipt
  where id = v_draft.id;

  insert into public.prescription_bundle_items (bundle_id, company_id, student_id, modality, entity_type, entity_id)
  values
    (v_bundle.id, v_cycle.company_id, v_cycle.student_id, 'musculacao', 'ai_strength_plan', v_draft.id),
    (v_bundle.id, v_cycle.company_id, v_cycle.student_id, 'musculacao', 'training_cycle', v_cycle.id);

  if v_current then
    update public.training_cycles set status = 'completed'
    where enrollment_id = v_cycle.enrollment_id and id <> v_cycle.id and status = 'active';
  end if;

  update public.training_cycles
  set bundle_id = v_bundle.id, delivery_status = 'sent',
    status = case when v_current then 'active' when v_cycle.end_date < v_today then 'completed' else 'pending' end,
    name = coalesce(p_plan->>'cycle_name', 'Ciclo ' || v_cycle.cycle_number),
    objective = p_plan->>'objective',
    duration_weeks = coalesce(v_draft.duration_weeks, v_cycle.duration_weeks),
    prescribed_offline_at = null, prescribed_offline_by = null, prescribed_offline_note = null,
    prescription_cleared_at = null, prescription_cleared_by = null,
    prescription_cleared_reason = null, prescription_cleared_event_id = null, prescription_cleared_signature = null
  where id = v_cycle.id;

  -- Invalidate older ready strength drafts. Keep mixed bundles available for their other plans.
  update public.prescription_bundles
  set status = 'superseded'
  where training_cycle_id = v_cycle.id and company_id = v_cycle.company_id and student_id = v_cycle.student_id
    and id <> v_bundle.id and studio_strength_draft and status = 'draft'
    and not coalesce(has_cardio, false) and not coalesce(has_swimming, false)
    and not coalesce(has_cycling, false) and not coalesce(has_nutrition, false);

  -- A mixed bundle may still provide other modalities.
  update public.prescription_bundles
  set status = 'superseded'
  where training_cycle_id = v_cycle.id and company_id = v_cycle.company_id and student_id = v_cycle.student_id
    and id <> v_bundle.id and has_strength and not studio_strength_draft
    and not coalesce(has_cardio, false) and not coalesce(has_swimming, false)
    and not coalesce(has_cycling, false) and not coalesce(has_nutrition, false)
    and coalesce(modalities, '{}'::text[]) <@ array['musculacao']::text[]
    and status in ('active', 'scheduled');

  return (v_receipt - 'workouts_fingerprint' - 'workout_rows') || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.publish_studio_strength_draft(uuid, uuid, timestamptz, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.publish_studio_strength_draft(uuid, uuid, timestamptz, jsonb, jsonb)
  to authenticated;

-- A saved template starts the same private draft workflow as a generated plan.
create function public.stage_studio_strength_template(p_cycle_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cycle public.training_cycles%rowtype;
  v_plan jsonb;
  v_bundle_id uuid := gen_random_uuid();
  v_draft_id uuid := gen_random_uuid();
  v_version timestamptz;
begin
  select cycle.* into v_cycle
  from public.training_cycles cycle
  join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
    and enrollment.company_id = cycle.company_id and enrollment.student_id = cycle.student_id
  where cycle.id = p_cycle_id
    and enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and coalesce(cycle.status, '') not in ('superseded', 'cancelled')
    and cycle.superseded_at is null and cycle.superseded_by_cycle_id is null
    and public.can_manage_staff_student(cycle.company_id, cycle.student_id)
    and public.company_feature_allowed(cycle.company_id, 'hasPrescription');
  if not found then
    raise exception 'studio_strength_forbidden';
  end if;

  select plan into v_plan from public.cycle_templates
  where id = p_template_id and company_id = v_cycle.company_id;
  if jsonb_typeof(v_plan->'workouts') is distinct from 'array' then
    raise exception 'studio_strength_template_invalid';
  end if;

  insert into public.prescription_bundles (id, company_id, student_id, training_cycle_id, has_strength,
    has_cardio, has_swimming, has_cycling, has_nutrition, modalities, status, studio_strength_draft)
  values (v_bundle_id, v_cycle.company_id, v_cycle.student_id, v_cycle.id, true,
    false, false, false, false, array['musculacao'], 'draft', true);

  insert into public.ai_strength_plans (id, company_id, student_id, bundle_id, studio_draft_cycle_id,
    plan, duration_weeks)
  values (v_draft_id, v_cycle.company_id, v_cycle.student_id, v_bundle_id, v_cycle.id, v_plan, v_cycle.duration_weeks)
  returning updated_at into v_version;

  return jsonb_build_object(
    'id', v_draft_id, 'bundle_id', v_bundle_id, 'updated_at', v_version, 'plan', v_plan,
    'start_date', v_cycle.start_date, 'end_date', v_cycle.end_date
  );
end;
$$;

revoke all on function public.stage_studio_strength_template(uuid, uuid) from public, anon, service_role;
grant execute on function public.stage_studio_strength_template(uuid, uuid) to authenticated;
