-- Transactional canary for cycle-level prescription archive/restore.
--
-- Safe local usage when the required migrations are not permanently applied:
--   { printf 'begin;\n'; \
--     sed -n '14,55p' supabase/migrations/20260828023000_supersede_semantic_mfit_cycle_overlaps.sql; \
--     sed -n '5,13p' supabase/migrations/20260903234059_atomic_workout_revisions.sql; \
--     printf 'alter table public.running_plans add column if not exists name text;\n'; \
--     printf 'alter table public.nutrition_plans add column if not exists name text;\n'; \
--     cat \
--       supabase/migrations/20260908120000_archive_student_workouts.sql \
--       supabase/migrations/20260908152802_archive_student_cycle_prescription.sql \
--       scripts/cycle-prescription-archive-canary.sql; } \
--     | docker exec -i supabase_db_zshrcgbyhzxpnlccssyz \
--         psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- The two sed ranges are schema-only DDL from canonical migrations:
-- - 20260828023000_supersede_semantic_mfit_cycle_overlaps.sql
--   sha256 bb4f1f15fb7d5e1a39e9b14410dcf36d8bc518ee70f21b217a43b757c78bd8c8
-- - 20260903234059_atomic_workout_revisions.sql
--   sha256 24a8036eeb899dd08516502692d4f0058c5120531fe1b2ef48829654a595e351
-- The running_plans.name and nutrition_plans.name baseline columns come from
-- read-only live pg_catalog metadata reported by root on 2026-09-08:
-- nullable=false, default=null, type=text. They deliberately avoid
-- 20260828023000's internal COMMIT/data-repair block and the 20260903234059
-- DML that depends on the known-drift workout_exercises table.
--
-- This script creates only synthetic fixtures with fixed UUIDs and rolls
-- everything back. Do not adapt it to discover or mutate real students.

begin;
set local app.allow_cycle_archive_canary = 'on';

do $$
declare
  v_staff_id uuid := '00000000-0000-4000-8000-00000000a111'::uuid;
  v_other_staff_id uuid := '00000000-0000-4000-8000-00000000a222'::uuid;
  v_company_id uuid := '00000000-0000-4000-8000-00000000b111'::uuid;
  v_other_company_id uuid := '00000000-0000-4000-8000-00000000b222'::uuid;
  v_student_id uuid := '00000000-0000-4000-8000-00000000c111'::uuid;
  v_other_student_id uuid := '00000000-0000-4000-8000-00000000c222'::uuid;
  v_enrollment_id uuid := '00000000-0000-4000-8000-00000000d111'::uuid;
  v_other_enrollment_id uuid := '00000000-0000-4000-8000-00000000d222'::uuid;
  v_cycle_id uuid := '00000000-0000-4000-8000-00000000e111'::uuid;
  v_future_cycle_id uuid := '00000000-0000-4000-8000-00000000e222'::uuid;
  v_historical_cycle_id uuid := '00000000-0000-4000-8000-00000000e333'::uuid;
  v_workout_id uuid := '00000000-0000-4000-8000-00000000f111'::uuid;
  v_strength_id uuid := '00000000-0000-4000-8000-00000000f222'::uuid;
  v_running_id uuid := '00000000-0000-4000-8000-00000000f333'::uuid;
  v_nutrition_id uuid := '00000000-0000-4000-8000-00000000f444'::uuid;
  v_bundle_id uuid := '00000000-0000-4000-8000-00000000f555'::uuid;
  v_new_workout_id uuid := '00000000-0000-4000-8000-00000000f666'::uuid;
  v_draft_bundle_id uuid := '00000000-0000-4000-8000-00000000f667'::uuid;
  v_draft_strength_id uuid := '00000000-0000-4000-8000-00000000f668'::uuid;
  v_new_running_id uuid := '00000000-0000-4000-8000-00000000f669'::uuid;
  v_mismatch_workout_id uuid := '00000000-0000-4000-8000-00000000f670'::uuid;
  v_mismatch_running_id uuid := '00000000-0000-4000-8000-00000000f671'::uuid;
  v_future_running_id uuid := '00000000-0000-4000-8000-00000000f672'::uuid;
  v_future_bundle_id uuid := '00000000-0000-4000-8000-00000000f673'::uuid;
  v_historical_workout_id uuid := '00000000-0000-4000-8000-00000000f674'::uuid;
  v_historical_bundle_id uuid := '00000000-0000-4000-8000-00000000f675'::uuid;
  v_log_id uuid := '00000000-0000-4000-8000-00000000f777'::uuid;
  v_session_id uuid := '00000000-0000-4000-8000-00000000f888'::uuid;
  v_today date := public.current_business_date();
  v_original_cycle_start date;
  v_original_cycle_end date;
  v_preview jsonb;
  v_archive jsonb;
  v_restore jsonb;
  v_expected_signature text;
  v_clear_event_id uuid;
  v_failed boolean;
  v_missing_columns text;
begin
  if current_setting('app.allow_cycle_archive_canary', true) <> 'on' then
    raise exception 'Set app.allow_cycle_archive_canary=on in a transaction before running this canary.';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
  into v_missing_columns
  from (values
    ('training_cycles', 'prescription_cleared_at'),
    ('training_cycles', 'prescription_cleared_event_id'),
    ('training_cycles', 'prescription_cleared_signature'),
    ('training_cycles', 'superseded_by_cycle_id'),
    ('workouts', 'student_profile_archive_event_id'),
    ('workouts', 'superseded_at'),
    ('running_plans', 'status')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = required.table_name
      and actual.column_name = required.column_name
  );

  if v_missing_columns is not null then
    raise exception 'cycle_archive_canary_missing_schema=%', v_missing_columns;
  end if;

  -- Synthetic auth context only. No real learner, phone, email delivery,
  -- webhook, or external side effect is used by this canary.
  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values
    (v_staff_id, 'authenticated', 'authenticated', 'cycle-archive-staff@example.invalid', now(), now(), now()),
    (v_other_staff_id, 'authenticated', 'authenticated', 'cycle-archive-other@example.invalid', now(), now(), now())
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (v_staff_id, 'admin'::public.app_role)
  on conflict do nothing;

  insert into public.companies (id, name, slug, owner_id)
  values
    (v_company_id, 'Cycle Archive Canary', 'cycle-archive-canary', v_staff_id),
    (v_other_company_id, 'Cycle Archive Canary Other', 'cycle-archive-canary-other', v_other_staff_id)
  on conflict (id) do nothing;

  insert into public.company_members (company_id, user_id)
  values
    (v_company_id, v_staff_id),
    (v_other_company_id, v_other_staff_id)
  on conflict do nothing;

  insert into public.students (
    id, company_id, full_name, email, phone, status, assigned_trainer_id
  )
  values
    (v_student_id, v_company_id, 'Synthetic Cycle Archive Student', null, null, 'active', v_staff_id),
    (v_other_student_id, v_other_company_id, 'Synthetic Cross Tenant Student', null, null, 'active', null)
  on conflict (id) do nothing;

  insert into public.enrollments (
    id, company_id, student_id, trainer_id, status, start_date, end_date, training_start_date
  )
  values
    (v_enrollment_id, v_company_id, v_student_id, v_staff_id, 'active', v_today, v_today + 41, v_today),
    (v_other_enrollment_id, v_other_company_id, v_other_student_id, null, 'active', v_today, v_today + 41, v_today)
  on conflict (id) do nothing;

  delete from public.training_cycles
  where enrollment_id = v_enrollment_id
    and student_id = v_student_id
    and company_id = v_company_id;

  insert into public.training_cycles (
    id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date, status
  )
  values
    (v_historical_cycle_id, v_enrollment_id, v_company_id, v_student_id, 0, v_today - 84, v_today - 43, 'completed'),
    (v_cycle_id, v_enrollment_id, v_company_id, v_student_id, 1, v_today, v_today + 41, 'active'),
    (v_future_cycle_id, v_enrollment_id, v_company_id, v_student_id, 2, v_today + 42, v_today + 83, 'scheduled');

  select start_date, end_date
  into v_original_cycle_start, v_original_cycle_end
  from public.training_cycles
  where id = v_cycle_id;

  insert into public.ai_strength_plans (
    id, company_id, student_id, training_cycle_id, plan
  )
  values (
    v_strength_id, v_company_id, v_student_id, v_cycle_id,
    '{"workouts":[{"title":"Forca A","exercises":[{"name":"Agachamento"}]}]}'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.running_plans (
    id, company_id, student_id, training_cycle_id, name, sport, status, start_date, end_date, weeks
  )
  values (
    v_running_id, v_company_id, v_student_id, v_cycle_id, 'Corrida canário atual',
    'corrida', 'active', v_today, v_today + 41,
    '[{"week":1,"sessions":[{"title":"Z2"}]}]'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.nutrition_plans (
    id, company_id, student_id, training_cycle_id, name, plan_name, start_date, end_date, meals
  )
  values (
    v_nutrition_id, v_company_id, v_student_id, v_cycle_id,
    'Nutrição canário preservada', 'Nutrição preservada',
    v_today, v_today + 41, '[]'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.prescription_bundles (
    id, company_id, student_id, training_cycle_id, strength_plan_id, running_plan_id,
    nutrition_plan_id, has_strength, has_cardio, has_swimming, has_cycling,
    has_nutrition, modalities, status
  )
  values (
    v_bundle_id, v_company_id, v_student_id, v_cycle_id, v_strength_id, v_running_id,
    v_nutrition_id, true, true, false, false, true,
    array['musculacao','corrida','nutricao']::text[], 'active'
  )
  on conflict (id) do nothing;

  update public.ai_strength_plans
  set bundle_id = v_bundle_id
  where id = v_strength_id;

  update public.running_plans
  set bundle_id = v_bundle_id
  where id = v_running_id;

  update public.nutrition_plans
  set bundle_id = v_bundle_id
  where id = v_nutrition_id;

  insert into public.workouts (
    id, cycle_id, company_id, name, title, description, sort_order, day_of_week, exercises
  )
  values (
    v_workout_id, v_cycle_id, v_company_id, 'Treino A', 'Treino A', 'Synthetic canary workout',
    1, 1, '[{"name":"Agachamento","sets":3,"reps":"8"}]'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.workout_logs (
    id, workout_id, student_id, duration_minutes, notes, exercises_data,
    exercise_index, set_number, session_date
  )
  values (
    v_log_id, v_workout_id, v_student_id, 45, 'synthetic canary log',
    '[{"name":"Agachamento","completed":true}]'::jsonb,
    0, 1, v_today
  )
  on conflict (id) do nothing;

  insert into public.workout_sessions (
    id, student_id, workout_id, company_id, session_date, completed_at, status, exercises_summary
  )
  values (
    v_session_id, v_student_id, v_workout_id, v_company_id, v_today, now(), 'completed',
    '[{"name":"Agachamento"}]'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.workouts (
    id, cycle_id, company_id, name, title, description, sort_order, day_of_week, exercises
  )
  values (
    v_historical_workout_id, v_historical_cycle_id, v_company_id, 'Treino Histórico',
    'Treino Histórico', 'Synthetic historical workout', 1, 1,
    '[{"name":"Remada","sets":3,"reps":"10"}]'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.prescription_bundles (
    id, company_id, student_id, training_cycle_id, strength_plan_id, running_plan_id,
    nutrition_plan_id, has_strength, has_cardio, has_swimming, has_cycling,
    has_nutrition, modalities, status
  )
  values (
    v_historical_bundle_id, v_company_id, v_student_id, v_historical_cycle_id, null, null,
    null, true, false, false, false, false, array['musculacao']::text[], 'active'
  )
  on conflict (id) do nothing;

  -- Unauthenticated calls must fail closed.
  v_failed := false;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.preview_student_cycle_prescription_archive(v_student_id, v_cycle_id);
  exception when others then
    if sqlerrm = 'auth_required' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: unauthenticated preview was accepted.';
  end if;

  -- Cross-tenant/non-member staff must not preview or mutate the synthetic student.
  v_failed := false;
  perform set_config('request.jwt.claim.sub', v_other_staff_id::text, true);
  begin
    perform public.preview_student_cycle_prescription_archive(v_student_id, v_cycle_id);
  exception when others then
    if sqlerrm = 'forbidden_cross_tenant_cycle_prescription_preview' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: cross-tenant preview was accepted.';
  end if;

  v_failed := false;
  begin
    perform public.archive_student_cycle_prescription(
      v_student_id, v_cycle_id, 'bad-signature', array[v_workout_id], 'cross tenant canary'
    );
  exception when others then
    if sqlerrm = 'forbidden_cross_tenant_cycle_prescription_archive' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: cross-tenant archive was accepted.';
  end if;

  perform set_config('request.jwt.claim.sub', v_staff_id::text, true);

  v_preview := public.preview_student_cycle_prescription_archive(v_student_id, v_cycle_id);
  v_expected_signature := v_preview->>'content_signature';
  if nullif(v_expected_signature, '') is null then
    raise exception 'Canary failed: preview did not return content_signature.';
  end if;
  if jsonb_array_length(v_preview->'active_workout_ids') <> 1 then
    raise exception 'Canary failed: expected one active workout in preview, got %.', v_preview->'active_workout_ids';
  end if;

  v_failed := false;
  begin
    perform public.archive_student_cycle_prescription(
      v_student_id, v_cycle_id, null, array[v_workout_id], 'missing signature canary'
    );
  exception when others then
    if sqlerrm = 'cycle_prescription_signature_required' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: archive accepted a missing content signature.';
  end if;

  v_failed := false;
  begin
    perform public.archive_student_cycle_prescription(
      v_student_id, v_cycle_id, 'wrong-signature', array[v_workout_id], 'bad signature canary'
    );
  exception when others then
    if sqlerrm = 'cycle_prescription_content_changed_reload_before_clearing' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: archive accepted a stale/wrong content signature.';
  end if;

  -- Historical/ended cycles must be preserved. The cycle-level RPC is only for
  -- current or future prescriptions, so historical content/log lineage cannot
  -- be cleared accidentally.
  v_failed := false;
  begin
    perform public.preview_student_cycle_prescription_archive(v_student_id, v_historical_cycle_id);
  exception when others then
    if sqlerrm = 'only_current_or_future_cycles_can_be_cleared' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: historical cycle preview was accepted.';
  end if;

  v_failed := false;
  begin
    perform public.archive_student_cycle_prescription(
      v_student_id,
      v_historical_cycle_id,
      v_expected_signature,
      array[v_historical_workout_id],
      'historical cycle should stay immutable'
    );
  exception when others then
    if sqlerrm = 'only_current_or_future_cycles_can_be_cleared' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: historical cycle archive was accepted.';
  end if;
  if not exists (
    select 1
    from public.workouts
    where id = v_historical_workout_id
      and cycle_id = v_historical_cycle_id
      and superseded_at is null
      and student_profile_archive_event_id is null
  ) then
    raise exception 'Canary failed: historical workout was changed.';
  end if;
  if exists (
    select 1
    from public.training_cycles
    where id = v_historical_cycle_id
      and (
        prescription_cleared_at is not null
        or prescription_cleared_event_id is not null
        or prescription_cleared_signature is not null
      )
  ) then
    raise exception 'Canary failed: historical cycle marker changed.';
  end if;

  v_archive := public.archive_student_cycle_prescription(
    v_student_id,
    v_cycle_id,
    v_expected_signature,
    array[v_workout_id],
    'canary clear strength cardio only'
  );
  v_clear_event_id := (v_archive->>'clear_event_id')::uuid;

  if coalesce((v_archive->>'archived_workouts')::integer, 0) <> 1 then
    raise exception 'Canary failed: expected one archived workout, got %.', v_archive;
  end if;
  if coalesce((v_archive->>'detached_strength_plans')::integer, 0) <> 1 then
    raise exception 'Canary failed: expected one detached strength plan, got %.', v_archive;
  end if;
  if coalesce((v_archive->>'detached_running_plans')::integer, 0) <> 1 then
    raise exception 'Canary failed: expected one detached running plan, got %.', v_archive;
  end if;

  if exists (
    select 1 from public.workouts
    where id = v_workout_id
      and (superseded_at is null or student_profile_archive_event_id is null)
  ) then
    raise exception 'Canary failed: workout was not manually archived.';
  end if;
  if exists (
    select 1 from public.ai_strength_plans
    where id = v_strength_id and (training_cycle_id is not null or bundle_id is not null)
  ) then
    raise exception 'Canary failed: strength plan remained linked after archive.';
  end if;
  if exists (
    select 1 from public.running_plans
    where id = v_running_id
      and (
        training_cycle_id is not null
        or bundle_id is not null
        or coalesce(status, 'active') <> 'superseded'
        or end_date >= v_today
      )
  ) then
    raise exception 'Canary failed: running plan remained current after archive.';
  end if;

  if not exists (
    select 1 from public.nutrition_plans
    where id = v_nutrition_id
      and training_cycle_id = v_cycle_id
      and bundle_id = v_bundle_id
      and start_date = v_today
      and end_date = v_today + 41
      and name = 'Nutrição canário preservada'
      and plan_name = 'Nutrição preservada'
      and meals = '[]'::jsonb
  ) then
    raise exception 'Canary failed: nutrition plan was not preserved.';
  end if;
  if not exists (
    select 1
    from public.prescription_bundles
    where id = v_bundle_id
      and nutrition_plan_id = v_nutrition_id
      and strength_plan_id is null
      and running_plan_id is null
      and coalesce(has_strength, false) is false
      and coalesce(has_cardio, false) is false
      and coalesce(has_swimming, false) is false
      and coalesce(has_cycling, false) is false
      and coalesce(has_nutrition, false) is true
      and status = 'active'
      and modalities = array['nutricao']::text[]
  ) then
    raise exception 'Canary failed: mixed bundle did not preserve its nutrition-only state.';
  end if;

  if not exists (
    select 1
    from public.training_cycles
    where id = v_cycle_id
      and enrollment_id = v_enrollment_id
      and start_date = v_original_cycle_start
      and end_date = v_original_cycle_end
      and prescription_cleared_at is not null
      and prescription_cleared_event_id = v_clear_event_id
      and prescription_cleared_signature = v_expected_signature
  ) then
    raise exception 'Canary failed: cycle marker/dates/enrollment integrity check failed.';
  end if;
  if not exists (select 1 from public.workout_logs where id = v_log_id and workout_id = v_workout_id and student_id = v_student_id) then
    raise exception 'Canary failed: workout log was deleted or repointed.';
  end if;
  if not exists (select 1 from public.workout_sessions where id = v_session_id and workout_id = v_workout_id and student_id = v_student_id) then
    raise exception 'Canary failed: workout session was deleted or repointed.';
  end if;

  -- Restore must reject genuinely new active training content. The exception
  -- block rolls back the inserted content and reset-trigger side effects.
  v_failed := false;
  begin
    insert into public.workouts (
      id, cycle_id, company_id, name, title, sort_order, day_of_week, exercises
    )
    values (
      v_new_workout_id, v_cycle_id, v_company_id, 'Treino Novo', 'Treino Novo', 2, 2,
      '[{"name":"Supino","sets":3}]'::jsonb
    );

    perform public.restore_student_cycle_prescription(
      v_student_id, v_cycle_id, v_clear_event_id, 'canary restore conflict new content'
    );
  exception when others then
    if sqlerrm <> 'Canary failed: restore accepted new active content.' then
      v_failed := true;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: restore accepted new active content.';
  end if;

  -- Restore must also reject archived content that was changed/reused after the clear.
  v_failed := false;
  begin
    update public.prescription_bundles
    set has_cardio = true
    where id = v_bundle_id;

    perform public.restore_student_cycle_prescription(
      v_student_id, v_cycle_id, v_clear_event_id, 'canary restore conflict changed bundle'
    );
  exception when others then
    if sqlerrm = 'cycle_prescription_restore_conflict_archived_bundle_changed' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: restore accepted changed archived bundle content.';
  end if;

  v_restore := public.restore_student_cycle_prescription(
    v_student_id, v_cycle_id, v_clear_event_id, 'canary restore'
  );
  if coalesce((v_restore->>'restored_workouts')::integer, 0) <> 1 then
    raise exception 'Canary failed: expected one restored workout, got %.', v_restore;
  end if;
  if not exists (select 1 from public.workouts where id = v_workout_id and superseded_at is null and student_profile_archive_event_id is null) then
    raise exception 'Canary failed: workout was not restored to active manual state.';
  end if;
  if not exists (select 1 from public.ai_strength_plans where id = v_strength_id and training_cycle_id = v_cycle_id and bundle_id = v_bundle_id) then
    raise exception 'Canary failed: strength plan was not restored.';
  end if;
  if not exists (select 1 from public.running_plans where id = v_running_id and training_cycle_id = v_cycle_id and bundle_id = v_bundle_id and status = 'active') then
    raise exception 'Canary failed: running plan was not restored.';
  end if;
  if not exists (select 1 from public.prescription_bundles where id = v_bundle_id and training_cycle_id = v_cycle_id and status = 'active' and has_strength and has_cardio and has_nutrition) then
    raise exception 'Canary failed: bundle was not restored.';
  end if;
  if exists (
    select 1 from public.training_cycles
    where id = v_cycle_id
      and (
        prescription_cleared_at is not null
        or prescription_cleared_event_id is not null
        or prescription_cleared_signature is not null
      )
  ) then
    raise exception 'Canary failed: restore did not clear cycle marker.';
  end if;
  if not exists (select 1 from public.cycle_prescription_clear_events where id = v_clear_event_id and restored_at is not null) then
    raise exception 'Canary failed: restore did not close clear event.';
  end if;

  -- Re-clear and verify that a real new training insert atomically resets the
  -- marker/event through the trigger path used by manual/template/publication flows.
  v_preview := public.preview_student_cycle_prescription_archive(v_student_id, v_cycle_id);
  v_archive := public.archive_student_cycle_prescription(
    v_student_id,
    v_cycle_id,
    v_preview->>'content_signature',
    array[v_workout_id],
    'canary clear before new publication'
  );
  v_clear_event_id := (v_archive->>'clear_event_id')::uuid;

  -- SECURITY DEFINER reset trigger must not accept rows whose direct scope does
  -- not match the target cycle. A bad row must not clear the marker/event.
  v_failed := false;
  begin
    insert into public.workouts (
      id, cycle_id, company_id, name, title, sort_order, day_of_week, exercises
    )
    values (
      v_mismatch_workout_id, v_cycle_id, v_other_company_id,
      'Treino Escopo Errado', 'Treino Escopo Errado', 9, 1,
      '[{"name":"Supino","sets":3}]'::jsonb
    );
  exception when others then
    if sqlerrm in (
      'cycle_prescription_clear_marker_workout_cycle_company_mismatch',
      'workout company_id must match training cycle company_id'
    ) then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: mismatched workout reset trigger insert was accepted.';
  end if;
  if not exists (
    select 1
    from public.training_cycles
    where id = v_cycle_id
      and prescription_cleared_event_id = v_clear_event_id
      and prescription_cleared_at is not null
  ) then
    raise exception 'Canary failed: mismatched workout changed cleared marker.';
  end if;

  v_failed := false;
  begin
    insert into public.running_plans (
      id, company_id, student_id, training_cycle_id, name, sport, status, start_date, end_date, weeks
    )
    values (
      v_mismatch_running_id, v_company_id, v_other_student_id, v_cycle_id,
      'Corrida canário escopo errado', 'corrida', 'active',
      v_today, v_today + 41, '[{"week":1,"sessions":[{"title":"Bad scope"}]}]'::jsonb
    );
  exception when others then
    if sqlerrm in (
      'cycle_prescription_clear_marker_running_cycle_scope_mismatch',
      'Plan cycle/student/company mismatch'
    ) then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Canary failed: mismatched running reset trigger insert was accepted.';
  end if;
  if not exists (
    select 1
    from public.training_cycles
    where id = v_cycle_id
      and prescription_cleared_event_id = v_clear_event_id
      and prescription_cleared_at is not null
  ) then
    raise exception 'Canary failed: mismatched running plan changed cleared marker.';
  end if;

  -- Draft/generating/failed shells are not real publication. They must not
  -- resurrect a cleared prescription marker.
  begin
    insert into public.prescription_bundles (
      id, company_id, student_id, training_cycle_id, has_strength, has_cardio, modalities, status
    )
    values (
      v_draft_bundle_id, v_company_id, v_student_id, v_cycle_id, true, false,
      array['musculacao']::text[], 'generating'
    );

    if exists (
      select 1 from public.training_cycles
      where id = v_cycle_id
        and (
          prescription_cleared_at is null
          or prescription_cleared_event_id is distinct from v_clear_event_id
        )
    ) then
      raise exception 'Canary failed: draft/generating bundle reset the cleared marker.';
    end if;

    raise exception 'cycle_archive_canary_rollback_draft_bundle';
  exception when others then
    if sqlerrm <> 'cycle_archive_canary_rollback_draft_bundle' then
      raise;
    end if;
  end;

  begin
    insert into public.prescription_bundles (
      id, company_id, student_id, training_cycle_id, has_strength, has_cardio, modalities, status
    )
    values (
      v_draft_bundle_id, v_company_id, v_student_id, v_cycle_id, true, false,
      array['musculacao']::text[], 'failed'
    );

    if exists (
      select 1 from public.training_cycles
      where id = v_cycle_id
        and (
          prescription_cleared_at is null
          or prescription_cleared_event_id is distinct from v_clear_event_id
        )
    ) then
      raise exception 'Canary failed: failed bundle reset the cleared marker.';
    end if;

    raise exception 'cycle_archive_canary_rollback_failed_bundle';
  exception when others then
    if sqlerrm <> 'cycle_archive_canary_rollback_failed_bundle' then
      raise;
    end if;
  end;

  begin
    insert into public.ai_strength_plans (
      id, company_id, student_id, training_cycle_id, plan
    )
    values (
      v_draft_strength_id, v_company_id, v_student_id, v_cycle_id,
      '{"draft":true,"workouts":[]}'::jsonb
    );

    if exists (
      select 1 from public.training_cycles
      where id = v_cycle_id
        and (
          prescription_cleared_at is null
          or prescription_cleared_event_id is distinct from v_clear_event_id
        )
    ) then
      raise exception 'Canary failed: non-materialized strength plan reset the cleared marker.';
    end if;

    raise exception 'cycle_archive_canary_rollback_draft_strength';
  exception when others then
    if sqlerrm <> 'cycle_archive_canary_rollback_draft_strength' then
      raise;
    end if;
  end;

  -- A real materialized workout must reset the marker and close the clear event.
  begin
    insert into public.workouts (
      id, cycle_id, company_id, name, title, sort_order, day_of_week, exercises
    )
    values (
      v_new_workout_id, v_cycle_id, v_company_id, 'Treino Novo', 'Treino Novo', 2, 2,
      '[{"name":"Supino","sets":3}]'::jsonb
    );

    if exists (
      select 1 from public.training_cycles
      where id = v_cycle_id
        and (
          prescription_cleared_at is not null
          or prescription_cleared_event_id is not null
          or prescription_cleared_signature is not null
        )
    ) then
      raise exception 'Canary failed: materialized workout did not reset cleared marker.';
    end if;
    if not exists (
      select 1
      from public.cycle_prescription_clear_events
      where id = v_clear_event_id
        and restored_at is not null
        and restored_reason = 'new_training_content_created'
    ) then
      raise exception 'Canary failed: materialized workout did not close clear event.';
    end if;

    raise exception 'cycle_archive_canary_rollback_real_workout';
  exception when others then
    if sqlerrm <> 'cycle_archive_canary_rollback_real_workout' then
      raise;
    end if;
  end;

  -- Final cardio content is a real publication path and must reset the marker.
  insert into public.running_plans (
    id, company_id, student_id, training_cycle_id, name, sport, status, start_date, end_date, weeks
  )
  values (
    v_new_running_id, v_company_id, v_student_id, v_cycle_id,
    'Corrida canário publicação final', 'corrida', 'active',
    v_today, v_today + 41, '[{"week":1,"sessions":[{"title":"Cardio final"}]}]'::jsonb
  );

  if exists (
    select 1 from public.training_cycles
    where id = v_cycle_id
      and (
        prescription_cleared_at is not null
        or prescription_cleared_event_id is not null
        or prescription_cleared_signature is not null
      )
  ) then
    raise exception 'Canary failed: final cardio content did not reset cleared marker.';
  end if;
  if not exists (
    select 1
    from public.cycle_prescription_clear_events
    where id = v_clear_event_id
      and restored_at is not null
      and restored_reason = 'new_training_content_created'
  ) then
    raise exception 'Canary failed: new training content did not close clear event.';
  end if;

  -- A future cycle with only cardio/swimming content and no materialized
  -- workouts is still clearable by the panel-level cycle RPC. The current cycle
  -- must not be altered by clearing/restoring the future one.
  insert into public.running_plans (
    id, company_id, student_id, training_cycle_id, name, sport, status, start_date, end_date, weeks
  )
  values (
    v_future_running_id, v_company_id, v_student_id, v_future_cycle_id,
    'Natação canário futura', 'natacao', 'scheduled',
    v_today + 42, v_today + 83, '[{"week":1,"sessions":[{"title":"Natação técnica"}]}]'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.prescription_bundles (
    id, company_id, student_id, training_cycle_id, strength_plan_id, running_plan_id,
    nutrition_plan_id, has_strength, has_cardio, has_swimming, has_cycling,
    has_nutrition, modalities, status
  )
  values (
    v_future_bundle_id, v_company_id, v_student_id, v_future_cycle_id, null, v_future_running_id,
    null, false, false, true, false, false, array['natacao']::text[], 'scheduled'
  )
  on conflict (id) do nothing;

  update public.running_plans
  set bundle_id = v_future_bundle_id
  where id = v_future_running_id;

  v_preview := public.preview_student_cycle_prescription_archive(v_student_id, v_future_cycle_id);
  if jsonb_array_length(v_preview->'active_workout_ids') <> 0
    or coalesce((v_preview->>'active_bundles')::integer, -1) <> 1
    or coalesce((v_preview->>'active_running_plans')::integer, -1) <> 1 then
    raise exception 'Canary failed: future cardio-only preview mismatch: %.', v_preview;
  end if;

  v_archive := public.archive_student_cycle_prescription(
    v_student_id,
    v_future_cycle_id,
    v_preview->>'content_signature',
    '{}'::uuid[],
    'canary clear future cardio swimming only'
  );
  v_clear_event_id := (v_archive->>'clear_event_id')::uuid;
  if coalesce((v_archive->>'archived_workouts')::integer, -1) <> 0
    or coalesce((v_archive->>'detached_bundles')::integer, -1) <> 1
    or coalesce((v_archive->>'detached_running_plans')::integer, -1) <> 1 then
    raise exception 'Canary failed: future cardio-only archive mismatch: %.', v_archive;
  end if;
  if exists (
    select 1
    from public.running_plans
    where id = v_future_running_id
      and (
        training_cycle_id is not null
        or bundle_id is not null
        or coalesce(status, 'active') <> 'superseded'
        or end_date >= v_today
      )
  ) then
    raise exception 'Canary failed: future cardio-only running plan remained current.';
  end if;
  if exists (
    select 1
    from public.prescription_bundles
    where id = v_future_bundle_id
      and (
        training_cycle_id is not null
        or running_plan_id is not null
        or coalesce(has_cardio, false)
        or coalesce(has_swimming, false)
        or coalesce(has_cycling, false)
        or coalesce(modalities, '{}'::text[]) && array['corrida','natacao','ciclismo']::text[]
      )
  ) then
    raise exception 'Canary failed: future cardio-only bundle remained current.';
  end if;
  if exists (
    select 1
    from public.training_cycles
    where id = v_cycle_id
      and (
        start_date is distinct from v_original_cycle_start
        or end_date is distinct from v_original_cycle_end
      )
  ) then
    raise exception 'Canary failed: future clear altered the current cycle dates.';
  end if;

  v_restore := public.restore_student_cycle_prescription(
    v_student_id, v_future_cycle_id, v_clear_event_id, 'canary restore future cardio swimming only'
  );
  if coalesce((v_restore->>'restored_workouts')::integer, -1) <> 0
    or coalesce((v_restore->>'restored_bundles')::integer, -1) <> 1
    or coalesce((v_restore->>'restored_running_plans')::integer, -1) <> 1 then
    raise exception 'Canary failed: future cardio-only restore mismatch: %.', v_restore;
  end if;
  if not exists (
    select 1
    from public.running_plans
    where id = v_future_running_id
      and training_cycle_id = v_future_cycle_id
      and bundle_id = v_future_bundle_id
      and status = 'scheduled'
      and start_date = v_today + 42
      and end_date = v_today + 83
  ) then
    raise exception 'Canary failed: future cardio-only running plan was not restored.';
  end if;
  if not exists (
    select 1
    from public.prescription_bundles
    where id = v_future_bundle_id
      and training_cycle_id = v_future_cycle_id
      and running_plan_id = v_future_running_id
      and coalesce(has_swimming, false) is true
      and status = 'scheduled'
      and modalities = array['natacao']::text[]
  ) then
    raise exception 'Canary failed: future cardio-only bundle was not restored.';
  end if;

  raise notice 'Cycle prescription archive canary passed. Rolling back synthetic fixture.';
end
$$;

rollback;
select true as cycle_prescription_archive_canary_passed, true as all_changes_rolled_back;
