-- Aggregate-only production audit for mixed, missing, or partially materialized workouts.
-- Never select names, contact data, notes, free text, or raw identifiers.

begin;
set transaction read only;

with target_company as (
  select id from public.companies where slug = 'bn-performance-training' limit 1
), eligible_students as (
  select student.id
  from public.students student
  join target_company company on company.id = student.company_id
  where student.status in ('active', 'awaiting_training', 'awaiting_renewal')
), current_cycles as (
  select cycle.id, cycle.student_id
  from public.training_cycles cycle
  join eligible_students student on student.id = cycle.student_id
  where cycle.status is distinct from 'superseded'
    and cycle.superseded_by_cycle_id is null
    and public.current_business_date() between cycle.start_date and cycle.end_date
), current_workout_counts as (
  select
    cycle.id as cycle_id,
    count(workout.id)::integer as workout_rows,
    count(workout.id) filter (
      where jsonb_typeof(workout.exercises) = 'array'
        and jsonb_array_length(workout.exercises) > 0
    )::integer as materialized_workouts
  from current_cycles cycle
  left join public.workouts workout on workout.cycle_id = cycle.id
  group by cycle.id
), company_workouts as (
  select workout.*
  from public.workouts workout
  join target_company company on company.id = workout.company_id
), exercise_slots as (
  select
    workout.id as workout_id,
    workout.company_id,
    slot.ordinality::integer - 1 as exercise_index,
    slot.exercise,
    nullif(slot.exercise ->> 'exercise_id', '') as exercise_id,
    nullif(slot.exercise ->> 'group_id', '') as group_id,
    nullif(slot.exercise ->> 'method', '') as method
  from company_workouts workout
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(workout.exercises) = 'array' then workout.exercises else '[]'::jsonb end
  ) with ordinality as slot(exercise, ordinality)
), group_shapes as (
  select
    workout_id,
    group_id,
    count(*)::integer as item_count,
    count(distinct method)::integer as method_count,
    min(exercise_index)::integer as first_index,
    max(exercise_index)::integer as last_index,
    max(method) as method
  from exercise_slots
  where group_id is not null
    and method in ('biset', 'triset', 'superset', 'giantset', 'circuito')
  group by workout_id, group_id
), invalid_groups as (
  select
    *,
    (last_index - first_index + 1 <> item_count) as non_contiguous,
    (
      (method in ('biset', 'superset') and item_count < 2)
      or (method in ('triset', 'circuito') and item_count < 3)
      or (method = 'giantset' and item_count < 4)
    ) as undersized
  from group_shapes
), relational_counts as (
  select exercise.workout_id, count(*)::integer as item_count
  from public.workout_exercises exercise
  join company_workouts workout on workout.id = exercise.workout_id
  group by exercise.workout_id
), json_counts as (
  select workout_id, count(*)::integer as item_count
  from exercise_slots
  group by workout_id
), projection_mismatches as (
  select workout.id
  from company_workouts workout
  where coalesce((select item_count from json_counts where workout_id = workout.id), 0)
      <> coalesce((select item_count from relational_counts where workout_id = workout.id), 0)
    or exists (
      select 1
      from public.workout_exercises exercise
      where exercise.workout_id = workout.id
        and not exists (
          select 1 from exercise_slots slot
          where slot.workout_id = exercise.workout_id
            and slot.exercise_index = exercise.exercise_order
            and slot.exercise_id = exercise.exercise_id::text
        )
    )
), company_bundles as (
  select bundle.*
  from public.prescription_bundles bundle
  join target_company company on company.id = bundle.company_id
), bundle_items as (
  select item.bundle_id, item.modality, count(*)::integer as item_count
  from public.prescription_bundle_items item
  join company_bundles bundle on bundle.id = item.bundle_id
  group by item.bundle_id, item.modality
), eligible_enrollments as (
  select
    enrollment.id as enrollment_id,
    enrollment.student_id,
    ceil(
      coalesce(greatest(plan.duration_days, plan.duration_weeks * 7, 0), 0)
      / greatest(coalesce(plan.cycle_duration_days, 42), 1)::numeric
    )::integer as expected_cycles
  from public.enrollments enrollment
  join public.plans plan on plan.id = enrollment.plan_id
  join eligible_students student on student.id = enrollment.student_id
  where enrollment.status in ('active', 'awaiting_training', 'awaiting_renewal')
), visible_cycle_positions as (
  select
    cycle.enrollment_id,
    cycle.id as cycle_id,
    row_number() over (
      partition by cycle.enrollment_id
      order by cycle.start_date, cycle.end_date, cycle.cycle_number, cycle.created_at, cycle.id
    ) as visible_position,
    enrollment.expected_cycles
  from eligible_enrollments enrollment
  join public.training_cycles cycle on cycle.enrollment_id = enrollment.enrollment_id
    and cycle.status <> 'superseded'
    and cycle.superseded_by_cycle_id is null
), visible_cycle_dependencies as (
  select
    visible.enrollment_id,
    visible.cycle_id,
    visible.visible_position,
    visible.expected_cycles,
    (
      exists (select 1 from public.workouts workout where workout.cycle_id = visible.cycle_id)
      or exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = visible.cycle_id)
      or exists (select 1 from public.ai_plan_versions version where version.cycle_id = visible.cycle_id)
      or exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = visible.cycle_id)
      or exists (select 1 from public.running_plans running where running.training_cycle_id = visible.cycle_id)
      or exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = visible.cycle_id)
      or exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = visible.cycle_id)
      or exists (
        select 1 from public.prescription_bundle_items item
        where item.entity_type = 'training_cycle'
          and item.entity_id = visible.cycle_id
      )
    ) as has_dependencies
  from visible_cycle_positions visible
), extra_visible_cycles as (
  select *
  from visible_cycle_dependencies
  where expected_cycles > 0
    and visible_position > expected_cycles
), overlapping_enrollments as (
  select distinct left_cycle.enrollment_id
  from public.training_cycles left_cycle
  join public.training_cycles right_cycle
    on right_cycle.enrollment_id = left_cycle.enrollment_id
   and right_cycle.id > left_cycle.id
   and right_cycle.status <> 'superseded'
   and right_cycle.superseded_by_cycle_id is null
   and left_cycle.start_date <= right_cycle.end_date
   and right_cycle.start_date <= left_cycle.end_date
  join public.enrollments enrollment on enrollment.id = left_cycle.enrollment_id
  join eligible_students student on student.id = enrollment.student_id
  where left_cycle.status <> 'superseded'
    and left_cycle.superseded_by_cycle_id is null
), current_cycle_summary as (
  select
    (select count(*) from eligible_students)::integer as eligible_students,
    count(*)::integer as current_cycles,
    count(distinct current_cycles.student_id)::integer as students_with_current_cycle,
    count(*) filter (where current_workout_counts.workout_rows = 0)::integer as cycles_without_workout_rows,
    count(*) filter (
      where current_workout_counts.workout_rows > 0 and current_workout_counts.materialized_workouts = 0
    )::integer as cycles_with_only_empty_workouts,
    count(distinct current_cycles.student_id) filter (
      where current_workout_counts.materialized_workouts = 0
    )::integer as students_without_materialized_current_workout
  from current_cycles
  join current_workout_counts on current_workout_counts.cycle_id = current_cycles.id
), workout_projection_summary as (
  select
    (select count(*) from company_workouts)::integer as workout_rows,
    (select count(*) from company_workouts where jsonb_typeof(exercises) is distinct from 'array')::integer as invalid_exercise_payloads,
    (select count(*) from company_workouts where jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) = 0)::integer as empty_workouts,
    (select count(*) from exercise_slots)::integer as exercise_slots,
    (select count(*) from exercise_slots where exercise_id is null)::integer as slots_without_exercise_id,
    (select count(*) from exercise_slots slot where slot.exercise_id is not null and not exists (
      select 1 from public.exercise_library library where library.id::text = slot.exercise_id
    ))::integer as slots_with_missing_library_reference,
    (select count(*) from exercise_slots slot where slot.exercise_id is not null and exists (
      select 1 from public.exercise_library library
      where library.id::text = slot.exercise_id
        and not library.is_global
        and library.company_id is distinct from slot.company_id
    ))::integer as slots_with_inaccessible_company_reference,
    (select count(*) from invalid_groups where non_contiguous)::integer as non_contiguous_method_groups,
    (select count(*) from invalid_groups where method_count > 1)::integer as inconsistent_method_groups,
    (select count(*) from invalid_groups where undersized)::integer as undersized_method_groups,
    (select count(*) from projection_mismatches)::integer as workouts_with_projection_mismatch,
    (select count(*) from public.workout_exercises exercise
      join company_workouts workout on workout.id = exercise.workout_id
      where exercise.exercise_order < 0)::integer as negative_relational_order,
    (select count(*) from (
      select exercise.workout_id, exercise.exercise_order
      from public.workout_exercises exercise
      join company_workouts workout on workout.id = exercise.workout_id
      group by exercise.workout_id, exercise.exercise_order
      having count(*) > 1
    ) duplicate_orders)::integer as duplicate_relational_orders
), cycle_duplication_summary as (
  select
    (select count(*) from eligible_enrollments)::integer as eligible_enrollments,
    (select count(distinct enrollment_id) from visible_cycle_positions)::integer as enrollments_with_visible_cycles,
    (select count(*) from eligible_enrollments enrollment where enrollment.expected_cycles > 0
      and not exists (select 1 from visible_cycle_positions visible
        where visible.enrollment_id = enrollment.enrollment_id))::integer as enrollments_without_visible_cycles,
    (select count(distinct enrollment_id) from overlapping_enrollments)::integer as enrollments_with_overlapping_cycles,
    (select count(distinct enrollment_id) from extra_visible_cycles)::integer as enrollments_above_expected_cycle_count,
    (select count(*) from extra_visible_cycles)::integer as extra_visible_cycles,
    (select count(*) from extra_visible_cycles where not has_dependencies)::integer as extra_empty_visible_cycles,
    (select count(*) from extra_visible_cycles where has_dependencies)::integer as extra_visible_cycles_with_dependencies
), repair_audit_summary as (
  select
    (select count(*) from public.training_cycle_empty_extra_repair_audit audit
      where audit.repair_key = 'extra_empty_training_cycles_20260903' and audit.state = 'applied')::integer
      as empty_cycle_audit_rows,
    (select count(*) from public.training_cycle_empty_extra_repair_audit audit
      join public.enrollments enrollment on enrollment.id = audit.enrollment_id
      join target_company company on company.id = enrollment.company_id
      where audit.repair_key = 'extra_empty_training_cycles_20260903' and audit.state = 'applied')::integer
      as empty_cycle_audit_rows_bn,
    (select count(*) from public.training_cycle_empty_extra_repair_audit audit
      join public.enrollments enrollment on enrollment.id = audit.enrollment_id
      where audit.repair_key = 'extra_empty_training_cycles_20260903' and audit.state = 'applied'
        and enrollment.company_id <> (select id from target_company))::integer as empty_cycle_audit_rows_other_tenants,
    (select count(*) from public.training_cycle_empty_extra_repair_audit audit
      where audit.repair_key = 'extra_empty_training_cycles_20260903' and audit.state = 'applied'
        and not exists (
          select 1 from public.training_cycles cycle
          join public.enrollments enrollment on enrollment.id = cycle.enrollment_id
          join target_company company on company.id = enrollment.company_id
          where cycle.id = audit.cycle_id
            and cycle.enrollment_id = audit.enrollment_id
            and cycle.status = 'superseded'
            and cycle.superseded_reason = 'extra_empty_cycle_quarantined_after_plan_duration_audit'
            and cycle.superseded_at is not null
            and nullif(cycle.superseded_by_cycle_id::text, '') is null
            and nullif(cycle.superseded_by::text, '') is null
            and cycle.superseded_previous_status is not distinct from audit.before_cycle->>'status'
            and (to_jsonb(cycle) - array[
              'updated_at', 'status', 'superseded_by_cycle_id', 'superseded_at',
              'superseded_by', 'superseded_previous_status', 'superseded_reason'
            ]) is not distinct from (audit.before_cycle - array[
              'updated_at', 'status', 'superseded_by_cycle_id', 'superseded_at',
              'superseded_by', 'superseded_previous_status', 'superseded_reason'
            ])
            and not exists (select 1 from public.workouts workout where workout.cycle_id = cycle.id)
            and not exists (select 1 from public.cycle_feedback feedback where feedback.cycle_id = cycle.id)
            and not exists (select 1 from public.ai_plan_versions version where version.cycle_id = cycle.id)
            and not exists (select 1 from public.ai_strength_plans strength where strength.training_cycle_id = cycle.id)
            and not exists (select 1 from public.running_plans running where running.training_cycle_id = cycle.id)
            and not exists (select 1 from public.nutrition_plans nutrition where nutrition.training_cycle_id = cycle.id)
            and not exists (select 1 from public.prescription_bundles bundle where bundle.training_cycle_id = cycle.id)
            and not exists (select 1 from public.prescription_bundle_items item
              where item.entity_type = 'training_cycle' and item.entity_id = cycle.id)
        ))::integer
      as invalid_empty_cycle_audit_rows,
    (select count(*) from public.workout_exercise_ref_repair_audit audit
      where audit.repair_key = 'unique_missing_exercise_refs_20260903' and audit.state = 'applied')::integer
      as exercise_ref_audit_rows,
    (select count(*) from public.workout_exercise_ref_repair_audit audit
      join public.exercise_library library on library.id = audit.new_exercise_id
      where audit.repair_key = 'unique_missing_exercise_refs_20260903' and audit.state = 'applied'
        and library.is_global)::integer as exercise_ref_repairs_global,
    (select count(*) from public.workout_exercise_ref_repair_audit audit
      join public.exercise_library library on library.id = audit.new_exercise_id
      join target_company company on company.id = library.company_id
      where audit.repair_key = 'unique_missing_exercise_refs_20260903' and audit.state = 'applied'
        and not library.is_global)::integer as exercise_ref_repairs_bn,
    (select count(*) from public.workout_exercise_ref_repair_audit audit
      join public.exercise_library library on library.id = audit.new_exercise_id
      where audit.repair_key = 'unique_missing_exercise_refs_20260903' and audit.state = 'applied'
        and not library.is_global
        and library.company_id is distinct from (select id from target_company))::integer
      as exercise_ref_repairs_other_tenants,
    (select count(*) from public.workout_exercise_ref_repair_audit audit
      where audit.repair_key = 'unique_missing_exercise_refs_20260903' and audit.state = 'applied'
        and not exists (
          select 1 from public.workouts workout
          join target_company company on company.id = workout.company_id
          join public.exercise_library library on library.id = audit.new_exercise_id
            and (library.is_global or library.company_id = workout.company_id)
          where workout.id = audit.workout_id
            and coalesce(workout.exercises -> audit.exercise_index ->> 'exercise_id', '') = audit.new_exercise_id::text
        ))::integer
      as invalid_exercise_ref_audit_rows
), bundle_summary as (
  select
    count(*)::integer as bundles_total,
    count(*) filter (where created_at >= now() - interval '30 days')::integer as bundles_last_30d,
    count(*) filter (where lower(coalesce(status, '')) in ('failed', 'error'))::integer as failed_bundles,
    count(*) filter (where generation_error is not null)::integer as bundles_with_generation_error,
    count(*) filter (where has_strength and strength_plan_id is null)::integer as strength_requested_without_plan,
    count(*) filter (where has_cardio and running_plan_id is null)::integer as cardio_requested_without_primary_plan,
    count(*) filter (where has_strength and not exists (
      select 1 from bundle_items item where item.bundle_id = company_bundles.id and item.modality = 'musculacao'
    ))::integer as strength_requested_without_item,
    count(*) filter (where has_cardio and not exists (
      select 1 from bundle_items item
      where item.bundle_id = company_bundles.id
        and item.modality in ('corrida', 'ciclismo', 'natacao')
    ))::integer as cardio_requested_without_item
  from company_bundles
)
select
  now() as audited_at,
  row_to_json(current_cycle_summary)::jsonb as current_cycles,
  row_to_json(workout_projection_summary)::jsonb as workout_projection,
  row_to_json(cycle_duplication_summary)::jsonb as cycle_duplication,
  row_to_json(repair_audit_summary)::jsonb as repair_audits,
  row_to_json(bundle_summary)::jsonb as prescription_bundles
from current_cycle_summary, workout_projection_summary, cycle_duplication_summary,
  repair_audit_summary, bundle_summary;

rollback;
