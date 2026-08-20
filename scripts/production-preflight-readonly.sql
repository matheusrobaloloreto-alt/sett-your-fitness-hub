\set ON_ERROR_STOP on

-- SETT/BN production preflight. This script is intentionally aggregate-only:
-- it returns no names, contacts, UUID values or free text. Run with a role that
-- can read the audited tables. Any attempted write fails at the transaction
-- boundary below.
begin;
set transaction read only;

select
  count(*)::bigint as students_total,
  count(*) filter (where status = 'active')::bigint as students_active
from public.students;

with guarded as (
  select 'ai_strength_plans' table_name, student_id, company_id from public.ai_strength_plans
  union all select 'anamnese_invites', student_id, company_id from public.anamnese_invites
  union all select 'anamnesis', student_id, company_id from public.anamnesis
  union all select 'body_measurements', student_id, company_id from public.body_measurements
  union all select 'cycle_feedback', student_id, company_id from public.cycle_feedback
  union all select 'enrollments', student_id, company_id from public.enrollments
  union all select 'external_activities', student_id, company_id from public.external_activities
  union all select 'functional_assessments', student_id, company_id from public.functional_assessments
  union all select 'nutrition_plans', student_id, company_id from public.nutrition_plans
  union all select 'payments', student_id, company_id from public.payments
  union all select 'prescription_bundles', student_id, company_id from public.prescription_bundles
  union all select 'running_plans', student_id, company_id from public.running_plans
  union all select 'student_anamneses', student_id, company_id from public.student_anamneses
  union all select 'student_evaluations', student_id, company_id from public.student_evaluations
  union all select 'student_body_limitations', student_id, company_id from public.student_body_limitations
  union all select 'student_files', student_id, company_id from public.student_files
  union all select 'student_goals', student_id, company_id from public.student_goals
  union all select 'student_achievements', student_id, company_id from public.student_achievements
  union all select 'ai_plan_versions', student_id, company_id from public.ai_plan_versions
  union all select 'trainer_assignments_history', student_id, company_id from public.trainer_assignments_history
  union all select 'ai_decision_logs', student_id, company_id from public.ai_decision_logs
  union all select 'student_checkins', student_id, company_id from public.student_checkins
  union all select 'workout_feedback', student_id, company_id from public.workout_feedback
  union all select 'workout_sessions', student_id, company_id from public.workout_sessions
  union all select 'xp_events', student_id, company_id from public.xp_events
)
select
  25::int as guarded_tables,
  count(*)::bigint as guarded_rows,
  count(*) filter (where company_id is null)::bigint as null_company_id,
  count(*) filter (where student_id is null)::bigint as null_student_id,
  count(*) filter (
    where student_id is not null
      and not exists (select 1 from public.students s where s.id = guarded.student_id)
  )::bigint as orphan_student_id,
  count(*) filter (
    where student_id is not null
      and not exists (
        select 1 from public.students s
        where s.id = guarded.student_id and s.company_id = guarded.company_id
      )
  )::bigint as student_company_mismatch
from guarded;

with reference_checks as (
  select 'cycle_feedback_enrollment' check_name, count(*)::bigint mismatches
  from public.cycle_feedback f
  where nullif(to_jsonb(f) ->> 'enrollment_id', '')::uuid is not null
    and not exists (
    select 1 from public.enrollments e
    where e.id = nullif(to_jsonb(f) ->> 'enrollment_id', '')::uuid
      and e.student_id = f.student_id and e.company_id = f.company_id
  )
  union all
  select 'cycle_feedback_cycle', count(*) from public.cycle_feedback f
  where f.cycle_id is not null and not exists (
    select 1 from public.training_cycles c
    where c.id = f.cycle_id and c.student_id = f.student_id and c.company_id = f.company_id
  )
  union all
  select 'workout_feedback_session', count(*) from public.workout_feedback f
  where f.workout_session_id is not null and not exists (
    select 1 from public.workout_sessions s
    where s.id = f.workout_session_id and s.student_id = f.student_id and s.company_id = f.company_id
  )
  union all
  select 'enrollment_plan', count(*) from public.enrollments e
  where e.plan_id is not null and not exists (
    select 1 from public.plans p where p.id = e.plan_id and p.company_id = e.company_id
  )
  union all
  select 'enrollment_trainer', count(*) from public.enrollments e
  where e.trainer_id is not null
    and not public.has_role(e.trainer_id, 'master'::public.app_role)
    and not exists (
      select 1 from public.company_members m
      where m.user_id = e.trainer_id and m.company_id = e.company_id
    )
  union all
  select 'payment_enrollment', count(*) from public.payments p
  where p.enrollment_id is not null and not exists (
    select 1 from public.enrollments e
    where e.id = p.enrollment_id and e.student_id = p.student_id and e.company_id = p.company_id
  )
  union all
  select 'student_file_path', count(*) from public.student_files f
  where split_part(f.file_path, '/', 1) is distinct from f.company_id::text
     or split_part(f.file_path, '/', 2) is distinct from f.student_id::text
  union all
  select 'plan_version_cycle', count(*) from public.ai_plan_versions v
  where v.cycle_id is not null and not exists (
    select 1 from public.training_cycles c
    where c.id = v.cycle_id and c.student_id = v.student_id and c.company_id = v.company_id
  )
  union all
  select 'workout_session_workout', count(*) from public.workout_sessions s
  where s.workout_id is not null and not exists (
    select 1 from public.workouts w
    join public.training_cycles c on c.id = w.cycle_id
    where w.id = s.workout_id and c.student_id = s.student_id
      and c.company_id = s.company_id and (w.company_id is null or w.company_id = s.company_id)
  )
)
select * from reference_checks order by check_name;

with plans as (
  select 'ai_strength_plans' table_name, id, student_id, company_id,
    anamnese_id, bundle_id, training_cycle_id, previous_plan_id
  from public.ai_strength_plans
  union all
  select 'running_plans', id, student_id, company_id,
    anamnese_id, bundle_id, training_cycle_id, previous_plan_id
  from public.running_plans
  union all
  select 'nutrition_plans', id, student_id, company_id,
    anamnese_id, bundle_id, training_cycle_id, previous_plan_id
  from public.nutrition_plans
)
select
  table_name,
  count(*) filter (
    where anamnese_id is not null and not exists (
      select 1 from public.student_anamneses a
      where a.id = plans.anamnese_id and a.student_id = plans.student_id and a.company_id = plans.company_id
    )
  )::bigint as anamnese_mismatch,
  count(*) filter (
    where bundle_id is not null and not exists (
      select 1 from public.prescription_bundles b
      where b.id = plans.bundle_id and b.student_id = plans.student_id and b.company_id = plans.company_id
    )
  )::bigint as bundle_mismatch,
  count(*) filter (
    where training_cycle_id is not null and not exists (
      select 1 from public.training_cycles c
      where c.id = plans.training_cycle_id and c.student_id = plans.student_id and c.company_id = plans.company_id
    )
  )::bigint as cycle_mismatch,
  count(*) filter (
    where previous_plan_id is not null and not exists (
      select 1 from plans previous
      where previous.table_name = plans.table_name and previous.id = plans.previous_plan_id
        and previous.student_id = plans.student_id and previous.company_id = plans.company_id
    )
  )::bigint as previous_plan_mismatch
from plans
group by table_name
order by table_name;

select
  count(*) filter (
    where b.anamnese_id is not null and not exists (
      select 1 from public.student_anamneses a
      where a.id = b.anamnese_id and a.student_id = b.student_id and a.company_id = b.company_id
    )
  )::bigint as anamnese_mismatch,
  count(*) filter (
    where b.assessment_id is not null and not exists (
      select 1 from public.functional_assessments a
      where a.id = b.assessment_id and a.student_id = b.student_id and a.company_id = b.company_id
    )
  )::bigint as assessment_mismatch,
  count(*) filter (
    where b.training_cycle_id is not null and not exists (
      select 1 from public.training_cycles c
      where c.id = b.training_cycle_id and c.student_id = b.student_id and c.company_id = b.company_id
    )
  )::bigint as cycle_mismatch,
  count(*) filter (
    where b.strength_plan_id is not null and not exists (
      select 1 from public.ai_strength_plans p
      where p.id = b.strength_plan_id and p.student_id = b.student_id and p.company_id = b.company_id
    )
  )::bigint as strength_plan_mismatch,
  count(*) filter (
    where b.running_plan_id is not null and not exists (
      select 1 from public.running_plans p
      where p.id = b.running_plan_id and p.student_id = b.student_id and p.company_id = b.company_id
    )
  )::bigint as running_plan_mismatch,
  count(*) filter (
    where b.nutrition_plan_id is not null and not exists (
      select 1 from public.nutrition_plans p
      where p.id = b.nutrition_plan_id and p.student_id = b.student_id and p.company_id = b.company_id
    )
  )::bigint as nutrition_plan_mismatch
from public.prescription_bundles b;

with trainer_refs as (
  select h.id, h.company_id, refs.user_id
  from public.trainer_assignments_history h
  cross join lateral (values (h.trainer_id), (h.previous_trainer_id), (h.changed_by)) refs(user_id)
  where refs.user_id is not null
    and not public.has_role(refs.user_id, 'master'::public.app_role)
    and not exists (
      select 1 from public.company_members m
      where m.user_id = refs.user_id and m.company_id = h.company_id
    )
)
select
  count(*)::bigint as invalid_field_occurrences,
  count(distinct id)::bigint as affected_history_rows,
  count(distinct user_id)::bigint as distinct_historical_users
from trainer_refs;

with frames as (
  select f.*,
    regexp_replace(f.image_url, '^.*/assessment-frames/', '') as object_name
  from public.assessment_frames f
)
select
  count(*)::bigint as frame_rows,
  count(*) filter (
    where split_part(object_name, '/', 1) = company_id::text
      and split_part(object_name, '/', 2) = assessment_id::text
  )::bigint as canonical_paths,
  count(*) filter (
    where exists (
      select 1 from storage.objects o
      where o.bucket_id = 'assessment-frames' and o.name = frames.object_name
    )
  )::bigint as matching_objects
from frames;

select
  count(*)::bigint as bucket_objects,
  count(*) filter (
    where not exists (
      select 1 from public.assessment_frames f
      where regexp_replace(f.image_url, '^.*/assessment-frames/', '') = o.name
    )
  )::bigint as unreferenced_objects
from storage.objects o
where o.bucket_id = 'assessment-frames';

rollback;
