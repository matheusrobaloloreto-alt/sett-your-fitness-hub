-- RLS policies are OR-combined. The legacy "Company scoped" policies used
-- get_user_company_id(auth.uid()), which also resolves for student accounts;
-- keeping even one of them would bypass the later staff-only policies.

-- Fresh environments must include the two anthropometric fields already used
-- by the student portal and the atomic anamnesis submission function. They
-- existed in production through historical drift but were absent from the
-- migration ledger.
alter table public.students
  add column if not exists weight_kg numeric,
  add column if not exists height_cm numeric;

-- Students may read only their row. The portal still writes three self-service
-- preferences directly to this table, so preserve that call contract while a
-- trigger below prevents every other column from being changed by a student.
drop policy if exists "Company scoped select" on public.students;
drop policy if exists "Student updates own weekly goal" on public.students;
drop policy if exists "Student updates own allowed fields" on public.students;

-- Normalize master policies to authenticated instead of the implicit PUBLIC
-- target used by several historical migrations. The predicate was restrictive,
-- but keeping privileged policies out of PUBLIC makes the authorization surface
-- explicit and prevents anonymous callers from evaluating privileged helpers.
drop policy if exists "Master full access" on public.students;
create policy "Master full access"
on public.students for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));

create policy "Student updates own allowed fields"
on public.students for update to authenticated
using (students.user_id = auth.uid())
with check (students.user_id = auth.uid());

create or replace function public.prevent_student_self_privilege_escalation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = old.user_id
     and not public.is_company_staff(auth.uid(), old.company_id)
     and (
       to_jsonb(new) - array[
         'weekly_workout_goal', 'gender', 'height_cm', 'updated_at'
       ]::text[]
       is distinct from
       to_jsonb(old) - array[
         'weekly_workout_goal', 'gender', 'height_cm', 'updated_at'
       ]::text[]
     ) then
    raise exception 'Student self-service update contains a protected field'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_student_self_privilege_escalation()
from public, anon, authenticated;
drop trigger if exists zz_prevent_student_self_privilege_escalation
on public.students;
create trigger zz_prevent_student_self_privilege_escalation
before update on public.students
for each row execute function public.prevent_student_self_privilege_escalation();

-- Student anamnesis.
drop policy if exists "Company scoped select" on public.student_anamneses;
drop policy if exists "Company scoped insert" on public.student_anamneses;
drop policy if exists "Company scoped update" on public.student_anamneses;
drop policy if exists "Company scoped delete" on public.student_anamneses;
drop policy if exists "Company staff manage student anamneses" on public.student_anamneses;
drop policy if exists "Student reads own anamnese" on public.student_anamneses;
drop policy if exists "Master full access" on public.student_anamneses;
create policy "Master full access"
on public.student_anamneses for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage student anamneses"
on public.student_anamneses for all to authenticated
using (
  public.is_company_staff(auth.uid(), student_anamneses.company_id)
  and exists (select 1 from public.students s where s.id = student_anamneses.student_id and s.company_id = student_anamneses.company_id)
)
with check (
  public.is_company_staff(auth.uid(), student_anamneses.company_id)
  and exists (select 1 from public.students s where s.id = student_anamneses.student_id and s.company_id = student_anamneses.company_id)
);
create policy "Student reads own anamnese"
on public.student_anamneses for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = student_anamneses.student_id and s.company_id = student_anamneses.company_id and s.user_id = auth.uid()
));

-- Functional assessments and their private frames.
drop policy if exists "Company scoped select" on public.functional_assessments;
drop policy if exists "Company scoped insert" on public.functional_assessments;
drop policy if exists "Company scoped update" on public.functional_assessments;
drop policy if exists "Company scoped delete" on public.functional_assessments;
drop policy if exists "Company staff manage functional assessments" on public.functional_assessments;
drop policy if exists "Student reads own assessment" on public.functional_assessments;
drop policy if exists "Student reads own functional assessments" on public.functional_assessments;
drop policy if exists "Master full access" on public.functional_assessments;
create policy "Master full access"
on public.functional_assessments for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage functional assessments"
on public.functional_assessments for all to authenticated
using (
  public.is_company_staff(auth.uid(), functional_assessments.company_id)
  and exists (select 1 from public.students s where s.id = functional_assessments.student_id and s.company_id = functional_assessments.company_id)
)
with check (
  public.is_company_staff(auth.uid(), functional_assessments.company_id)
  and exists (select 1 from public.students s where s.id = functional_assessments.student_id and s.company_id = functional_assessments.company_id)
);
create policy "Student reads own functional assessments"
on public.functional_assessments for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = functional_assessments.student_id and s.company_id = functional_assessments.company_id and s.user_id = auth.uid()
));

drop policy if exists "assessment_frames company select" on public.assessment_frames;
drop policy if exists "assessment_frames company insert" on public.assessment_frames;
drop policy if exists "assessment_frames company update" on public.assessment_frames;
drop policy if exists "assessment_frames company delete" on public.assessment_frames;
drop policy if exists "Company staff manage assessment frames" on public.assessment_frames;
drop policy if exists "Student reads own assessment frames" on public.assessment_frames;
drop policy if exists "assessment_frames master full access" on public.assessment_frames;
drop policy if exists "Master full access" on public.assessment_frames;
create policy "assessment_frames master full access"
on public.assessment_frames for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage assessment frames"
on public.assessment_frames for all to authenticated
using (
  public.is_company_staff(auth.uid(), assessment_frames.company_id)
  and exists (
    select 1 from public.functional_assessments fa
    where fa.id = assessment_frames.assessment_id and fa.company_id = assessment_frames.company_id
  )
)
with check (
  public.is_company_staff(auth.uid(), assessment_frames.company_id)
  and exists (
    select 1 from public.functional_assessments fa
    where fa.id = assessment_frames.assessment_id and fa.company_id = assessment_frames.company_id
  )
);
create policy "Student reads own assessment frames"
on public.assessment_frames for select to authenticated
using (exists (
  select 1
  from public.functional_assessments fa
  join public.students s on s.id = fa.student_id and s.company_id = fa.company_id
  where fa.id = assessment_frames.assessment_id and fa.company_id = assessment_frames.company_id and s.user_id = auth.uid()
));

-- Plans and prescription packages.
drop policy if exists "Company scoped select" on public.running_plans;
drop policy if exists "Company scoped insert" on public.running_plans;
drop policy if exists "Company scoped update" on public.running_plans;
drop policy if exists "Company scoped delete" on public.running_plans;
drop policy if exists "Company staff manage running plans" on public.running_plans;
drop policy if exists "Student reads own running plan" on public.running_plans;
drop policy if exists "Student reads own running plans" on public.running_plans;
drop policy if exists "student_read_running_plans" on public.running_plans;
drop policy if exists "Master full access" on public.running_plans;
create policy "Master full access"
on public.running_plans for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage running plans"
on public.running_plans for all to authenticated
using (
  public.is_company_staff(auth.uid(), running_plans.company_id)
  and exists (select 1 from public.students s where s.id = running_plans.student_id and s.company_id = running_plans.company_id)
  and (
    running_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = running_plans.training_cycle_id
        and tc.student_id = running_plans.student_id
        and tc.company_id = running_plans.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), running_plans.company_id)
  and exists (select 1 from public.students s where s.id = running_plans.student_id and s.company_id = running_plans.company_id)
  and (
    running_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = running_plans.training_cycle_id
        and tc.student_id = running_plans.student_id
        and tc.company_id = running_plans.company_id
    )
  )
);
create policy "Student reads own running plans"
on public.running_plans for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = running_plans.student_id and s.company_id = running_plans.company_id and s.user_id = auth.uid()
  )
  and (
    running_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = running_plans.training_cycle_id
        and tc.student_id = running_plans.student_id
        and tc.company_id = running_plans.company_id
    )
  )
  and (start_date is null or start_date <= public.current_business_date())
);

drop policy if exists "Company scoped select" on public.ai_strength_plans;
drop policy if exists "Company scoped insert" on public.ai_strength_plans;
drop policy if exists "Company scoped update" on public.ai_strength_plans;
drop policy if exists "Company scoped delete" on public.ai_strength_plans;
drop policy if exists "Company staff manage strength plans" on public.ai_strength_plans;
drop policy if exists "Student reads own strength plan" on public.ai_strength_plans;
drop policy if exists "Student reads own strength plans" on public.ai_strength_plans;
drop policy if exists "Master full access" on public.ai_strength_plans;
create policy "Master full access"
on public.ai_strength_plans for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage strength plans"
on public.ai_strength_plans for all to authenticated
using (
  public.is_company_staff(auth.uid(), ai_strength_plans.company_id)
  and exists (select 1 from public.students s where s.id = ai_strength_plans.student_id and s.company_id = ai_strength_plans.company_id)
  and (
    ai_strength_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = ai_strength_plans.training_cycle_id
        and tc.student_id = ai_strength_plans.student_id
        and tc.company_id = ai_strength_plans.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), ai_strength_plans.company_id)
  and exists (select 1 from public.students s where s.id = ai_strength_plans.student_id and s.company_id = ai_strength_plans.company_id)
  and (
    ai_strength_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = ai_strength_plans.training_cycle_id
        and tc.student_id = ai_strength_plans.student_id
        and tc.company_id = ai_strength_plans.company_id
    )
  )
);
create policy "Student reads own strength plans"
on public.ai_strength_plans for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = ai_strength_plans.student_id and s.company_id = ai_strength_plans.company_id and s.user_id = auth.uid()
  )
  and (
    training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = ai_strength_plans.training_cycle_id
        and tc.student_id = ai_strength_plans.student_id
        and tc.company_id = ai_strength_plans.company_id
        and (tc.start_date is null or tc.start_date <= public.current_business_date())
    )
  )
);

drop policy if exists "nutrition_plans company select" on public.nutrition_plans;
drop policy if exists "nutrition_plans company insert" on public.nutrition_plans;
drop policy if exists "nutrition_plans company update" on public.nutrition_plans;
drop policy if exists "nutrition_plans company delete" on public.nutrition_plans;
drop policy if exists "Company staff manage nutrition plans" on public.nutrition_plans;
drop policy if exists "Student reads own nutrition plan" on public.nutrition_plans;
drop policy if exists "nutrition_plans student reads own" on public.nutrition_plans;
drop policy if exists "student_read_nutrition_plan" on public.nutrition_plans;
drop policy if exists "nutrition_plans master full access" on public.nutrition_plans;
drop policy if exists "Master full access" on public.nutrition_plans;
create policy "nutrition_plans master full access"
on public.nutrition_plans for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage nutrition plans"
on public.nutrition_plans for all to authenticated
using (
  public.is_company_staff(auth.uid(), nutrition_plans.company_id)
  and exists (select 1 from public.students s where s.id = nutrition_plans.student_id and s.company_id = nutrition_plans.company_id)
  and (
    nutrition_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = nutrition_plans.training_cycle_id
        and tc.student_id = nutrition_plans.student_id
        and tc.company_id = nutrition_plans.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), nutrition_plans.company_id)
  and exists (select 1 from public.students s where s.id = nutrition_plans.student_id and s.company_id = nutrition_plans.company_id)
  and (
    nutrition_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = nutrition_plans.training_cycle_id
        and tc.student_id = nutrition_plans.student_id
        and tc.company_id = nutrition_plans.company_id
    )
  )
);
create policy "Student reads own nutrition plan"
on public.nutrition_plans for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = nutrition_plans.student_id and s.company_id = nutrition_plans.company_id and s.user_id = auth.uid()
  )
  and (
    nutrition_plans.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = nutrition_plans.training_cycle_id
        and tc.student_id = nutrition_plans.student_id
        and tc.company_id = nutrition_plans.company_id
    )
  )
  and (start_date is null or start_date <= public.current_business_date())
);

drop policy if exists "Company scoped select" on public.prescription_bundles;
drop policy if exists "Company scoped insert" on public.prescription_bundles;
drop policy if exists "Company scoped update" on public.prescription_bundles;
drop policy if exists "Company scoped delete" on public.prescription_bundles;
drop policy if exists "Company staff manage prescription bundles" on public.prescription_bundles;
drop policy if exists "Student reads own prescription bundles" on public.prescription_bundles;
drop policy if exists "Master full access" on public.prescription_bundles;
create policy "Master full access"
on public.prescription_bundles for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage prescription bundles"
on public.prescription_bundles for all to authenticated
using (
  public.is_company_staff(auth.uid(), prescription_bundles.company_id)
  and exists (select 1 from public.students s where s.id = prescription_bundles.student_id and s.company_id = prescription_bundles.company_id)
  and (
    prescription_bundles.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = prescription_bundles.training_cycle_id
        and tc.student_id = prescription_bundles.student_id
        and tc.company_id = prescription_bundles.company_id
    )
  )
  and (
    prescription_bundles.assessment_id is null
    or exists (
      select 1 from public.functional_assessments fa
      where fa.id = prescription_bundles.assessment_id
        and fa.student_id = prescription_bundles.student_id
        and fa.company_id = prescription_bundles.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), prescription_bundles.company_id)
  and exists (select 1 from public.students s where s.id = prescription_bundles.student_id and s.company_id = prescription_bundles.company_id)
  and (
    prescription_bundles.training_cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = prescription_bundles.training_cycle_id
        and tc.student_id = prescription_bundles.student_id
        and tc.company_id = prescription_bundles.company_id
    )
  )
  and (
    prescription_bundles.assessment_id is null
    or exists (
      select 1 from public.functional_assessments fa
      where fa.id = prescription_bundles.assessment_id
        and fa.student_id = prescription_bundles.student_id
        and fa.company_id = prescription_bundles.company_id
    )
  )
);
create policy "Student reads own prescription bundles"
on public.prescription_bundles for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = prescription_bundles.student_id and s.company_id = prescription_bundles.company_id and s.user_id = auth.uid()
)
and (
  prescription_bundles.training_cycle_id is null
  or exists (
    select 1 from public.training_cycles tc
    where tc.id = prescription_bundles.training_cycle_id
      and tc.student_id = prescription_bundles.student_id
      and tc.company_id = prescription_bundles.company_id
  )
)
and (
  prescription_bundles.assessment_id is null
  or exists (
    select 1 from public.functional_assessments fa
    where fa.id = prescription_bundles.assessment_id
      and fa.student_id = prescription_bundles.student_id
      and fa.company_id = prescription_bundles.company_id
  )
));

-- Invite records are staff-only; public submission runs through a validated
-- server function rather than direct table access.
drop policy if exists "anamnese_invites company select" on public.anamnese_invites;
drop policy if exists "anamnese_invites company insert" on public.anamnese_invites;
drop policy if exists "anamnese_invites company update" on public.anamnese_invites;
drop policy if exists "anamnese_invites company delete" on public.anamnese_invites;
drop policy if exists "Company staff manage anamnesis invites" on public.anamnese_invites;
drop policy if exists "anamnese_invites master full access" on public.anamnese_invites;
drop policy if exists "Master full access" on public.anamnese_invites;
create policy "anamnese_invites master full access"
on public.anamnese_invites for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage anamnesis invites"
on public.anamnese_invites for all to authenticated
using (
  public.is_company_staff(auth.uid(), anamnese_invites.company_id)
  and exists (select 1 from public.students s where s.id = anamnese_invites.student_id and s.company_id = anamnese_invites.company_id)
)
with check (
  public.is_company_staff(auth.uid(), anamnese_invites.company_id)
  and exists (select 1 from public.students s where s.id = anamnese_invites.student_id and s.company_id = anamnese_invites.company_id)
);

-- Student-owned measurement/activity rows must carry the student's real
-- company_id; ownership of student_id alone is not enough for writes.
drop policy if exists "Company scoped select measurements" on public.body_measurements;
drop policy if exists "Student manages own measurements" on public.body_measurements;
drop policy if exists "body measurements student own" on public.body_measurements;
drop policy if exists "body measurements master" on public.body_measurements;
drop policy if exists "Master full access measurements" on public.body_measurements;
drop policy if exists "Master full access" on public.body_measurements;
drop policy if exists "Company staff manage body measurements" on public.body_measurements;
create policy "Master full access measurements"
on public.body_measurements for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage body measurements"
on public.body_measurements for all to authenticated
using (
  public.is_company_staff(auth.uid(), body_measurements.company_id)
  and exists (
    select 1 from public.students s
    where s.id = body_measurements.student_id and s.company_id = body_measurements.company_id
  )
)
with check (
  public.is_company_staff(auth.uid(), body_measurements.company_id)
  and exists (
    select 1 from public.students s
    where s.id = body_measurements.student_id and s.company_id = body_measurements.company_id
  )
);
create policy "Student manages own measurements"
on public.body_measurements for all to authenticated
using (exists (
  select 1 from public.students s
  where s.id = body_measurements.student_id and s.company_id = body_measurements.company_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = body_measurements.student_id and s.company_id = body_measurements.company_id and s.user_id = auth.uid()
));

drop policy if exists "Company members delete" on public.external_activities;
drop policy if exists "Company members insert" on public.external_activities;
drop policy if exists "Company members update" on public.external_activities;
drop policy if exists "Company scoped select" on public.external_activities;
drop policy if exists "Student deletes own activities" on public.external_activities;
drop policy if exists "Student inserts own activities" on public.external_activities;
drop policy if exists "Student reads own activities" on public.external_activities;
drop policy if exists "Student updates own activities" on public.external_activities;
drop policy if exists "Student manages own external activities" on public.external_activities;
drop policy if exists "external activities student own" on public.external_activities;
drop policy if exists "external activities master" on public.external_activities;
drop policy if exists "Master full access" on public.external_activities;
drop policy if exists "Company staff manage external activities" on public.external_activities;
create policy "Master full access"
on public.external_activities for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage external activities"
on public.external_activities for all to authenticated
using (
  public.is_company_staff(auth.uid(), external_activities.company_id)
  and exists (
    select 1 from public.students s
    where s.id = external_activities.student_id and s.company_id = external_activities.company_id
  )
)
with check (
  public.is_company_staff(auth.uid(), external_activities.company_id)
  and exists (
    select 1 from public.students s
    where s.id = external_activities.student_id and s.company_id = external_activities.company_id
  )
);
create policy "Student manages own external activities"
on public.external_activities for all to authenticated
using (exists (
  select 1 from public.students s
  where s.id = external_activities.student_id and s.company_id = external_activities.company_id and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = external_activities.student_id and s.company_id = external_activities.company_id and s.user_id = auth.uid()
));

drop policy if exists "Company members update" on public.workout_feedback;
drop policy if exists "Company scoped select" on public.workout_feedback;
drop policy if exists "Student inserts own workout feedback" on public.workout_feedback;
drop policy if exists "Student reads own workout feedback" on public.workout_feedback;
drop policy if exists "workout feedback student own" on public.workout_feedback;
drop policy if exists "workout feedback student read" on public.workout_feedback;
drop policy if exists "workout feedback master" on public.workout_feedback;
drop policy if exists "Master full access" on public.workout_feedback;
drop policy if exists "Company staff read workout feedback" on public.workout_feedback;
drop policy if exists "Company staff update workout feedback" on public.workout_feedback;
create policy "Master full access"
on public.workout_feedback for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff read workout feedback"
on public.workout_feedback for select to authenticated
using (
  public.is_company_staff(auth.uid(), workout_feedback.company_id)
  and exists (
    select 1 from public.students s
    where s.id = workout_feedback.student_id and s.company_id = workout_feedback.company_id
  )
  and (
    workout_feedback.workout_session_id is null
    or exists (
      select 1 from public.workout_sessions ws
      where ws.id = workout_feedback.workout_session_id
        and ws.student_id = workout_feedback.student_id
        and ws.company_id = workout_feedback.company_id
    )
  )
);
create policy "Company staff update workout feedback"
on public.workout_feedback for update to authenticated
using (
  public.is_company_staff(auth.uid(), workout_feedback.company_id)
  and exists (
    select 1 from public.students s
    where s.id = workout_feedback.student_id and s.company_id = workout_feedback.company_id
  )
  and (
    workout_feedback.workout_session_id is null
    or exists (
      select 1 from public.workout_sessions ws
      where ws.id = workout_feedback.workout_session_id
        and ws.student_id = workout_feedback.student_id
        and ws.company_id = workout_feedback.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), workout_feedback.company_id)
  and exists (
    select 1 from public.students s
    where s.id = workout_feedback.student_id and s.company_id = workout_feedback.company_id
  )
  and (
    workout_feedback.workout_session_id is null
    or exists (
      select 1 from public.workout_sessions ws
      where ws.id = workout_feedback.workout_session_id
        and ws.student_id = workout_feedback.student_id
        and ws.company_id = workout_feedback.company_id
    )
  )
);
create policy "Student reads own workout feedback"
on public.workout_feedback for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = workout_feedback.student_id and s.company_id = workout_feedback.company_id and s.user_id = auth.uid()
  )
  and (
    workout_feedback.workout_session_id is null
    or exists (
      select 1 from public.workout_sessions ws
      where ws.id = workout_feedback.workout_session_id
        and ws.student_id = workout_feedback.student_id
        and ws.company_id = workout_feedback.company_id
    )
  )
);
create policy "Student inserts own workout feedback"
on public.workout_feedback for insert to authenticated
with check (
  exists (
    select 1 from public.students s
    where s.id = workout_feedback.student_id and s.company_id = workout_feedback.company_id and s.user_id = auth.uid()
  )
  and (
    workout_feedback.workout_session_id is null
    or exists (
      select 1 from public.workout_sessions ws
      where ws.id = workout_feedback.workout_session_id
        and ws.student_id = workout_feedback.student_id
        and ws.company_id = workout_feedback.company_id
    )
  )
);

-- Policies from the pre-existing cycle_feedback table used the same unsafe
-- company lookup and survived the first hardening pass under different names.
drop policy if exists "Company members update" on public.cycle_feedback;
drop policy if exists "Company scoped select" on public.cycle_feedback;
drop policy if exists "Master full access" on public.cycle_feedback;
drop policy if exists "Student inserts own cycle feedback" on public.cycle_feedback;
drop policy if exists "Student reads own cycle feedback" on public.cycle_feedback;

-- Legacy anamnesis table kept for historical records.
drop policy if exists "Company scoped update" on public.anamnesis;
drop policy if exists "Company scoped delete" on public.anamnesis;
drop policy if exists "Company staff manage anamnesis" on public.anamnesis;
drop policy if exists "Student reads own anamnesis" on public.anamnesis;
drop policy if exists "Master full access" on public.anamnesis;
create policy "Master full access"
on public.anamnesis for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage anamnesis"
on public.anamnesis for all to authenticated
using (
  public.is_company_staff(auth.uid(), anamnesis.company_id)
  and exists (select 1 from public.students s where s.id = anamnesis.student_id and s.company_id = anamnesis.company_id)
)
with check (
  public.is_company_staff(auth.uid(), anamnesis.company_id)
  and exists (select 1 from public.students s where s.id = anamnesis.student_id and s.company_id = anamnesis.company_id)
);
create policy "Student reads own anamnesis"
on public.anamnesis for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = anamnesis.student_id and s.company_id = anamnesis.company_id and s.user_id = auth.uid()
));

-- A receipt belongs to both a student and an announcement in the same tenant.
drop policy if exists "Company scoped select reads" on public.announcement_reads;
drop policy if exists "Student manages own reads" on public.announcement_reads;
drop policy if exists "announcement reads master" on public.announcement_reads;
drop policy if exists "announcement reads student own" on public.announcement_reads;
drop policy if exists "announcement reads company staff" on public.announcement_reads;
drop policy if exists "Company staff read announcement receipts" on public.announcement_reads;
drop policy if exists "Master full access" on public.announcement_reads;

create policy "announcement reads master"
on public.announcement_reads for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));

create policy "announcement reads student own"
on public.announcement_reads for all to authenticated
using (exists (
  select 1
  from public.students s
  join public.announcements a on a.id = announcement_reads.announcement_id
  where s.id = announcement_reads.student_id
    and s.user_id = auth.uid()
    and s.company_id = a.company_id
))
with check (exists (
  select 1
  from public.students s
  join public.announcements a on a.id = announcement_reads.announcement_id
  where s.id = announcement_reads.student_id
    and s.user_id = auth.uid()
    and s.company_id = a.company_id
));

create policy "Company staff read announcement receipts"
on public.announcement_reads for select to authenticated
using (exists (
  select 1
  from public.students s
  join public.announcements a on a.id = announcement_reads.announcement_id
  where s.id = announcement_reads.student_id
    and s.company_id = a.company_id
    and public.is_company_staff(auth.uid(), s.company_id)
));

-- Old storage write/delete policies also used get_user_company_id and were OR'd
-- with the current staff-only policies installed in 20260718122000.
drop policy if exists "assessment-frames company insert" on storage.objects;
drop policy if exists "assessment-frames company update" on storage.objects;
drop policy if exists "assessment-frames company delete" on storage.objects;
drop policy if exists "assessment-frames company read" on storage.objects;
drop policy if exists "assessment_frames_storage_read" on storage.objects;
drop policy if exists "assessment_frames_storage_insert" on storage.objects;
drop policy if exists "assessment_frames_storage_update" on storage.objects;
drop policy if exists "assessment_frames_storage_delete" on storage.objects;
drop policy if exists "assessment_frames_storage_master" on storage.objects;

-- Assessment media paths are <company>/<assessment>/<file>. Prove both path
-- components against the relational assessment before allowing storage access.
create policy "assessment_frames_storage_master"
on storage.objects for all to authenticated
using (
  bucket_id = 'assessment-frames'
  and public.has_role(auth.uid(), 'master'::public.app_role)
)
with check (
  bucket_id = 'assessment-frames'
  and public.has_role(auth.uid(), 'master'::public.app_role)
);

create policy "assessment_frames_storage_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
  and exists (
    select 1 from public.functional_assessments fa
    where fa.id = public.try_uuid(split_part(name, '/', 2))
      and fa.company_id = public.try_uuid(split_part(name, '/', 1))
  )
);

create policy "assessment_frames_storage_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
  and exists (
    select 1 from public.functional_assessments fa
    where fa.id = public.try_uuid(split_part(name, '/', 2))
      and fa.company_id = public.try_uuid(split_part(name, '/', 1))
  )
);

create policy "assessment_frames_storage_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
  and exists (
    select 1 from public.functional_assessments fa
    where fa.id = public.try_uuid(split_part(name, '/', 2))
      and fa.company_id = public.try_uuid(split_part(name, '/', 1))
  )
)
with check (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
  and exists (
    select 1 from public.functional_assessments fa
    where fa.id = public.try_uuid(split_part(name, '/', 2))
      and fa.company_id = public.try_uuid(split_part(name, '/', 1))
  )
);

create policy "assessment_frames_storage_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
  and exists (
    select 1 from public.functional_assessments fa
    where fa.id = public.try_uuid(split_part(name, '/', 2))
      and fa.company_id = public.try_uuid(split_part(name, '/', 1))
  )
);

-- Privileged gamification RPCs were historically executable by PUBLIC/anon.
-- Keep the two student-facing entry points, but enforce ownership and validate
-- the only XP events a student client is allowed to create. Internal cron and
-- service-role callers remain supported without trusting user metadata.
create or replace function public.award_xp(
  _student_id uuid,
  _event_type text,
  _xp_amount integer,
  _source_id uuid default null,
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_student_user_id uuid;
  v_id uuid;
  v_caller uuid := auth.uid();
  v_internal boolean := session_user in ('postgres', 'supabase_admin')
    or coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_staff boolean := false;
  v_valid_event boolean := false;
begin
  select s.company_id, s.user_id
  into v_company, v_student_user_id
  from public.students s
  where s.id = _student_id;

  if v_company is null then
    return null;
  end if;

  v_staff := public.is_company_staff(v_caller, v_company);
  if not v_internal
     and v_caller is distinct from v_student_user_id
     and not v_staff then
    raise exception 'Forbidden: student ownership required' using errcode = '42501';
  end if;

  if _xp_amount is null or _xp_amount <= 0 or _xp_amount > 10000 then
    raise exception 'Invalid XP amount' using errcode = '22023';
  end if;

  if v_internal then
    v_valid_event := true;
  elsif _event_type = 'workout' and _xp_amount = 50 and _source_id is not null then
    v_valid_event := exists (
      select 1 from public.workout_sessions ws
      where ws.id = _source_id
        and ws.student_id = _student_id
        and ws.company_id = v_company
        and ws.status = 'completed'
    );
  elsif _event_type = 'external_activity' and _xp_amount = 30 and _source_id is not null then
    v_valid_event := exists (
      select 1 from public.external_activities ea
      where ea.id = _source_id
        and ea.student_id = _student_id
        and ea.company_id = v_company
    );
  elsif _event_type = 'achievement' and _source_id is not null then
    v_valid_event := exists (
      select 1
      from public.achievements a
      join public.student_achievements sa
        on sa.achievement_id = a.id
       and sa.student_id = _student_id
       and sa.company_id = v_company
      where a.id = _source_id
        and a.xp_reward = _xp_amount
        and (a.company_id is null or a.company_id = v_company)
    );
  end if;

  if not v_valid_event then
    raise exception 'Forbidden: invalid XP event' using errcode = '42501';
  end if;

  insert into public.xp_events (
    student_id, company_id, event_type, xp_amount, source_id, notes
  ) values (
    _student_id, v_company, _event_type, _xp_amount, _source_id, _notes
  )
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.award_xp(uuid, text, integer, uuid, text) from public, anon;
grant execute on function public.award_xp(uuid, text, integer, uuid, text) to authenticated, service_role;

create or replace function public.check_and_unlock_achievements(_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_student_user_id uuid;
  v_caller uuid := auth.uid();
  v_internal boolean := session_user in ('postgres', 'supabase_admin')
    or coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_workouts integer;
  v_externals integer;
  v_cycles integer;
  v_unlocked integer := 0;
  a record;
  v_meets boolean;
  v_new_id uuid;
begin
  select s.company_id, s.user_id
  into v_company, v_student_user_id
  from public.students s
  where s.id = _student_id;

  if v_company is null then
    return 0;
  end if;

  if not v_internal
     and v_caller is distinct from v_student_user_id
     and not public.is_company_staff(v_caller, v_company) then
    raise exception 'Forbidden: student ownership required' using errcode = '42501';
  end if;

  select count(*) into v_workouts
  from public.workout_sessions
  where student_id = _student_id and status = 'completed';

  select count(*) into v_externals
  from public.external_activities
  where student_id = _student_id;

  select count(*) into v_cycles
  from public.training_cycles tc
  join public.enrollments e on e.id = tc.enrollment_id
  where e.student_id = _student_id and tc.status = 'completed';

  for a in
    select *
    from public.achievements
    where is_active = true
      and (company_id is null or company_id = v_company)
      and not exists (
        select 1 from public.student_achievements sa
        where sa.student_id = _student_id
          and sa.achievement_id = achievements.id
      )
  loop
    v_meets := false;
    if a.criteria_type = 'workouts_total' and v_workouts >= a.criteria_value then
      v_meets := true;
    elsif a.criteria_type = 'external_total' and v_externals >= a.criteria_value then
      v_meets := true;
    elsif a.criteria_type = 'cycles_completed' and v_cycles >= a.criteria_value then
      v_meets := true;
    end if;

    if v_meets then
      insert into public.student_achievements (
        student_id, company_id, achievement_id
      ) values (
        _student_id, v_company, a.id
      )
      on conflict do nothing
      returning id into v_new_id;

      if v_new_id is not null then
        perform public.award_xp(
          _student_id, 'achievement', a.xp_reward, a.id, a.title
        );
        v_unlocked := v_unlocked + 1;
      end if;
    end if;
  end loop;

  return v_unlocked;
end;
$$;
revoke all on function public.check_and_unlock_achievements(uuid) from public, anon;
grant execute on function public.check_and_unlock_achievements(uuid) to authenticated, service_role;

create or replace function public.get_student_rank(_student_id uuid)
returns table (rank_position bigint, total_students bigint, xp bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_student_user_id uuid;
  v_caller uuid := auth.uid();
  v_internal boolean := session_user in ('postgres', 'supabase_admin')
    or coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_xp bigint;
begin
  select s.company_id, s.user_id
  into v_company, v_student_user_id
  from public.students s
  where s.id = _student_id;

  if v_company is null then
    return;
  end if;

  if not v_internal
     and v_caller is distinct from v_student_user_id
     and not public.is_company_staff(v_caller, v_company) then
    raise exception 'Forbidden: student ownership required' using errcode = '42501';
  end if;

  select coalesce(sum(xp_amount), 0) into v_xp
  from public.xp_events
  where student_id = _student_id;

  return query
  with totals as (
    select s.id as sid, coalesce(sum(x.xp_amount), 0) as total_xp
    from public.students s
    left join public.xp_events x on x.student_id = s.id
    where s.company_id = v_company
    group by s.id
  )
  select
    (select count(*) + 1 from totals t where t.total_xp > v_xp)::bigint,
    (select count(*) from totals)::bigint,
    v_xp;
end;
$$;
revoke all on function public.get_student_rank(uuid) from public, anon;
grant execute on function public.get_student_rank(uuid) to authenticated, service_role;

-- Students are not company_members, so the historical leaderboard guard made
-- the student-facing widget fail closed for every student. Authorize the
-- requested tenant from authoritative staff/student relationships instead.
create or replace function public.get_monthly_leaderboard(
  _company_id uuid,
  _month date default current_date
) returns table (top3 jsonb, caller jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_start date := date_trunc('month', coalesce(_month, current_date))::date;
  v_month_end date := (
    date_trunc('month', coalesce(_month, current_date))::date + interval '1 month'
  )::date;
begin
  if _company_id is null then
    raise exception 'company_id obrigatorio' using errcode = '22023';
  end if;

  if not public.has_role(v_user_id, 'master'::public.app_role)
     and not public.is_company_staff(v_user_id, _company_id)
     and not exists (
       select 1
       from public.students s
       where s.user_id = v_user_id
         and s.company_id = _company_id
     ) then
    raise exception 'Forbidden: company mismatch' using errcode = '42501';
  end if;

  return query
  with ranked as (
    select
      s.id as student_id,
      s.user_id,
      s.full_name,
      coalesce(sum(x.xp_amount) filter (
        where x.created_at >= v_month_start
          and x.created_at < v_month_end
      ), 0)::bigint as xp
    from public.students s
    left join public.xp_events x on x.student_id = s.id
    where s.company_id = _company_id
      and coalesce(s.status, '') <> 'inactive'
    group by s.id, s.user_id, s.full_name
  ),
  ranked_with_position as (
    select
      *,
      dense_rank() over (
        order by xp desc, full_name asc, student_id asc
      )::integer as rank
    from ranked
  ),
  caller_row as (
    select *
    from ranked_with_position
    where user_id = v_user_id
    order by student_id
    limit 1
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'display_name', public.private_display_name(r.full_name),
            'xp', r.xp,
            'rank', r.rank
          )
          order by r.rank, r.full_name
        )
        from (
          select *
          from ranked_with_position
          order by rank, full_name, student_id
          limit 3
        ) r
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_build_object(
          'rank', c.rank,
          'xp', c.xp,
          'total_participantes', (select count(*) from ranked_with_position)
        )
        from caller_row c
      ),
      jsonb_build_object(
        'rank', null,
        'xp', 0,
        'total_participantes', (select count(*) from ranked_with_position)
      )
    );
end;
$$;
revoke all on function public.get_monthly_leaderboard(uuid, date)
from public, anon;
grant execute on function public.get_monthly_leaderboard(uuid, date)
to authenticated, service_role;

-- These two functions mutate rows across every tenant and are cron/backend
-- operations only. pg_cron executes as the database owner; backend jobs use
-- service_role. Browser roles must never call them directly.
revoke all on function public.award_weekly_consistency(date)
from public, anon, authenticated, service_role;
revoke all on function public.mark_payment_recovery_abandoned()
from public, anon, authenticated, service_role;

-- Collapse duplicated permissive alert policies into one tenant-safe policy
-- per operation. UPDATE repeats the full predicate in WITH CHECK so a caller
-- cannot move an alert to another tenant or retarget it during resolution.
drop policy if exists "Company admins insert alerts" on public.admin_alerts;
drop policy if exists "Company admins read alerts" on public.admin_alerts;
drop policy if exists "Company admins update alerts" on public.admin_alerts;
drop policy if exists "Master full access alerts" on public.admin_alerts;
drop policy if exists "admin alerts company insert" on public.admin_alerts;
drop policy if exists "admin alerts company read" on public.admin_alerts;
drop policy if exists "admin alerts company update" on public.admin_alerts;
drop policy if exists "admin alerts master" on public.admin_alerts;
drop policy if exists "admin alerts staff insert" on public.admin_alerts;
drop policy if exists "admin alerts staff select" on public.admin_alerts;
drop policy if exists "admin alerts staff update" on public.admin_alerts;

create policy "admin alerts master"
on public.admin_alerts for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));

create policy "admin alerts staff insert"
on public.admin_alerts for insert to authenticated
with check (
  public.is_company_staff(auth.uid(), admin_alerts.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
  and (
    admin_alerts.target_user_id is null
    or exists (
      select 1 from public.company_members cm
      where cm.user_id = admin_alerts.target_user_id
        and cm.company_id = admin_alerts.company_id
    )
  )
  and (
    admin_alerts.student_id is null
    or exists (
      select 1 from public.students s
      where s.id = admin_alerts.student_id
        and s.company_id = admin_alerts.company_id
    )
  )
  and (
    admin_alerts.enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = admin_alerts.enrollment_id
        and e.company_id = admin_alerts.company_id
    )
  )
);

create policy "admin alerts staff select"
on public.admin_alerts for select to authenticated
using (
  public.is_company_staff(auth.uid(), admin_alerts.company_id)
  and (
    admin_alerts.target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);

create policy "admin alerts staff update"
on public.admin_alerts for update to authenticated
using (
  public.is_company_staff(auth.uid(), admin_alerts.company_id)
  and (
    admin_alerts.target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
)
with check (
  public.is_company_staff(auth.uid(), admin_alerts.company_id)
  and (
    admin_alerts.target_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
  and (
    admin_alerts.target_user_id is null
    or exists (
      select 1 from public.company_members cm
      where cm.user_id = admin_alerts.target_user_id
        and cm.company_id = admin_alerts.company_id
    )
  )
  and (
    admin_alerts.student_id is null
    or exists (
      select 1 from public.students s
      where s.id = admin_alerts.student_id
        and s.company_id = admin_alerts.company_id
    )
  )
  and (
    admin_alerts.enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = admin_alerts.enrollment_id
        and e.company_id = admin_alerts.company_id
    )
  )
);

-- Announcements: staff manages only its tenant, students read their company's
-- feed, and master access is explicit. Remove legacy admin policies so their
-- missing WITH CHECK clauses cannot be OR-combined with the canonical policy.
drop policy if exists "Admin company delete" on public.announcements;
drop policy if exists "Admin company insert" on public.announcements;
drop policy if exists "Admin company update" on public.announcements;
drop policy if exists "Company scoped select" on public.announcements;
drop policy if exists "Company staff manage announcements" on public.announcements;
drop policy if exists "Master full access" on public.announcements;
drop policy if exists "announcements master" on public.announcements;
drop policy if exists "announcements student company" on public.announcements;

create policy "announcements master"
on public.announcements for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage announcements"
on public.announcements for all to authenticated
using (
  public.is_company_staff(auth.uid(), announcements.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
)
with check (
  public.is_company_staff(auth.uid(), announcements.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create policy "announcements student company"
on public.announcements for select to authenticated
using (exists (
  select 1 from public.students s
  where s.user_id = auth.uid()
    and s.company_id = announcements.company_id
));

-- An UPDATE of one's profile must remain one's profile after the write.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update to authenticated
using (profiles.user_id = auth.uid())
with check (profiles.user_id = auth.uid());
drop policy if exists "Company admins update company profiles" on public.profiles;
create policy "Company admins update company profiles"
on public.profiles for update to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.user_id = profiles.user_id
    and public.is_company_staff(auth.uid(), cm.company_id)
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'coordinator'::public.app_role)
    )
))
with check (exists (
  select 1 from public.company_members cm
  where cm.user_id = profiles.user_id
    and public.is_company_staff(auth.uid(), cm.company_id)
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'coordinator'::public.app_role)
    )
));

create or replace function public.prevent_profile_user_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Profile user_id is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_profile_user_reassignment()
from public, anon, authenticated;
drop trigger if exists zz_prevent_profile_user_reassignment on public.profiles;
create trigger zz_prevent_profile_user_reassignment
before update on public.profiles
for each row execute function public.prevent_profile_user_reassignment();

-- Workout sessions are student-owned but also carry company_id and an optional
-- workout. Prove all three references together on reads and writes, and remove
-- the broad duplicate ALL student policy.
drop policy if exists "Company staff manage workout sessions" on public.workout_sessions;
drop policy if exists "Master full access" on public.workout_sessions;
drop policy if exists "Student inserts own sessions" on public.workout_sessions;
drop policy if exists "Student manages own sessions" on public.workout_sessions;
drop policy if exists "Student reads own sessions" on public.workout_sessions;
drop policy if exists "Student updates own sessions" on public.workout_sessions;

create policy "Master full access"
on public.workout_sessions for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));

create policy "Company staff manage workout sessions"
on public.workout_sessions for all to authenticated
using (
  public.is_company_staff(auth.uid(), workout_sessions.company_id)
  and exists (
    select 1 from public.students s
    where s.id = workout_sessions.student_id
      and s.company_id = workout_sessions.company_id
  )
  and (
    workout_sessions.workout_id is null
    or exists (
      select 1
      from public.workouts w
      join public.training_cycles tc on tc.id = w.cycle_id
      where w.id = workout_sessions.workout_id
        and tc.student_id = workout_sessions.student_id
        and tc.company_id = workout_sessions.company_id
        and (w.company_id is null or w.company_id = workout_sessions.company_id)
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), workout_sessions.company_id)
  and exists (
    select 1 from public.students s
    where s.id = workout_sessions.student_id
      and s.company_id = workout_sessions.company_id
  )
  and (
    workout_sessions.workout_id is null
    or exists (
      select 1
      from public.workouts w
      join public.training_cycles tc on tc.id = w.cycle_id
      where w.id = workout_sessions.workout_id
        and tc.student_id = workout_sessions.student_id
        and tc.company_id = workout_sessions.company_id
        and (w.company_id is null or w.company_id = workout_sessions.company_id)
    )
  )
);

create policy "Student reads own sessions"
on public.workout_sessions for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = workout_sessions.student_id
      and s.user_id = auth.uid()
      and s.company_id = workout_sessions.company_id
  )
  and (
    workout_sessions.workout_id is null
    or exists (
      select 1
      from public.workouts w
      join public.training_cycles tc on tc.id = w.cycle_id
      where w.id = workout_sessions.workout_id
        and tc.student_id = workout_sessions.student_id
        and tc.company_id = workout_sessions.company_id
        and (w.company_id is null or w.company_id = workout_sessions.company_id)
    )
  )
);

create policy "Student inserts own sessions"
on public.workout_sessions for insert to authenticated
with check (
  workout_sessions.workout_id is not null
  and workout_sessions.status = 'in_progress'
  and workout_sessions.completed_at is null
  and
  exists (
    select 1 from public.students s
    where s.id = workout_sessions.student_id
      and s.user_id = auth.uid()
      and s.company_id = workout_sessions.company_id
  )
  and (
    workout_sessions.workout_id is null
    or exists (
      select 1
      from public.workouts w
      join public.training_cycles tc on tc.id = w.cycle_id
      where w.id = workout_sessions.workout_id
        and tc.student_id = workout_sessions.student_id
        and tc.company_id = workout_sessions.company_id
        and (w.company_id is null or w.company_id = workout_sessions.company_id)
    )
  )
);

create policy "Student updates own sessions"
on public.workout_sessions for update to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = workout_sessions.student_id
      and s.user_id = auth.uid()
      and s.company_id = workout_sessions.company_id
  )
)
with check (
  exists (
    select 1 from public.students s
    where s.id = workout_sessions.student_id
      and s.user_id = auth.uid()
      and s.company_id = workout_sessions.company_id
  )
  and (
    workout_sessions.workout_id is null
    or exists (
      select 1
      from public.workouts w
      join public.training_cycles tc on tc.id = w.cycle_id
      where w.id = workout_sessions.workout_id
        and tc.student_id = workout_sessions.student_id
        and tc.company_id = workout_sessions.company_id
        and (w.company_id is null or w.company_id = workout_sessions.company_id)
    )
  )
);

-- A feedback UUID is not sufficient proof of ownership. Bind every optional
-- parent to the same student/company pair even for service-role writes that
-- bypass RLS.
create or replace function public.enforce_cycle_feedback_reference_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.enrollment_id is not null and not exists (
    select 1 from public.enrollments e
    where e.id = new.enrollment_id
      and e.student_id = new.student_id
      and e.company_id = new.company_id
  ) then
    raise exception 'Cycle feedback enrollment/student/company mismatch'
      using errcode = '23514';
  end if;
  if new.cycle_id is not null and not exists (
    select 1 from public.training_cycles tc
    where tc.id = new.cycle_id
      and tc.student_id = new.student_id
      and tc.company_id = new.company_id
  ) then
    raise exception 'Cycle feedback cycle/student/company mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_cycle_feedback_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_cycle_feedback_reference_integrity
on public.cycle_feedback;
create trigger zz_enforce_cycle_feedback_reference_integrity
before insert or update on public.cycle_feedback
for each row execute function public.enforce_cycle_feedback_reference_integrity();

create or replace function public.enforce_workout_feedback_reference_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.workout_session_id is not null and not exists (
    select 1 from public.workout_sessions ws
    where ws.id = new.workout_session_id
      and ws.student_id = new.student_id
      and ws.company_id = new.company_id
  ) then
    raise exception 'Workout feedback session/student/company mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_workout_feedback_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_workout_feedback_reference_integrity
on public.workout_feedback;
create trigger zz_enforce_workout_feedback_reference_integrity
before insert or update on public.workout_feedback
for each row execute function public.enforce_workout_feedback_reference_integrity();

-- Strength, endurance and nutrition plans share the same optional reference
-- contract. Validate every link instead of trusting a syntactically valid UUID.
create or replace function public.enforce_plan_reference_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_previous_matches boolean;
begin
  if new.anamnese_id is not null and not exists (
    select 1 from public.student_anamneses a
    where a.id = new.anamnese_id
      and a.student_id = new.student_id
      and a.company_id = new.company_id
  ) then
    raise exception 'Plan anamnesis/student/company mismatch'
      using errcode = '23514';
  end if;
  if new.bundle_id is not null and not exists (
    select 1 from public.prescription_bundles b
    where b.id = new.bundle_id
      and b.student_id = new.student_id
      and b.company_id = new.company_id
  ) then
    raise exception 'Plan bundle/student/company mismatch'
      using errcode = '23514';
  end if;
  if new.training_cycle_id is not null and not exists (
    select 1 from public.training_cycles tc
    where tc.id = new.training_cycle_id
      and tc.student_id = new.student_id
      and tc.company_id = new.company_id
  ) then
    raise exception 'Plan cycle/student/company mismatch'
      using errcode = '23514';
  end if;
  if new.previous_plan_id is not null then
    execute format(
      'select exists (select 1 from public.%I p where p.id = $1 and p.student_id = $2 and p.company_id = $3)',
      tg_table_name
    )
    into v_previous_matches
    using new.previous_plan_id, new.student_id, new.company_id;
    if not coalesce(v_previous_matches, false) then
      raise exception 'Previous plan/student/company mismatch'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_plan_reference_integrity()
from public, anon, authenticated;

do $plan_reference_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'running_plans', 'ai_strength_plans', 'nutrition_plans'
  ] loop
    execute format(
      'drop trigger if exists zz_enforce_plan_reference_integrity on public.%I',
      v_table
    );
    execute format(
      'create trigger zz_enforce_plan_reference_integrity before insert or update on public.%I for each row execute function public.enforce_plan_reference_integrity()',
      v_table
    );
  end loop;
end;
$plan_reference_triggers$;

create or replace function public.enforce_bundle_reference_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.anamnese_id is not null and not exists (
    select 1 from public.student_anamneses a
    where a.id = new.anamnese_id and a.student_id = new.student_id and a.company_id = new.company_id
  ) then
    raise exception 'Bundle anamnesis/student/company mismatch' using errcode = '23514';
  end if;
  if new.assessment_id is not null and not exists (
    select 1 from public.functional_assessments fa
    where fa.id = new.assessment_id and fa.student_id = new.student_id and fa.company_id = new.company_id
  ) then
    raise exception 'Bundle assessment/student/company mismatch' using errcode = '23514';
  end if;
  if new.training_cycle_id is not null and not exists (
    select 1 from public.training_cycles tc
    where tc.id = new.training_cycle_id and tc.student_id = new.student_id and tc.company_id = new.company_id
  ) then
    raise exception 'Bundle cycle/student/company mismatch' using errcode = '23514';
  end if;
  if new.strength_plan_id is not null and not exists (
    select 1 from public.ai_strength_plans p
    where p.id = new.strength_plan_id and p.student_id = new.student_id and p.company_id = new.company_id
  ) then
    raise exception 'Bundle strength plan/student/company mismatch' using errcode = '23514';
  end if;
  if new.running_plan_id is not null and not exists (
    select 1 from public.running_plans p
    where p.id = new.running_plan_id and p.student_id = new.student_id and p.company_id = new.company_id
  ) then
    raise exception 'Bundle running plan/student/company mismatch' using errcode = '23514';
  end if;
  if new.nutrition_plan_id is not null and not exists (
    select 1 from public.nutrition_plans p
    where p.id = new.nutrition_plan_id and p.student_id = new.student_id and p.company_id = new.company_id
  ) then
    raise exception 'Bundle nutrition plan/student/company mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_bundle_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_bundle_reference_integrity
on public.prescription_bundles;
create trigger zz_enforce_bundle_reference_integrity
before insert or update on public.prescription_bundles
for each row execute function public.enforce_bundle_reference_integrity();

-- Enforce the student/company pair below RLS as well. Independent foreign keys
-- only prove that each UUID exists; this trigger proves that they belong
-- together, including for service-role writes that bypass policies.
create or replace function public.enforce_student_company_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.student_id is null then
    return new;
  end if;
  if new.company_id is null or not exists (
    select 1 from public.students s
    where s.id = new.student_id and s.company_id = new.company_id
  ) then
    raise exception 'Student/company mismatch on %', tg_table_name
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_student_company_integrity()
from public, anon, authenticated;

do $student_company_triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'ai_strength_plans',
    'anamnese_invites',
    'anamnesis',
    'body_measurements',
    'cycle_feedback',
    'enrollments',
    'external_activities',
    'functional_assessments',
    'nutrition_plans',
    'payments',
    'prescription_bundles',
    'running_plans',
    'student_anamneses',
    'student_evaluations',
    'student_body_limitations',
    'student_files',
    'student_goals',
    'student_achievements',
    'ai_plan_versions',
    'trainer_assignments_history',
    'ai_decision_logs',
    'student_checkins',
    'workout_feedback',
    'workout_sessions',
    'xp_events'
  ] loop
    execute format(
      'drop trigger if exists zz_enforce_student_company_integrity on public.%I',
      v_table
    );
    execute format(
      'create trigger zz_enforce_student_company_integrity before insert or update on public.%I for each row execute function public.enforce_student_company_integrity()',
      v_table
    );
  end loop;
end;
$student_company_triggers$;

create or replace function public.enforce_enrollment_reference_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.plan_id is not null and not exists (
    select 1 from public.plans p
    where p.id = new.plan_id and p.company_id = new.company_id
  ) then
    raise exception 'Enrollment plan/company mismatch' using errcode = '23514';
  end if;
  if new.trainer_id is not null
     and not public.has_role(new.trainer_id, 'master'::public.app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = new.trainer_id and cm.company_id = new.company_id
     ) then
    raise exception 'Enrollment trainer/company mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_enrollment_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_enrollment_reference_integrity on public.enrollments;
create trigger zz_enforce_enrollment_reference_integrity
before insert or update on public.enrollments
for each row execute function public.enforce_enrollment_reference_integrity();

create or replace function public.enforce_payment_reference_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.enrollment_id is not null and not exists (
    select 1 from public.enrollments e
    where e.id = new.enrollment_id
      and e.student_id = new.student_id
      and e.company_id = new.company_id
  ) then
    raise exception 'Payment enrollment/student/company mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_payment_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_payment_reference_integrity on public.payments;
create trigger zz_enforce_payment_reference_integrity
before insert or update on public.payments
for each row execute function public.enforce_payment_reference_integrity();

create or replace function public.enforce_evaluation_reference_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user uuid;
begin
  foreach v_user in array array[new.evaluator_id, new.created_by] loop
    if v_user is not null
       and not public.has_role(v_user, 'master'::public.app_role)
       and not exists (
         select 1 from public.company_members cm
         where cm.user_id = v_user and cm.company_id = new.company_id
       ) then
      raise exception 'Evaluation author/company mismatch' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.enforce_evaluation_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_evaluation_reference_integrity on public.student_evaluations;
create trigger zz_enforce_evaluation_reference_integrity
before insert or update on public.student_evaluations
for each row execute function public.enforce_evaluation_reference_integrity();

create or replace function public.enforce_student_file_path_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if split_part(new.file_path, '/', 1) is distinct from new.company_id::text
     or split_part(new.file_path, '/', 2) is distinct from new.student_id::text then
    raise exception 'Student file path/company/student mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_student_file_path_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_student_file_path_integrity on public.student_files;
create trigger zz_enforce_student_file_path_integrity
before insert or update on public.student_files
for each row execute function public.enforce_student_file_path_integrity();

create or replace function public.enforce_plan_version_reference_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cycle_id is not null and not exists (
    select 1 from public.training_cycles tc
    where tc.id = new.cycle_id
      and tc.student_id = new.student_id
      and tc.company_id = new.company_id
  ) then
    raise exception 'Plan version cycle/student/company mismatch'
      using errcode = '23514';
  end if;
  if new.created_by is not null
     and not public.has_role(new.created_by, 'master'::public.app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = new.created_by and cm.company_id = new.company_id
     ) then
    raise exception 'Plan version author/company mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_plan_version_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_plan_version_reference_integrity on public.ai_plan_versions;
create trigger zz_enforce_plan_version_reference_integrity
before insert or update on public.ai_plan_versions
for each row execute function public.enforce_plan_version_reference_integrity();

create or replace function public.enforce_trainer_history_reference_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_user uuid;
begin
  foreach v_user in array array[new.trainer_id, new.previous_trainer_id, new.changed_by] loop
    if v_user is not null
       and not public.has_role(v_user, 'master'::public.app_role)
       and not exists (
         select 1 from public.company_members cm
         where cm.user_id = v_user and cm.company_id = new.company_id
       ) then
      raise exception 'Trainer history user/company mismatch' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.enforce_trainer_history_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_trainer_history_reference_integrity
on public.trainer_assignments_history;
create trigger zz_enforce_trainer_history_reference_integrity
before insert or update on public.trainer_assignments_history
for each row execute function public.enforce_trainer_history_reference_integrity();

create or replace function public.enforce_workout_session_reference_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.workout_id is not null and not exists (
    select 1
    from public.workouts w
    join public.training_cycles tc on tc.id = w.cycle_id
    where w.id = new.workout_id
      and tc.student_id = new.student_id
      and tc.company_id = new.company_id
      and (w.company_id is null or w.company_id = new.company_id)
  ) then
    raise exception 'Workout session workout/cycle/student/company mismatch'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_workout_session_reference_integrity()
from public, anon, authenticated;
drop trigger if exists zz_enforce_workout_session_reference_integrity
on public.workout_sessions;
create trigger zz_enforce_workout_session_reference_integrity
before insert or update on public.workout_sessions
for each row execute function public.enforce_workout_session_reference_integrity();

-- Rebuild student-linked policies with both tenant authorization and relational
-- integrity. The triggers above are the universal fail-closed layer; these
-- predicates also hide any historical poisoned row until it is repaired.
drop policy if exists "Company staff manage enrollments" on public.enrollments;
drop policy if exists "Student reads own enrollments" on public.enrollments;
create policy "Company staff manage enrollments"
on public.enrollments for all to authenticated
using (
  public.is_company_staff(auth.uid(), enrollments.company_id)
  and exists (select 1 from public.students s where s.id = enrollments.student_id and s.company_id = enrollments.company_id)
)
with check (
  public.is_company_staff(auth.uid(), enrollments.company_id)
  and exists (select 1 from public.students s where s.id = enrollments.student_id and s.company_id = enrollments.company_id)
);
create policy "Student reads own enrollments"
on public.enrollments for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = enrollments.student_id
    and s.company_id = enrollments.company_id
    and s.user_id = auth.uid()
));

drop policy if exists "Company staff manage payments" on public.payments;
drop policy if exists "Student reads own payments" on public.payments;
create policy "Company staff manage payments"
on public.payments for all to authenticated
using (
  public.is_company_staff(auth.uid(), payments.company_id)
  and exists (select 1 from public.students s where s.id = payments.student_id and s.company_id = payments.company_id)
  and (
    payments.enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = payments.enrollment_id
        and e.student_id = payments.student_id
        and e.company_id = payments.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), payments.company_id)
  and exists (select 1 from public.students s where s.id = payments.student_id and s.company_id = payments.company_id)
  and (
    payments.enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = payments.enrollment_id
        and e.student_id = payments.student_id
        and e.company_id = payments.company_id
    )
  )
);
create policy "Student reads own payments"
on public.payments for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = payments.student_id
    and s.company_id = payments.company_id
    and s.user_id = auth.uid()
));

drop policy if exists "Company staff manage student evaluations" on public.student_evaluations;
drop policy if exists "Student reads own evaluations" on public.student_evaluations;
create policy "Company staff manage student evaluations"
on public.student_evaluations for all to authenticated
using (
  public.is_company_staff(auth.uid(), student_evaluations.company_id)
  and exists (select 1 from public.students s where s.id = student_evaluations.student_id and s.company_id = student_evaluations.company_id)
)
with check (
  public.is_company_staff(auth.uid(), student_evaluations.company_id)
  and exists (select 1 from public.students s where s.id = student_evaluations.student_id and s.company_id = student_evaluations.company_id)
);
create policy "Student reads own evaluations"
on public.student_evaluations for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = student_evaluations.student_id
    and s.company_id = student_evaluations.company_id
    and s.user_id = auth.uid()
));

drop policy if exists "Company staff manage body limitations" on public.student_body_limitations;
drop policy if exists "Master full body limitations" on public.student_body_limitations;
drop policy if exists "Student reads own body limitations" on public.student_body_limitations;
create policy "Master full body limitations"
on public.student_body_limitations for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage body limitations"
on public.student_body_limitations for all to authenticated
using (
  public.is_company_staff(auth.uid(), student_body_limitations.company_id)
  and exists (select 1 from public.students s where s.id = student_body_limitations.student_id and s.company_id = student_body_limitations.company_id)
)
with check (
  public.is_company_staff(auth.uid(), student_body_limitations.company_id)
  and exists (select 1 from public.students s where s.id = student_body_limitations.student_id and s.company_id = student_body_limitations.company_id)
);
create policy "Student reads own body limitations"
on public.student_body_limitations for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = student_body_limitations.student_id
    and s.company_id = student_body_limitations.company_id
    and s.user_id = auth.uid()
));

drop policy if exists "Company staff manage student files" on public.student_files;
drop policy if exists "student reads own files" on public.student_files;
create policy "Company staff manage student files"
on public.student_files for all to authenticated
using (
  public.is_company_staff(auth.uid(), student_files.company_id)
  and exists (select 1 from public.students s where s.id = student_files.student_id and s.company_id = student_files.company_id)
)
with check (
  public.is_company_staff(auth.uid(), student_files.company_id)
  and exists (select 1 from public.students s where s.id = student_files.student_id and s.company_id = student_files.company_id)
);
create policy "student reads own files"
on public.student_files for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = student_files.student_id
    and s.company_id = student_files.company_id
    and s.user_id = auth.uid()
));

drop policy if exists "Company staff manage plan versions" on public.ai_plan_versions;
drop policy if exists "Student reads own plan versions" on public.ai_plan_versions;
drop policy if exists "plan_versions_master" on public.ai_plan_versions;
create policy "plan_versions_master"
on public.ai_plan_versions for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff manage plan versions"
on public.ai_plan_versions for all to authenticated
using (
  public.is_company_staff(auth.uid(), ai_plan_versions.company_id)
  and exists (select 1 from public.students s where s.id = ai_plan_versions.student_id and s.company_id = ai_plan_versions.company_id)
  and (
    ai_plan_versions.cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = ai_plan_versions.cycle_id
        and tc.student_id = ai_plan_versions.student_id
        and tc.company_id = ai_plan_versions.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), ai_plan_versions.company_id)
  and exists (select 1 from public.students s where s.id = ai_plan_versions.student_id and s.company_id = ai_plan_versions.company_id)
  and (
    ai_plan_versions.cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = ai_plan_versions.cycle_id
        and tc.student_id = ai_plan_versions.student_id
        and tc.company_id = ai_plan_versions.company_id
    )
  )
);
create policy "Student reads own plan versions"
on public.ai_plan_versions for select to authenticated
using (exists (
  select 1 from public.students s
  where s.id = ai_plan_versions.student_id
    and s.company_id = ai_plan_versions.company_id
    and s.user_id = auth.uid()
));

drop policy if exists "Company staff manage trainer assignment history" on public.trainer_assignments_history;
create policy "Company staff manage trainer assignment history"
on public.trainer_assignments_history for all to authenticated
using (
  public.is_company_staff(auth.uid(), trainer_assignments_history.company_id)
  and exists (select 1 from public.students s where s.id = trainer_assignments_history.student_id and s.company_id = trainer_assignments_history.company_id)
)
with check (
  public.is_company_staff(auth.uid(), trainer_assignments_history.company_id)
  and exists (select 1 from public.students s where s.id = trainer_assignments_history.student_id and s.company_id = trainer_assignments_history.company_id)
);

drop policy if exists "Company staff insert ai decision logs" on public.ai_decision_logs;
drop policy if exists "Company staff read ai decision logs" on public.ai_decision_logs;
create policy "Company staff insert ai decision logs"
on public.ai_decision_logs for insert to authenticated
with check (
  public.is_company_staff(auth.uid(), ai_decision_logs.company_id)
  and (
    ai_decision_logs.student_id is null
    or exists (
      select 1 from public.students s
      where s.id = ai_decision_logs.student_id
        and s.company_id = ai_decision_logs.company_id
    )
  )
);
create policy "Company staff read ai decision logs"
on public.ai_decision_logs for select to authenticated
using (
  public.is_company_staff(auth.uid(), ai_decision_logs.company_id)
  and (
    ai_decision_logs.student_id is null
    or exists (
      select 1 from public.students s
      where s.id = ai_decision_logs.student_id
        and s.company_id = ai_decision_logs.company_id
    )
  )
);

drop policy if exists "Company staff read checkins" on public.student_checkins;
drop policy if exists "checkins_master" on public.student_checkins;
drop policy if exists "checkins_student_own" on public.student_checkins;
create policy "checkins_master"
on public.student_checkins for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy "Company staff read checkins"
on public.student_checkins for select to authenticated
using (
  public.is_company_staff(auth.uid(), student_checkins.company_id)
  and exists (select 1 from public.students s where s.id = student_checkins.student_id and s.company_id = student_checkins.company_id)
);
create policy "checkins_student_own"
on public.student_checkins for all to authenticated
using (exists (
  select 1 from public.students s
  where s.id = student_checkins.student_id
    and s.company_id = student_checkins.company_id
    and s.user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = student_checkins.student_id
    and s.company_id = student_checkins.company_id
    and s.user_id = auth.uid()
));

-- Keep custom helper resolution deterministic. These three pure helpers were
-- the only functions still reported by the Security Advisor with a mutable
-- search_path after the fresh replay.
alter function public.try_uuid(text) set search_path = pg_catalog;
alter function public.private_display_name(text) set search_path = pg_catalog;
alter function public.weekly_consistency_source_id(uuid, date)
  set search_path = pg_catalog;

-- Historical policies without an explicit TO clause targeted PUBLIC. Their
-- predicates already fail closed for anonymous sessions, but an authenticated
-- target keeps the API surface explicit and avoids evaluating privileged
-- helpers for anonymous requests. Cron's extension-owned policies are outside
-- the application schema and intentionally left unchanged.
alter policy templates_master on public.cycle_templates to authenticated;
alter policy push_owner_all on public.push_subscriptions to authenticated;
alter policy staff_sessions_own_insert on public.staff_sessions to authenticated;
alter policy staff_sessions_own_update on public.staff_sessions to authenticated;
alter policy staff_sessions_read on public.staff_sessions to authenticated;
alter policy anamnesis_history_master on public.student_anamnesis_history
  to authenticated;

-- Retire the first-membership helper from policies. A user can belong to more
-- than one company, while students are intentionally represented by students,
-- not by a synthetic company_members row.
drop policy if exists "Admin company delete achievements" on public.achievements;
drop policy if exists "Admin company insert achievements" on public.achievements;
drop policy if exists "Admin company update achievements" on public.achievements;
drop policy if exists "Read achievements" on public.achievements;
create policy "Admin company delete achievements"
on public.achievements for delete to authenticated
using (
  public.is_company_staff(auth.uid(), achievements.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create policy "Admin company insert achievements"
on public.achievements for insert to authenticated
with check (
  public.is_company_staff(auth.uid(), achievements.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create policy "Admin company update achievements"
on public.achievements for update to authenticated
using (
  public.is_company_staff(auth.uid(), achievements.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
)
with check (
  public.is_company_staff(auth.uid(), achievements.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create policy "Read achievements"
on public.achievements for select to authenticated
using (
  achievements.company_id is null
  or public.is_company_staff(auth.uid(), achievements.company_id)
  or exists (
    select 1 from public.students s
    where s.user_id = auth.uid()
      and s.company_id = achievements.company_id
  )
);

drop policy if exists "Company members access" on public.companies;
create policy "Company members access"
on public.companies for select to authenticated
using (
  public.is_company_staff(auth.uid(), companies.id)
  or exists (
    select 1 from public.students s
    where s.user_id = auth.uid() and s.company_id = companies.id
  )
);

drop policy if exists "Company members access" on public.company_members;
create policy "Company members access"
on public.company_members for select to authenticated
using (public.is_company_staff(auth.uid(), company_members.company_id));

drop policy if exists "Company scoped select" on public.exercise_library;
create policy "Company scoped select"
on public.exercise_library for select to authenticated
using (
  exercise_library.is_global
  or public.is_company_staff(auth.uid(), exercise_library.company_id)
  or exists (
    select 1 from public.students s
    where s.user_id = auth.uid()
      and s.company_id = exercise_library.company_id
  )
);

drop policy if exists "Company members read exercise metadata" on public.exercise_metadata;
drop policy if exists "Company staff manage owned exercise metadata" on public.exercise_metadata;
create policy "Company members read exercise metadata"
on public.exercise_metadata for select to authenticated
using (
  exists (
    select 1 from public.exercise_library exercise
    where exercise.id = exercise_metadata.exercise_id
      and (
        exercise.is_global
        or public.is_company_staff(auth.uid(), exercise.company_id)
        or exists (
          select 1 from public.students s
          where s.user_id = auth.uid()
            and s.company_id = exercise.company_id
        )
      )
  )
);
create policy "Company staff manage owned exercise metadata"
on public.exercise_metadata for all to authenticated
using (
  exists (
    select 1 from public.exercise_library exercise
    where exercise.id = exercise_metadata.exercise_id
      and public.is_company_staff(auth.uid(), exercise.company_id)
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'coordinator'::public.app_role)
      )
  )
)
with check (
  exists (
    select 1 from public.exercise_library exercise
    where exercise.id = exercise_metadata.exercise_id
      and public.is_company_staff(auth.uid(), exercise.company_id)
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'coordinator'::public.app_role)
      )
  )
);

drop policy if exists "Company scoped select" on public.form_fields;
create policy "Company scoped select"
on public.form_fields for select to authenticated
using (
  form_fields.company_id is null
  or public.is_company_staff(auth.uid(), form_fields.company_id)
  or exists (
    select 1 from public.students s
    where s.user_id = auth.uid() and s.company_id = form_fields.company_id
  )
);

drop policy if exists "Company scoped select" on public.plans;
create policy "Company scoped select"
on public.plans for select to authenticated
using (
  public.is_company_staff(auth.uid(), plans.company_id)
  or exists (
    select 1 from public.students s
    where s.user_id = auth.uid() and s.company_id = plans.company_id
  )
);

drop policy if exists "Company scoped select" on public.platform_settings;
create policy "Company scoped select"
on public.platform_settings for select to authenticated
using (
  platform_settings.company_id is null
  or public.is_company_staff(auth.uid(), platform_settings.company_id)
  or exists (
    select 1 from public.students s
    where s.user_id = auth.uid()
      and s.company_id = platform_settings.company_id
  )
);

drop policy if exists "Admin reads company member roles" on public.user_roles;
create policy "Admin reads company member roles"
on public.user_roles for select to authenticated
using (
  (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
  and exists (
    select 1 from public.company_members target_membership
    where target_membership.user_id = user_roles.user_id
      and public.is_company_staff(auth.uid(), target_membership.company_id)
  )
);

drop policy if exists "Company admins manage xp_settings" on public.xp_settings;
drop policy if exists "Company scoped select xp_settings" on public.xp_settings;
create policy "Company admins manage xp_settings"
on public.xp_settings for all to authenticated
using (
  public.is_company_staff(auth.uid(), xp_settings.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
)
with check (
  public.is_company_staff(auth.uid(), xp_settings.company_id)
  and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'coordinator'::public.app_role)
  )
);
create policy "Company scoped select xp_settings"
on public.xp_settings for select to authenticated
using (
  xp_settings.company_id is null
  or public.is_company_staff(auth.uid(), xp_settings.company_id)
  or exists (
    select 1 from public.students s
    where s.user_id = auth.uid() and s.company_id = xp_settings.company_id
  )
);

drop policy if exists "Student reads own achievements" on public.student_achievements;
drop policy if exists "Company staff read student achievements" on public.student_achievements;
create policy "Student reads own achievements"
on public.student_achievements for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = student_achievements.student_id
      and s.company_id = student_achievements.company_id
      and s.user_id = auth.uid()
  )
);
create policy "Company staff read student achievements"
on public.student_achievements for select to authenticated
using (
  public.is_company_staff(auth.uid(), student_achievements.company_id)
  and exists (
    select 1 from public.students s
    where s.id = student_achievements.student_id
      and s.company_id = student_achievements.company_id
  )
);

drop policy if exists "Student reads own xp" on public.xp_events;
drop policy if exists "Company staff read xp events" on public.xp_events;
create policy "Student reads own xp"
on public.xp_events for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = xp_events.student_id
      and s.company_id = xp_events.company_id
      and s.user_id = auth.uid()
  )
);
create policy "Company staff read xp events"
on public.xp_events for select to authenticated
using (
  public.is_company_staff(auth.uid(), xp_events.company_id)
  and exists (
    select 1 from public.students s
    where s.id = xp_events.student_id and s.company_id = xp_events.company_id
  )
);

-- The workout-library UI already depends on this relation, but fresh projects
-- had only the browser callsites and no canonical schema migration.
create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text,
  level text,
  focus text,
  workouts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(workouts) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workout_templates_company_updated_idx
on public.workout_templates (company_id, updated_at desc);

create or replace function public.enforce_workout_template_integrity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    elsif new.created_by is distinct from old.created_by then
      raise exception 'workout template creator cannot be reassigned'
        using errcode = '23514';
    end if;
  end if;

  if new.created_by is not null
     and not public.has_role(new.created_by, 'master'::public.app_role)
     and not public.is_company_staff(new.created_by, new.company_id) then
    raise exception 'workout template creator must belong to its company'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists zz_enforce_workout_template_integrity
on public.workout_templates;
create trigger zz_enforce_workout_template_integrity
before insert or update on public.workout_templates
for each row execute function public.enforce_workout_template_integrity();

drop trigger if exists update_workout_templates_updated_at
on public.workout_templates;
create trigger update_workout_templates_updated_at
before update on public.workout_templates
for each row execute function public.update_updated_at_column();

alter table public.workout_templates enable row level security;
drop policy if exists workout_templates_master_all on public.workout_templates;
drop policy if exists workout_templates_staff_all on public.workout_templates;
create policy workout_templates_master_all
on public.workout_templates for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));
create policy workout_templates_staff_all
on public.workout_templates for all to authenticated
using (public.is_company_staff(auth.uid(), workout_templates.company_id))
with check (public.is_company_staff(auth.uid(), workout_templates.company_id));

-- Trigger functions are internal implementation details, not RPC endpoints.
-- Revoking browser execution does not affect trigger execution and removes the
-- historical default EXECUTE privilege without guessing at function names.
do $revoke_trigger_function_execution$
declare
  v_function record;
begin
  for v_function in
    select distinct
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
  end loop;
end;
$revoke_trigger_function_execution$;

-- Supabase projects created after May 2026 no longer expose new public objects
-- automatically. Rebuild the Data API surface from the final RLS catalog so a
-- fresh staging project is independent of legacy default privileges. Object
-- grants only make a table reachable; every row still has to pass RLS.
grant usage on schema public to anon, authenticated, service_role;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;

do $grant_policy_backed_table_access$
declare
  v_table record;
begin
  for v_table in
    select
      c.relname as table_name,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'anon'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'r')
      ) as anon_select,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'anon'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'a')
      ) as anon_insert,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'anon'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'w')
      ) as anon_update,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'anon'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'd')
      ) as anon_delete,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'authenticated'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'r')
      ) as authenticated_select,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'authenticated'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'a')
      ) as authenticated_insert,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'authenticated'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'w')
      ) as authenticated_update,
      bool_or(
        (0::oid = any(pol.polroles)
          or 'authenticated'::pg_catalog.regrole::oid = any(pol.polroles))
        and pol.polcmd in ('*', 'd')
      ) as authenticated_delete
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_policy pol on pol.polrelid = c.oid
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
    group by c.relname
  loop
    if v_table.anon_select then
      execute format('grant select on public.%I to anon', v_table.table_name);
    end if;
    if v_table.anon_insert then
      execute format('grant insert on public.%I to anon', v_table.table_name);
    end if;
    if v_table.anon_update then
      execute format('grant update on public.%I to anon', v_table.table_name);
    end if;
    if v_table.anon_delete then
      execute format('grant delete on public.%I to anon', v_table.table_name);
    end if;
    if v_table.authenticated_select then
      execute format('grant select on public.%I to authenticated', v_table.table_name);
    end if;
    if v_table.authenticated_insert then
      execute format('grant insert on public.%I to authenticated', v_table.table_name);
    end if;
    if v_table.authenticated_update then
      execute format('grant update on public.%I to authenticated', v_table.table_name);
    end if;
    if v_table.authenticated_delete then
      execute format('grant delete on public.%I to authenticated', v_table.table_name);
    end if;
  end loop;
end;
$grant_policy_backed_table_access$;

-- Functions are not protected by RLS. Start from a closed browser surface,
-- then expose only policy helpers and RPCs with verified in-function/RLS
-- authorization that have current repository callsites.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

grant execute on function public.get_active_platform_ads(text, text, uuid)
to anon, authenticated;

grant execute on function public.has_role(uuid, public.app_role),
  public.get_user_company_id(uuid),
  public.get_user_role(uuid),
  public.is_company_staff(uuid, uuid),
  public.is_student_company_staff(uuid, uuid),
  public.current_business_date(),
  public.try_uuid(text),
  public.award_xp(uuid, text, integer, uuid, text),
  public.check_and_unlock_achievements(uuid),
  public.cohort_feedback_summary(uuid),
  public.contact_cadence(uuid),
  public.get_company_ai_identity(uuid),
  public.get_effective_exercise_targets(uuid, uuid[]),
  public.get_monthly_leaderboard(uuid, date),
  public.get_student_rank(uuid),
  public.mark_training_cycle_viewed(uuid),
  public.move_student_to_assessment_stage(uuid, text),
  public.recalculate_training_cycles(uuid, date),
  public.replace_exercise_muscle_targets(uuid, jsonb),
  public.reschedule_training_cycles_from(uuid, uuid, date),
  public.save_workout_logs_if_current(jsonb),
  public.sync_prescription_cycles(uuid, date)
to authenticated;
