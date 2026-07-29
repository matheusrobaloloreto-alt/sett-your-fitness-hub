-- Separate staff tenant access from student membership.
-- Student accounts intentionally keep a company_members row so they can resolve
-- branding and the exercise catalog, but that row must never grant staff access.

create or replace function public.is_company_staff(_user_id uuid, _company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    _user_id is not null
    and _company_id is not null
    and (
      public.has_role(_user_id, 'master'::public.app_role)
      or (
        exists (
          select 1
          from public.company_members cm
          where cm.user_id = _user_id
            and cm.company_id = _company_id
        )
        and exists (
          select 1
          from public.user_roles ur
          where ur.user_id = _user_id
            and ur.role in (
              'admin'::public.app_role,
              'coordinator'::public.app_role,
              'trainer'::public.app_role
            )
        )
      )
    );
$$;
revoke all on function public.is_company_staff(uuid, uuid) from public;
grant execute on function public.is_company_staff(uuid, uuid) to authenticated, service_role;
create or replace function public.is_student_company_staff(_user_id uuid, _student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    where s.id = _student_id
      and public.is_company_staff(_user_id, s.company_id)
  );
$$;
revoke all on function public.is_student_company_staff(uuid, uuid) from public;
grant execute on function public.is_student_company_staff(uuid, uuid) to authenticated, service_role;
-- Core student, enrollment, billing and workout data.
drop policy if exists "Admin read students" on public.students;
drop policy if exists "company_members_read_students" on public.students;
drop policy if exists "Admin company insert" on public.students;
drop policy if exists "Admin company update" on public.students;
drop policy if exists "Admin company delete" on public.students;
create policy "Company staff manage students" on public.students
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.enrollments;
drop policy if exists "Admin company update" on public.enrollments;
drop policy if exists "Admin company delete" on public.enrollments;
drop policy if exists "Company scoped select" on public.enrollments;
create policy "Company staff manage enrollments" on public.enrollments
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.payments;
drop policy if exists "Admin company update" on public.payments;
drop policy if exists "Company scoped select" on public.payments;
create policy "Company staff manage payments" on public.payments
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own payments" on public.payments;
create policy "Student reads own payments" on public.payments
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = payments.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "Admin company insert" on public.training_cycles;
drop policy if exists "Admin company update" on public.training_cycles;
drop policy if exists "Admin company delete" on public.training_cycles;
drop policy if exists "Company scoped select" on public.training_cycles;
create policy "Company staff manage training cycles" on public.training_cycles
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.workouts;
drop policy if exists "Admin company update" on public.workouts;
drop policy if exists "Admin company delete" on public.workouts;
drop policy if exists "Company scoped select" on public.workouts;
create policy "Company staff manage workouts" on public.workouts
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.workout_sessions;
drop policy if exists "Admin company update" on public.workout_sessions;
drop policy if exists "Company scoped select" on public.workout_sessions;
create policy "Company staff manage workout sessions" on public.workout_sessions
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.workout_logs;
drop policy if exists "Admin company update" on public.workout_logs;
drop policy if exists "Company scoped select" on public.workout_logs;
create policy "Company staff manage workout logs" on public.workout_logs
for all to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = workout_logs.student_id
      and public.is_company_staff(auth.uid(), s.company_id)
  )
)
with check (
  exists (
    select 1 from public.students s
    where s.id = workout_logs.student_id
      and public.is_company_staff(auth.uid(), s.company_id)
  )
);
-- Anamnesis, assessments and student-owned health/progress records.
drop policy if exists "Admin company insert" on public.anamnesis;
drop policy if exists "Company scoped select" on public.anamnesis;
create policy "Company staff manage anamnesis" on public.anamnesis
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own anamnesis" on public.anamnesis;
create policy "Student reads own anamnesis" on public.anamnesis
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = anamnesis.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "anamneses_company_access" on public.student_anamneses;
create policy "Company staff manage student anamneses" on public.student_anamneses
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
-- Public submissions are handled by public-anamnesis with service_role after token validation.
drop policy if exists "anamneses_public_invite_insert" on public.student_anamneses;
drop policy if exists "anamneses_public_invite_update" on public.student_anamneses;
drop policy if exists "anamnesis_history_company_read" on public.student_anamnesis_history;
create policy "Company staff read anamnesis history" on public.student_anamnesis_history
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own anamnesis history" on public.student_anamnesis_history;
create policy "Student reads own anamnesis history" on public.student_anamnesis_history
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = student_anamnesis_history.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "invites_company_access" on public.anamnese_invites;
drop policy if exists "invites_public_complete" on public.anamnese_invites;
drop policy if exists "invites_public_pending_read" on public.anamnese_invites;
create policy "Company staff manage anamnesis invites" on public.anamnese_invites
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "students_public_invite_update" on public.students;
drop policy if exists "functional_assessments_company_access" on public.functional_assessments;
create policy "Company staff manage functional assessments" on public.functional_assessments
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own functional assessments" on public.functional_assessments;
create policy "Student reads own functional assessments" on public.functional_assessments
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = functional_assessments.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "assessment_frames_company_access" on public.assessment_frames;
create policy "Company staff manage assessment frames" on public.assessment_frames
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own assessment frames" on public.assessment_frames;
create policy "Student reads own assessment frames" on public.assessment_frames
for select to authenticated
using (
  exists (
    select 1
    from public.functional_assessments fa
    join public.students s on s.id = fa.student_id
    where fa.id = assessment_frames.assessment_id and s.user_id = auth.uid()
  )
);
drop policy if exists "Admin company insert" on public.student_evaluations;
drop policy if exists "Admin company update" on public.student_evaluations;
drop policy if exists "Admin company delete" on public.student_evaluations;
drop policy if exists "Company scoped select" on public.student_evaluations;
create policy "Company staff manage student evaluations" on public.student_evaluations
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own evaluations" on public.student_evaluations;
create policy "Student reads own evaluations" on public.student_evaluations
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = student_evaluations.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "body measurements company staff" on public.body_measurements;
create policy "Company staff manage body measurements" on public.body_measurements
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Company staff manage body limitations" on public.student_body_limitations;
create policy "Company staff manage body limitations" on public.student_body_limitations
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Company scoped select progress photos" on public.progress_photos;
create policy "Company staff read progress photos" on public.progress_photos
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "company staff manage student files" on public.student_files;
create policy "Company staff manage student files" on public.student_files
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "checkins_company_read" on public.student_checkins;
create policy "Company staff read checkins" on public.student_checkins
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "workout feedback company staff" on public.workout_feedback;
drop policy if exists "workout feedback company update" on public.workout_feedback;
create policy "Company staff read workout feedback" on public.workout_feedback
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
create policy "Company staff update workout feedback" on public.workout_feedback
for update to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "external activities company staff" on public.external_activities;
create policy "Company staff manage external activities" on public.external_activities
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
-- Deterministic/AI plans and the integrated prescription bundle.
drop policy if exists "ai_strength_plans_company_access" on public.ai_strength_plans;
create policy "Company staff manage strength plans" on public.ai_strength_plans
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own strength plans" on public.ai_strength_plans;
create policy "Student reads own strength plans" on public.ai_strength_plans
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = ai_strength_plans.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "plan_versions_company_access" on public.ai_plan_versions;
create policy "Company staff manage plan versions" on public.ai_plan_versions
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own plan versions" on public.ai_plan_versions;
create policy "Student reads own plan versions" on public.ai_plan_versions
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = ai_plan_versions.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "Admin read nutrition_plans" on public.nutrition_plans;
drop policy if exists "staff_nutrition_plans" on public.nutrition_plans;
create policy "Company staff manage nutrition plans" on public.nutrition_plans
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "staff_running_plans" on public.running_plans;
create policy "Company staff manage running plans" on public.running_plans
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "bundles_company_access" on public.prescription_bundles;
create policy "Company staff manage prescription bundles" on public.prescription_bundles
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Student reads own prescription bundles" on public.prescription_bundles;
create policy "Student reads own prescription bundles" on public.prescription_bundles
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = prescription_bundles.student_id and s.user_id = auth.uid()
  )
);
drop policy if exists "bundle items company staff" on public.prescription_bundle_items;
create policy "Company staff manage prescription bundle items" on public.prescription_bundle_items
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.prescription_bundles b
    where b.id = prescription_bundle_items.bundle_id
      and b.company_id = prescription_bundle_items.company_id
      and b.student_id = prescription_bundle_items.student_id
  )
);
drop policy if exists "company members manage ai config" on public.company_ai_config;
create policy "Company staff manage ai config" on public.company_ai_config
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Company members insert ai decision logs" on public.ai_decision_logs;
drop policy if exists "Company members read ai decision logs" on public.ai_decision_logs;
create policy "Company staff insert ai decision logs" on public.ai_decision_logs
for insert to authenticated
with check (public.is_company_staff(auth.uid(), company_id));
create policy "Company staff read ai decision logs" on public.ai_decision_logs
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
-- Operations and messaging are staff-only. Students must never browse tenant chats.
drop policy if exists "Admin company insert" on public.whatsapp_chats;
drop policy if exists "Admin company update" on public.whatsapp_chats;
drop policy if exists "Company scoped select" on public.whatsapp_chats;
create policy "Company staff manage whatsapp chats" on public.whatsapp_chats
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.whatsapp_messages;
drop policy if exists "Company scoped select" on public.whatsapp_messages;
create policy "Company staff manage whatsapp messages" on public.whatsapp_messages
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.whatsapp_instances;
drop policy if exists "Admin company update" on public.whatsapp_instances;
drop policy if exists "Company scoped select" on public.whatsapp_instances;
create policy "Company staff manage whatsapp instances" on public.whatsapp_instances
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.whatsapp_labels;
drop policy if exists "Admin company update" on public.whatsapp_labels;
drop policy if exists "Admin company delete" on public.whatsapp_labels;
drop policy if exists "Company scoped select" on public.whatsapp_labels;
create policy "Company staff manage whatsapp labels" on public.whatsapp_labels
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.whatsapp_chat_labels;
drop policy if exists "Admin company delete" on public.whatsapp_chat_labels;
drop policy if exists "Company scoped select" on public.whatsapp_chat_labels;
create policy "Company staff manage whatsapp chat labels" on public.whatsapp_chat_labels
for all to authenticated
using (
  exists (
    select 1 from public.whatsapp_chats c
    where c.id = whatsapp_chat_labels.chat_id
      and public.is_company_staff(auth.uid(), c.company_id)
  )
)
with check (
  exists (
    select 1 from public.whatsapp_chats c
    where c.id = whatsapp_chat_labels.chat_id
      and public.is_company_staff(auth.uid(), c.company_id)
  )
);
drop policy if exists "Admin company insert" on public.message_templates;
drop policy if exists "Admin company update" on public.message_templates;
drop policy if exists "Admin company delete" on public.message_templates;
drop policy if exists "Company scoped select" on public.message_templates;
create policy "Company staff manage message templates" on public.message_templates
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.automation_flows;
drop policy if exists "Admin company update" on public.automation_flows;
drop policy if exists "Admin company delete" on public.automation_flows;
drop policy if exists "Company scoped select" on public.automation_flows;
create policy "Company staff manage automation flows" on public.automation_flows
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'automation_flow_nodes',
    'automation_flow_edges',
    'automation_flow_steps',
    'flow_sessions'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'Admin company insert', target_table);
    execute format('drop policy if exists %I on public.%I', 'Admin company update', target_table);
    execute format('drop policy if exists %I on public.%I', 'Admin company delete', target_table);
    execute format('drop policy if exists %I on public.%I', 'Company scoped select', target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.automation_flows f where f.id = %I.flow_id and public.is_company_staff(auth.uid(), f.company_id))) with check (exists (select 1 from public.automation_flows f where f.id = %I.flow_id and public.is_company_staff(auth.uid(), f.company_id)))',
      'Company staff manage ' || replace(target_table, '_', ' '),
      target_table,
      target_table,
      target_table
    );
  end loop;
end
$$;
drop policy if exists "Company scoped select payment recovery events" on public.payment_recovery_events;
create policy "Company staff read payment recovery events" on public.payment_recovery_events
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.trainer_assignments_history;
drop policy if exists "Admin company update" on public.trainer_assignments_history;
drop policy if exists "Admin company delete" on public.trainer_assignments_history;
drop policy if exists "Company scoped select" on public.trainer_assignments_history;
create policy "Company staff manage trainer assignment history" on public.trainer_assignments_history
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.student_categories;
drop policy if exists "Admin company update" on public.student_categories;
drop policy if exists "Admin company delete" on public.student_categories;
drop policy if exists "Company scoped select" on public.student_categories;
create policy "Company staff manage student categories" on public.student_categories
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.role_permissions;
drop policy if exists "Admin company update" on public.role_permissions;
drop policy if exists "Company scoped select" on public.role_permissions;
create policy "Company staff manage role permissions" on public.role_permissions
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Company members insert" on public.company_exercise_volumes;
drop policy if exists "Company members update" on public.company_exercise_volumes;
drop policy if exists "Company members delete" on public.company_exercise_volumes;
drop policy if exists "Company scoped select" on public.company_exercise_volumes;
create policy "Company staff manage exercise volumes" on public.company_exercise_volumes
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Company scoped select achievements" on public.student_achievements;
create policy "Company staff read student achievements" on public.student_achievements
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Company scoped select xp" on public.xp_events;
create policy "Company staff read xp events" on public.xp_events
for select to authenticated
using (public.is_company_staff(auth.uid(), company_id));
-- Shared content remains readable by students, but only staff may mutate it.
drop policy if exists "Admin company insert own" on public.exercise_library;
drop policy if exists "Admin company update own" on public.exercise_library;
drop policy if exists "Admin company delete own" on public.exercise_library;
create policy "Company staff insert owned exercises" on public.exercise_library
for insert to authenticated
with check (
  not is_global and public.is_company_staff(auth.uid(), company_id)
);
create policy "Company staff update owned exercises" on public.exercise_library
for update to authenticated
using (not is_global and public.is_company_staff(auth.uid(), company_id))
with check (not is_global and public.is_company_staff(auth.uid(), company_id));
create policy "Company staff delete owned exercises" on public.exercise_library
for delete to authenticated
using (not is_global and public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Company users insert exercise targets" on public.exercise_muscle_targets;
drop policy if exists "Company users update exercise targets" on public.exercise_muscle_targets;
drop policy if exists "Company users delete exercise targets" on public.exercise_muscle_targets;
create policy "Company staff insert exercise targets" on public.exercise_muscle_targets
for insert to authenticated
with check (
  exists (
    select 1 from public.exercise_library el
    where el.id = exercise_muscle_targets.exercise_id
      and not el.is_global
      and public.is_company_staff(auth.uid(), el.company_id)
  )
);
create policy "Company staff update exercise targets" on public.exercise_muscle_targets
for update to authenticated
using (
  exists (
    select 1 from public.exercise_library el
    where el.id = exercise_muscle_targets.exercise_id
      and not el.is_global
      and public.is_company_staff(auth.uid(), el.company_id)
  )
)
with check (
  exists (
    select 1 from public.exercise_library el
    where el.id = exercise_muscle_targets.exercise_id
      and not el.is_global
      and public.is_company_staff(auth.uid(), el.company_id)
  )
);
create policy "Company staff delete exercise targets" on public.exercise_muscle_targets
for delete to authenticated
using (
  exists (
    select 1 from public.exercise_library el
    where el.id = exercise_muscle_targets.exercise_id
      and not el.is_global
      and public.is_company_staff(auth.uid(), el.company_id)
  )
);
drop policy if exists "Admin company insert own" on public.form_fields;
drop policy if exists "Admin company update own" on public.form_fields;
drop policy if exists "Admin company delete own" on public.form_fields;
create policy "Company staff insert form fields" on public.form_fields
for insert to authenticated
with check (company_id is not null and public.is_company_staff(auth.uid(), company_id));
create policy "Company staff update form fields" on public.form_fields
for update to authenticated
using (company_id is not null and public.is_company_staff(auth.uid(), company_id))
with check (company_id is not null and public.is_company_staff(auth.uid(), company_id));
create policy "Company staff delete form fields" on public.form_fields
for delete to authenticated
using (company_id is not null and public.is_company_staff(auth.uid(), company_id));
drop policy if exists "announcements company staff" on public.announcements;
create policy "Company staff manage announcements" on public.announcements
for all to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "announcement reads company staff" on public.announcement_reads;
create policy "Company staff read announcement receipts" on public.announcement_reads
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = announcement_reads.student_id
      and public.is_company_staff(auth.uid(), s.company_id)
  )
);
drop policy if exists "Admin company insert" on public.plans;
drop policy if exists "Admin company update" on public.plans;
drop policy if exists "Admin company delete" on public.plans;
create policy "Company staff insert plans" on public.plans
for insert to authenticated
with check (public.is_company_staff(auth.uid(), company_id));
create policy "Company staff update plans" on public.plans
for update to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
create policy "Company staff delete plans" on public.plans
for delete to authenticated
using (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin company insert" on public.platform_settings;
drop policy if exists "Admin company update" on public.platform_settings;
create policy "Company staff insert platform settings" on public.platform_settings
for insert to authenticated
with check (public.is_company_staff(auth.uid(), company_id));
create policy "Company staff update platform settings" on public.platform_settings
for update to authenticated
using (public.is_company_staff(auth.uid(), company_id))
with check (public.is_company_staff(auth.uid(), company_id));
drop policy if exists "Admin read profiles" on public.profiles;
drop policy if exists "Company profiles readable" on public.profiles;
create policy "Company staff read company profiles" on public.profiles
for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.user_id = profiles.user_id
      and public.is_company_staff(auth.uid(), cm.company_id)
  )
);
-- Storage writes and private operational media must also be staff-only.
drop policy if exists "Company staff reads progress photo objects" on storage.objects;
create policy "Company staff reads progress photo objects" on storage.objects
for select to authenticated
using (
  bucket_id = 'progress-photos'
  and exists (
    select 1 from public.progress_photos pp
    where pp.photo_path = objects.name
      and public.is_company_staff(auth.uid(), pp.company_id)
  )
);
drop policy if exists "assessment_frames_storage_insert" on storage.objects;
drop policy if exists "assessment_frames_storage_update" on storage.objects;
create policy "assessment_frames_storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
);
create policy "assessment_frames_storage_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
)
with check (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
);
drop policy if exists "company staff manage student-files objects" on storage.objects;
create policy "company staff manage student-files objects" on storage.objects
for all to authenticated
using (
  bucket_id = 'student-files'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
)
with check (
  bucket_id = 'student-files'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
drop policy if exists "auth_upload_exercises_videos" on storage.objects;
drop policy if exists "auth_update_exercises_videos" on storage.objects;
drop policy if exists "evaluations company read" on storage.objects;
drop policy if exists "evaluations company insert" on storage.objects;
drop policy if exists "evaluations company delete" on storage.objects;
create policy "evaluations company read" on storage.objects
for select to authenticated
using (
  bucket_id = 'evaluations'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "evaluations company insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'evaluations'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "evaluations company delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'evaluations'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
drop policy if exists "exercises-videos company insert" on storage.objects;
drop policy if exists "exercises-videos company update" on storage.objects;
drop policy if exists "exercises-videos company delete" on storage.objects;
create policy "exercises-videos company insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'exercises-videos'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "exercises-videos company update" on storage.objects
for update to authenticated
using (
  bucket_id = 'exercises-videos'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
)
with check (
  bucket_id = 'exercises-videos'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "exercises-videos company delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'exercises-videos'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
drop policy if exists "platform-assets company insert" on storage.objects;
drop policy if exists "platform-assets company update" on storage.objects;
drop policy if exists "platform-assets company delete" on storage.objects;
create policy "platform-assets company insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'platform-assets'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "platform-assets company update" on storage.objects
for update to authenticated
using (
  bucket_id = 'platform-assets'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
)
with check (
  bucket_id = 'platform-assets'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "platform-assets company delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'platform-assets'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
drop policy if exists "whatsapp-media company read" on storage.objects;
drop policy if exists "whatsapp-media company insert" on storage.objects;
drop policy if exists "whatsapp-media company delete" on storage.objects;
create policy "whatsapp-media company read" on storage.objects
for select to authenticated
using (
  bucket_id = 'whatsapp-media'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "whatsapp-media company insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'whatsapp-media'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
create policy "whatsapp-media company delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'whatsapp-media'
  and public.is_company_staff(auth.uid(), public.try_uuid((storage.foldername(name))[1]))
);
