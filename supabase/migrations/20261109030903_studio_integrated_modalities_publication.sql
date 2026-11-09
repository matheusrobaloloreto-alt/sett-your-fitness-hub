-- Stage the integrated plans outside the relations read by the student portal.
alter table public.prescription_bundles
  add column studio_modalities_draft boolean not null default false,
  add column studio_modalities_snapshot jsonb,
  add column studio_modalities_publication jsonb;

create table public.studio_modality_drafts (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.prescription_bundles(id) on delete cascade,
  modality text not null check (modality in ('corrida', 'natacao', 'ciclismo', 'nutricao')),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default clock_timestamp(),
  unique (bundle_id, modality)
);

alter table public.studio_modality_drafts enable row level security;
revoke all on public.studio_modality_drafts from public, anon, authenticated, service_role;
grant select (id, bundle_id, modality, plan, updated_at) on public.studio_modality_drafts to authenticated;
grant select on public.studio_modality_drafts to service_role;
create policy studio_modality_drafts_staff_read on public.studio_modality_drafts
  for select to authenticated using (exists (
    select 1 from public.prescription_bundles b where b.id = bundle_id
      and b.studio_modalities_draft and b.status in ('generating', 'draft')
      and public.can_manage_staff_student(b.company_id, b.student_id)
      and public.company_feature_allowed(b.company_id, 'hasPrescription')
  ));
create policy studio_modalities_bundle_visibility on public.prescription_bundles
  as restrictive for select to authenticated
  using (not studio_modalities_draft or public.can_manage_staff_student(company_id, student_id));

create function public.studio_live_modality_versions(p_cycle_id uuid, p_modalities text[])
returns jsonb language sql set search_path = '' as $$
  select coalesce(jsonb_object_agg(modality, jsonb_build_array(id, updated_at at time zone 'UTC')), '{}'::jsonb)
  from (
    select coalesce(r.sport, 'corrida') as modality, r.id, r.updated_at
    from public.running_plans r where r.training_cycle_id = p_cycle_id
      and coalesce(r.sport, 'corrida') = any(p_modalities)
    union all
    select 'nutricao', n.id, n.updated_at from public.nutrition_plans n
    where n.training_cycle_id = p_cycle_id and 'nutricao' = any(p_modalities)
  ) plans
$$;
revoke all on function public.studio_live_modality_versions(uuid, text[]) from public, anon, authenticated, service_role;

create function public.guard_studio_modalities_bundle()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_expected text[];
begin
  if tg_op = 'INSERT' then
    -- Mixed requests from a cached Studio client also use the staging path.
    new.studio_modalities_draft := new.studio_modalities_draft or (
      new.studio_strength_draft and (
        coalesce(new.has_cardio, false) or coalesce(new.has_swimming, false)
        or coalesce(new.has_cycling, false) or coalesce(new.has_nutrition, false)
        or not coalesce(new.modalities, '{}'::text[]) <@ array['musculacao']
      )
    ) or coalesce((
      -- The pre-migration Studio created a dated non-strength bundle without a marker.
      -- Legacy undated generators still use their existing live persistence.
      new.training_cycle_id is not null and new.status = 'generating'
      and new.has_strength is false and cardinality(new.modalities) > 0
      and new.modalities <@ array['corrida', 'natacao', 'ciclismo', 'nutricao']
    ), false);
    if new.studio_modalities_snapshot is not null or new.studio_modalities_publication is not null then
      raise exception 'studio_bundle_link_invalid';
    end if;
    if not new.studio_modalities_draft then return new; end if;

    v_expected := array_remove(array[
      case when new.has_strength then 'musculacao' end,
      case when new.has_cardio then 'corrida' end,
      case when new.has_swimming then 'natacao' end,
      case when new.has_cycling then 'ciclismo' end,
      case when new.has_nutrition then 'nutricao' end
    ], null);
    if not new.modalities @> v_expected or not new.modalities <@ v_expected
      or cardinality(new.modalities) is distinct from cardinality(v_expected)
      or v_expected <@ array['musculacao']
      or new.studio_strength_draft is distinct from coalesce(new.has_strength, false)
      or new.status is distinct from 'generating'
      or num_nonnulls(new.running_plan_id, new.nutrition_plan_id, new.strength_plan_id) <> 0 then
      raise exception 'studio_bundle_link_invalid';
    end if;
    select jsonb_build_object(
      'enrollment_id', c.enrollment_id, 'start_date', c.start_date, 'end_date', c.end_date,
      'offline_at', c.prescribed_offline_at, 'cleared_at', c.prescription_cleared_at,
      'clear_event_id', c.prescription_cleared_event_id, 'bundle_id', c.bundle_id,
      'plans', public.studio_live_modality_versions(c.id, new.modalities)
    ) into new.studio_modalities_snapshot
    from public.training_cycles c
    join public.enrollments e on e.id = c.enrollment_id and e.company_id = c.company_id and e.student_id = c.student_id
    where c.id = new.training_cycle_id and c.company_id = new.company_id and c.student_id = new.student_id
      and c.start_date is not null and c.end_date is not null
      and c.superseded_at is null and c.superseded_by_cycle_id is null and c.status not in ('cancelled', 'superseded')
      and e.status in ('active', 'awaiting_training', 'awaiting_renewal');
    if new.studio_modalities_snapshot is null then raise exception 'studio_strength_cycle_changed'; end if;
  elsif current_user in ('authenticated', 'anon', 'service_role') then
    if row(new.studio_modalities_draft, new.studio_modalities_snapshot, new.studio_modalities_publication)
       is distinct from row(old.studio_modalities_draft, old.studio_modalities_snapshot, old.studio_modalities_publication)
      or ((old.studio_modalities_draft or old.studio_strength_draft)
        and row(new.modalities, new.has_strength, new.has_cardio, new.has_swimming, new.has_cycling, new.has_nutrition)
         is distinct from row(old.modalities, old.has_strength, old.has_cardio, old.has_swimming, old.has_cycling, old.has_nutrition))
      or (old.studio_modalities_draft and (
        row(new.training_cycle_id, new.company_id, new.student_id, new.strength_plan_id, new.running_plan_id, new.nutrition_plan_id)
          is distinct from row(old.training_cycle_id, old.company_id, old.student_id, old.strength_plan_id, old.running_plan_id, old.nutrition_plan_id)
        or not coalesce(new.status in ('generating', 'draft', 'failed'), false)
        or (old.status = 'failed' and new.status is distinct from old.status)
        or (old.status = 'draft' and new.status not in ('draft', 'failed'))
      )) then
      raise exception 'studio_bundle_link_invalid';
    end if;
  end if;
  return new;
end;
$$;

-- Snapshot lookup needs to be callable by the trigger's invoker; protect it with
-- invoker RLS.
grant execute on function public.studio_live_modality_versions(uuid, text[]) to authenticated, service_role;
create trigger guard_studio_modalities_bundle before insert or update on public.prescription_bundles
for each row execute function public.guard_studio_modalities_bundle();

-- Reject stale or direct writers that try to attach live rows to a staged bundle.
create function public.guard_studio_live_modality_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.prescription_bundles b where b.id = new.bundle_id
    and (b.studio_modalities_draft or b.studio_strength_draft
      or (b.training_cycle_id is not null and b.status = 'generating'))) then
    raise exception 'studio_bundle_link_invalid';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_studio_live_modality_link() from public, anon, authenticated, service_role;
create trigger guard_studio_live_modality_link before insert or update of bundle_id on public.running_plans
for each row execute function public.guard_studio_live_modality_link();
create trigger guard_studio_live_modality_link before insert or update of bundle_id on public.nutrition_plans
for each row execute function public.guard_studio_live_modality_link();

-- Modality items become visible with their live plans at commit.
create function public.guard_studio_modality_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.modality in ('corrida', 'natacao', 'ciclismo', 'nutricao')
    and exists (select 1 from public.prescription_bundles b where b.id = new.bundle_id
      and (b.studio_modalities_draft or b.studio_strength_draft)) then
    raise exception 'studio_bundle_link_invalid';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_studio_modality_item() from public, anon, authenticated, service_role;
create trigger guard_studio_modality_item before insert or update on public.prescription_bundle_items
for each row execute function public.guard_studio_modality_item();

-- Only the authenticated generation/edit handlers may store their validated output.
-- Serialize edits and generation with publication on the bundle row.
create function public.write_studio_modality_draft(
  p_bundle_id uuid, p_cycle_id uuid, p_company_id uuid, p_student_id uuid,
  p_modality text, p_plan jsonb, p_payload jsonb,
  p_expected_updated_at timestamptz default null, p_draft_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_bundle public.prescription_bundles%rowtype;
  v_draft public.studio_modality_drafts%rowtype;
begin
  select * into v_bundle from public.prescription_bundles b where b.id = p_bundle_id
    and b.training_cycle_id = p_cycle_id and b.company_id = p_company_id and b.student_id = p_student_id
    and b.studio_modalities_draft and p_modality = any(b.modalities)
  for update;
  if not found then raise exception 'studio_bundle_changed'; end if;

  if p_draft_id is null and v_bundle.status = 'generating' then
    insert into public.studio_modality_drafts (bundle_id, modality, plan, payload)
    values (p_bundle_id, p_modality, p_plan, p_payload)
    on conflict (bundle_id, modality) do nothing;
    select * into strict v_draft from public.studio_modality_drafts
      where bundle_id = p_bundle_id and modality = p_modality;
  elsif p_draft_id is not null and v_bundle.status = 'draft' and p_modality <> 'nutricao' then
    update public.studio_modality_drafts set plan = p_plan, payload = payload || p_payload,
      updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
    where bundle_id = p_bundle_id and modality = p_modality and id = p_draft_id and updated_at = p_expected_updated_at
    returning * into v_draft;
    if not found then raise exception 'studio_bundle_changed'; end if;
  else
    raise exception 'studio_bundle_changed';
  end if;
  return jsonb_build_object('id', v_draft.id, 'updated_at', v_draft.updated_at, 'plan', v_draft.plan, 'draft_only', true);
end;
$$;
revoke all on function public.write_studio_modality_draft(uuid, uuid, uuid, uuid, text, jsonb, jsonb, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.write_studio_modality_draft(uuid, uuid, uuid, uuid, text, jsonb, jsonb, timestamptz, uuid)
  to service_role;

-- Keep the established force revision/clinical workflow callable only from
-- the two authorized publish entry points below.
alter function public.publish_studio_strength_draft(uuid, uuid, timestamptz, jsonb, jsonb)
  rename to publish_studio_strength_revision_internal;
revoke all on function public.publish_studio_strength_revision_internal(uuid, uuid, timestamptz, jsonb, jsonb)
  from public, anon, authenticated, service_role;

create function public.publish_studio_strength_draft(
  p_draft_id uuid, p_cycle_id uuid, p_expected_draft_updated_at timestamptz, p_plan jsonb, p_workouts jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'studio_strength_forbidden'; end if;
  if exists (
    select 1 from public.ai_strength_plans s join public.prescription_bundles b on b.id = s.bundle_id
    where s.id = p_draft_id and public.can_manage_staff_student(b.company_id, b.student_id)
      and (b.studio_modalities_snapshot is not null or coalesce(b.has_cardio, false) or coalesce(b.has_swimming, false)
        or coalesce(b.has_cycling, false) or coalesce(b.has_nutrition, false)
        or not coalesce(b.modalities, '{}'::text[]) <@ array['musculacao']
        or b.running_plan_id is not null or b.nutrition_plan_id is not null
        or exists (select 1 from public.prescription_bundle_items i where i.bundle_id = b.id
          and i.modality in ('corrida', 'natacao', 'ciclismo', 'nutricao')))
  ) then raise exception 'studio_bundle_requires_integrated_publish'; end if;
  return public.publish_studio_strength_revision_internal(
    p_draft_id, p_cycle_id, p_expected_draft_updated_at, p_plan, p_workouts
  );
end;
$$;

revoke all on function public.publish_studio_strength_draft(uuid, uuid, timestamptz, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.publish_studio_strength_draft(uuid, uuid, timestamptz, jsonb, jsonb) to authenticated;

create function public.publish_studio_integrated_bundle(
  p_bundle_id uuid, p_cycle_id uuid, p_expected_modalities jsonb,
  p_draft_id uuid default null, p_expected_draft_updated_at timestamptz default null,
  p_plan jsonb default null, p_workouts jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_enrollment_id uuid;
  v_cycle public.training_cycles%rowtype;
  v_bundle public.prescription_bundles%rowtype;
  v_snapshot jsonb;
  v_draft public.studio_modality_drafts%rowtype;
  v_running public.running_plans%rowtype;
  v_nutrition public.nutrition_plans%rowtype;
  v_running_id uuid;
  v_nutrition_id uuid;
  v_previous_plan_id uuid;
  v_versions jsonb;
  v_expected_versions jsonb;
  v_receipt jsonb;
  v_prior_ids uuid[];
  v_today date := public.current_business_date();
  v_current boolean;
  v_status text;
begin
  if auth.uid() is null then raise exception 'studio_strength_forbidden'; end if;
  select e.id into v_enrollment_id from public.enrollments e
  join public.training_cycles c on c.enrollment_id = e.id and c.company_id = e.company_id and c.student_id = e.student_id
  where c.id = p_cycle_id and e.status in ('active', 'awaiting_training', 'awaiting_renewal')
    and public.can_manage_staff_student(c.company_id, c.student_id)
    and public.company_feature_allowed(c.company_id, 'hasPrescription')
  for no key update of e;
  if not found then raise exception 'studio_strength_forbidden'; end if;

  select * into v_cycle from public.training_cycles where id = p_cycle_id for update;
  if not found or v_cycle.enrollment_id is distinct from v_enrollment_id
    or v_cycle.superseded_at is not null or v_cycle.superseded_by_cycle_id is not null
    or v_cycle.status in ('superseded', 'cancelled') then raise exception 'studio_strength_cycle_changed'; end if;

  select * into v_bundle from public.prescription_bundles b where b.id = p_bundle_id
    and b.training_cycle_id = v_cycle.id and b.company_id = v_cycle.company_id and b.student_id = v_cycle.student_id
    and b.studio_modalities_snapshot is not null
  for update;
  if not found then raise exception 'studio_bundle_changed'; end if;

  if jsonb_typeof(p_expected_modalities) is distinct from 'object' then
    raise exception 'studio_bundle_changed';
  end if;
  -- Normalize both ISO offset forms and retain sub-millisecond precision.
  select coalesce(jsonb_object_agg(modality, jsonb_build_object(
    'id', (version->>'id')::uuid, 'updated_at', (version->>'updated_at')::timestamptz at time zone 'UTC'
  )), '{}'::jsonb) into v_expected_versions
  from jsonb_each(p_expected_modalities) expected(modality, version);

  v_snapshot := v_bundle.studio_modalities_snapshot;
  if row(v_cycle.enrollment_id, v_cycle.start_date, v_cycle.end_date)
     is distinct from row((v_snapshot->>'enrollment_id')::uuid, (v_snapshot->>'start_date')::date, (v_snapshot->>'end_date')::date) then
    raise exception 'studio_strength_cycle_changed';
  end if;

  -- An exact retry receives the same receipt, provided the published content is still current.
  if v_bundle.studio_modalities_publication is not null then
    v_receipt := v_bundle.studio_modalities_publication;
    if v_cycle.bundle_id is distinct from (case when v_bundle.has_strength then p_bundle_id else (v_snapshot->>'bundle_id')::uuid end)
      or v_receipt->'expected_modalities' is distinct from v_expected_versions
      or v_receipt->'live_versions' is distinct from public.studio_live_modality_versions(v_cycle.id, v_bundle.modalities)
      or v_receipt->>'strength_plan_id' is distinct from p_draft_id::text then
      raise exception 'studio_bundle_changed';
    end if;
    if v_bundle.has_strength then
      perform public.publish_studio_strength_revision_internal(p_draft_id, p_cycle_id, p_expected_draft_updated_at, p_plan, p_workouts);
    end if;
    return (v_receipt - 'expected_modalities' - 'live_versions') || jsonb_build_object('replayed', true);
  end if;

  if not v_bundle.studio_modalities_draft or v_bundle.status is distinct from 'draft' then
    raise exception 'studio_bundle_incomplete';
  end if;
  if row(v_cycle.prescribed_offline_at, v_cycle.prescription_cleared_at, v_cycle.prescription_cleared_event_id, v_cycle.bundle_id)
    is distinct from row((v_snapshot->>'offline_at')::timestamptz, (v_snapshot->>'cleared_at')::timestamptz,
      (v_snapshot->>'clear_event_id')::uuid, (v_snapshot->>'bundle_id')::uuid) then
    raise exception 'studio_strength_cycle_changed';
  end if;

  select coalesce(jsonb_object_agg(d.modality, jsonb_build_object('id', d.id, 'updated_at', d.updated_at at time zone 'UTC')), '{}'::jsonb)
    into v_versions from public.studio_modality_drafts d where d.bundle_id = v_bundle.id;
  if not (v_versions ?& array_remove(v_bundle.modalities, 'musculacao'))
    or (select count(*) from jsonb_object_keys(v_versions)) <> cardinality(array_remove(v_bundle.modalities, 'musculacao'))
    or (coalesce(v_bundle.has_strength, false) <> (p_draft_id is not null)) then
    raise exception 'studio_bundle_incomplete';
  end if;
  if v_versions is distinct from v_expected_versions then raise exception 'studio_bundle_changed'; end if;

  -- Cardio legacy edits may also acquire a cycle lock via a trigger. Fail on
  -- contention instead of waiting while holding that cycle lock.
  perform 1 from public.running_plans r where r.training_cycle_id = v_cycle.id
    and coalesce(r.sport, 'corrida') = any(v_bundle.modalities) for update nowait;
  perform 1 from public.nutrition_plans n where n.training_cycle_id = v_cycle.id
    and 'nutricao' = any(v_bundle.modalities) for update nowait;
  if v_snapshot->'plans' is distinct from public.studio_live_modality_versions(v_cycle.id, v_bundle.modalities)
    or exists (select 1 from public.running_plans r where r.training_cycle_id = v_cycle.id
      and coalesce(r.sport, 'corrida') = any(v_bundle.modalities)
      and row(r.company_id, r.student_id) is distinct from row(v_cycle.company_id, v_cycle.student_id))
    or exists (select 1 from public.nutrition_plans n where n.training_cycle_id = v_cycle.id
      and 'nutricao' = any(v_bundle.modalities)
      and row(n.company_id, n.student_id) is distinct from row(v_cycle.company_id, v_cycle.student_id)) then
    raise exception 'studio_bundle_changed';
  end if;

  v_current := v_today between v_cycle.start_date and v_cycle.end_date;
  v_status := case when v_current then 'active' else 'scheduled' end;
  if v_bundle.has_strength then
    if not exists (select 1 from public.ai_strength_plans s where s.id = p_draft_id
      and s.bundle_id = p_bundle_id and s.studio_draft_cycle_id = p_cycle_id) then
      raise exception 'studio_bundle_incomplete';
    end if;
    v_receipt := public.publish_studio_strength_revision_internal(
      p_draft_id, p_cycle_id, p_expected_draft_updated_at, p_plan, p_workouts
    );
  else
    -- Apply the same latest previous-cycle pain gate even without a force plan.
    select array(
      select prior.id from public.training_cycles prior
      where prior.enrollment_id = v_cycle.enrollment_id and prior.company_id = v_cycle.company_id
        and prior.student_id = v_cycle.student_id and prior.superseded_at is null
        and coalesce(prior.status, '') not in ('cancelled', 'superseded')
        and prior.start_date = (
          select max(c.start_date) from public.training_cycles c
          where c.enrollment_id = v_cycle.enrollment_id and c.company_id = v_cycle.company_id
            and c.student_id = v_cycle.student_id and c.superseded_at is null
            and coalesce(c.status, '') not in ('cancelled', 'superseded') and c.start_date < v_cycle.start_date
        )
      order by prior.id for update of prior
    ) into v_prior_ids;
    if v_cycle.cycle_number > 1 and exists (
      select 1 from public.intercycle_anamneses a where a.enrollment_id = v_cycle.enrollment_id
        and a.company_id = v_cycle.company_id and a.student_id = v_cycle.student_id
        and a.training_cycle_id = any(v_prior_ids) and a.pain_present and a.pain_eva > 5
    ) then raise exception 'studio_strength_intercycle_review_required'; end if;
    v_receipt := jsonb_build_object('cycle_id', v_cycle.id, 'bundle_id', v_bundle.id, 'workouts_created', 0,
      'current', v_current, 'scheduled', v_cycle.start_date > v_today);
  end if;

  -- Clear the draft marker within the transaction before inserting live rows.
  update public.prescription_bundles set studio_modalities_draft = false, status = v_status, generation_error = null
    where id = v_bundle.id;

  for v_draft in select * from public.studio_modality_drafts where bundle_id = v_bundle.id order by modality
  loop
    v_previous_plan_id := (v_draft.payload->>'previous_plan_id')::uuid;
    if v_draft.modality = 'nutricao' then
      v_nutrition := jsonb_populate_record(null::public.nutrition_plans, v_draft.payload);
      if jsonb_typeof(v_nutrition.meals) is distinct from 'array' or v_nutrition.meals = '[]'::jsonb
        or coalesce(v_nutrition.target_calories, 0) <= 0 or coalesce(v_nutrition.target_protein_g, 0) <= 0
        or coalesce(v_nutrition.target_carbs_g, 0) <= 0 or coalesce(v_nutrition.target_fat_g, 0) <= 0 then
        raise exception 'studio_bundle_incomplete';
      end if;
      if not exists (select 1 from public.nutrition_plans where id = v_previous_plan_id
        and company_id = v_cycle.company_id and student_id = v_cycle.student_id) then v_previous_plan_id := null; end if;
      update public.nutrition_plans set training_cycle_id = null, status = 'superseded'
        where training_cycle_id = v_cycle.id;
      -- Nutrition is date-gated by both RLS and the student viewer.
      insert into public.nutrition_plans (
        id, company_id, student_id, name, plan_name, goal, target_calories, target_protein_g, target_carbs_g,
        target_fat_g, target_water_ml, total_calories, protein_g, carbs_g, fat_g, context_weight_kg,
        context_body_fat_pct, context_activity_level, context_dietary_restrictions, meals, ai_rationale,
        observations, anamnese_id, bundle_id, training_cycle_id, previous_plan_id, sequence_number,
        sequence_phase, start_date, end_date, status
      ) values (
        v_draft.id, v_cycle.company_id, v_cycle.student_id, v_nutrition.name, v_nutrition.plan_name,
        v_nutrition.goal, v_nutrition.target_calories, v_nutrition.target_protein_g, v_nutrition.target_carbs_g,
        v_nutrition.target_fat_g, v_nutrition.target_water_ml, v_nutrition.total_calories, v_nutrition.protein_g,
        v_nutrition.carbs_g, v_nutrition.fat_g, v_nutrition.context_weight_kg, v_nutrition.context_body_fat_pct,
        v_nutrition.context_activity_level, v_nutrition.context_dietary_restrictions, v_nutrition.meals,
        v_nutrition.ai_rationale, v_nutrition.observations, v_nutrition.anamnese_id, v_bundle.id, v_cycle.id,
        v_previous_plan_id, v_nutrition.sequence_number, v_nutrition.sequence_phase, v_cycle.start_date, v_cycle.end_date, 'active'
      );
      v_nutrition_id := v_draft.id;
    else
      v_running := jsonb_populate_record(null::public.running_plans, v_draft.payload);
      if v_running.sport is distinct from v_draft.modality
        or jsonb_typeof(v_running.weeks) is distinct from 'array' or v_running.weeks = '[]'::jsonb then
        raise exception 'studio_bundle_incomplete';
      end if;
      if not exists (select 1 from public.running_plans where id = v_previous_plan_id
        and company_id = v_cycle.company_id and student_id = v_cycle.student_id
        and coalesce(sport, 'corrida') = v_draft.modality) then v_previous_plan_id := null; end if;
      update public.running_plans set training_cycle_id = null, status = 'superseded'
        where training_cycle_id = v_cycle.id and coalesce(sport, 'corrida') = v_draft.modality;
      insert into public.running_plans (
        id, company_id, student_id, name, plan_name, sport, goal, weeks, fc_zones, safety_check, general_tips,
        warnings, complementary_strength, nutrition_alert, duration_weeks, model, anamnese_id, bundle_id,
        training_cycle_id, previous_plan_id, sequence_number, sequence_phase, start_date, end_date, status
      ) values (
        v_draft.id, v_cycle.company_id, v_cycle.student_id, v_running.name, v_running.plan_name, v_running.sport,
        v_running.goal, v_running.weeks, v_running.fc_zones, v_running.safety_check, v_running.general_tips,
        v_running.warnings, v_running.complementary_strength, v_running.nutrition_alert, v_running.duration_weeks,
        v_running.model, v_running.anamnese_id, v_bundle.id, v_cycle.id, v_previous_plan_id,
        v_running.sequence_number, v_running.sequence_phase, v_cycle.start_date, v_cycle.end_date, v_status
      );
      if v_running_id is null or v_draft.modality = 'corrida' then v_running_id := v_draft.id; end if;
    end if;
    insert into public.prescription_bundle_items (bundle_id, company_id, student_id, modality, entity_type, entity_id)
    values (v_bundle.id, v_cycle.company_id, v_cycle.student_id, v_draft.modality,
      case when v_draft.modality = 'nutricao' then 'nutrition_plan' else 'running_plan' end, v_draft.id);
  end loop;

  -- Keep a previously published bundle available if it still owns a modality
  -- outside the replacement set. Its item links and revisions remain auditable.
  update public.prescription_bundles b set status = 'superseded'
  where b.training_cycle_id = v_cycle.id and b.company_id = v_cycle.company_id and b.student_id = v_cycle.student_id
    and b.id <> v_bundle.id and b.status in ('active', 'scheduled')
    and not b.studio_strength_draft and not b.studio_modalities_draft
    and cardinality(b.modalities) > 0 and b.modalities <@ v_bundle.modalities
    and (not coalesce(b.has_strength, false) or v_bundle.has_strength)
    and (not coalesce(b.has_cardio, false) or v_bundle.has_cardio)
    and (not coalesce(b.has_swimming, false) or v_bundle.has_swimming)
    and (not coalesce(b.has_cycling, false) or v_bundle.has_cycling)
    and (not coalesce(b.has_nutrition, false) or v_bundle.has_nutrition);

  v_receipt := v_receipt || jsonb_build_object(
    'modalities', p_expected_modalities, 'replayed', false, 'expected_modalities', v_versions,
    'live_versions', public.studio_live_modality_versions(v_cycle.id, v_bundle.modalities)
  );
  update public.prescription_bundles set running_plan_id = v_running_id, nutrition_plan_id = v_nutrition_id,
    studio_modalities_publication = v_receipt where id = v_bundle.id;
  return v_receipt - 'expected_modalities' - 'live_versions';
exception when lock_not_available or unique_violation then
  raise exception 'studio_bundle_changed';
end;
$$;

revoke all on function public.publish_studio_integrated_bundle(uuid, uuid, jsonb, uuid, timestamptz, jsonb, jsonb)
  from public, anon, service_role;
grant execute on function public.publish_studio_integrated_bundle(uuid, uuid, jsonb, uuid, timestamptz, jsonb, jsonb)
  to authenticated;
