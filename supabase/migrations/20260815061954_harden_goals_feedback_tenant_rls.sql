-- Replace two legacy self-correlated policies that allowed any staff role to
-- treat the row's company_id as proof of membership. Every write now proves
-- the caller's tenant and the referenced student/cycle ownership.

alter table public.student_goals enable row level security;

drop policy if exists master_all_student_goals on public.student_goals;
drop policy if exists staff_student_goals on public.student_goals;
drop policy if exists student_read_student_goals on public.student_goals;
drop policy if exists student_goals_master_all on public.student_goals;
drop policy if exists student_goals_staff_select on public.student_goals;
drop policy if exists student_goals_staff_insert on public.student_goals;
drop policy if exists student_goals_staff_update on public.student_goals;
drop policy if exists student_goals_staff_delete on public.student_goals;
drop policy if exists student_goals_student_select on public.student_goals;

create policy student_goals_master_all
on public.student_goals for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));

create policy student_goals_staff_select
on public.student_goals for select to authenticated
using (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = student_goals.student_id
      and s.company_id = student_goals.company_id
  )
);

create policy student_goals_staff_insert
on public.student_goals for insert to authenticated
with check (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = student_goals.student_id
      and s.company_id = student_goals.company_id
  )
);

create policy student_goals_staff_update
on public.student_goals for update to authenticated
using (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = student_goals.student_id
      and s.company_id = student_goals.company_id
  )
)
with check (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = student_goals.student_id
      and s.company_id = student_goals.company_id
  )
);

create policy student_goals_staff_delete
on public.student_goals for delete to authenticated
using (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = student_goals.student_id
      and s.company_id = student_goals.company_id
  )
);

create policy student_goals_student_select
on public.student_goals for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = student_goals.student_id
      and s.company_id = student_goals.company_id
      and s.user_id = auth.uid()
  )
);

alter table public.cycle_feedback enable row level security;

drop policy if exists master_all_cycle_feedback on public.cycle_feedback;
drop policy if exists staff_cycle_feedback on public.cycle_feedback;
drop policy if exists student_read_cycle_feedback on public.cycle_feedback;
drop policy if exists student_insert_cycle_feedback on public.cycle_feedback;
drop policy if exists cycle_feedback_master_all on public.cycle_feedback;
drop policy if exists cycle_feedback_staff_select on public.cycle_feedback;
drop policy if exists cycle_feedback_staff_insert on public.cycle_feedback;
drop policy if exists cycle_feedback_staff_update on public.cycle_feedback;
drop policy if exists cycle_feedback_staff_delete on public.cycle_feedback;
drop policy if exists cycle_feedback_student_select on public.cycle_feedback;
drop policy if exists cycle_feedback_student_insert on public.cycle_feedback;

create policy cycle_feedback_master_all
on public.cycle_feedback for all to authenticated
using (public.has_role(auth.uid(), 'master'::public.app_role))
with check (public.has_role(auth.uid(), 'master'::public.app_role));

create policy cycle_feedback_staff_select
on public.cycle_feedback for select to authenticated
using (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = cycle_feedback.student_id
      and s.company_id = cycle_feedback.company_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = cycle_feedback.enrollment_id
        and e.student_id = cycle_feedback.student_id
      and e.company_id = cycle_feedback.company_id
    )
  )
  and (
    cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = cycle_feedback.cycle_id
        and tc.student_id = cycle_feedback.student_id
        and tc.company_id = cycle_feedback.company_id
    )
  )
);

create policy cycle_feedback_staff_insert
on public.cycle_feedback for insert to authenticated
with check (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = cycle_feedback.student_id
      and s.company_id = cycle_feedback.company_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = cycle_feedback.enrollment_id
        and e.student_id = cycle_feedback.student_id
        and e.company_id = cycle_feedback.company_id
    )
  )
  and (
    cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = cycle_feedback.cycle_id
        and tc.student_id = cycle_feedback.student_id
        and tc.company_id = cycle_feedback.company_id
    )
  )
);

create policy cycle_feedback_staff_update
on public.cycle_feedback for update to authenticated
using (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = cycle_feedback.student_id
      and s.company_id = cycle_feedback.company_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = cycle_feedback.enrollment_id
        and e.student_id = cycle_feedback.student_id
      and e.company_id = cycle_feedback.company_id
    )
  )
  and (
    cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = cycle_feedback.cycle_id
        and tc.student_id = cycle_feedback.student_id
        and tc.company_id = cycle_feedback.company_id
    )
  )
)
with check (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = cycle_feedback.student_id
      and s.company_id = cycle_feedback.company_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = cycle_feedback.enrollment_id
        and e.student_id = cycle_feedback.student_id
        and e.company_id = cycle_feedback.company_id
    )
  )
  and (
    cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = cycle_feedback.cycle_id
        and tc.student_id = cycle_feedback.student_id
        and tc.company_id = cycle_feedback.company_id
    )
  )
);

create policy cycle_feedback_staff_delete
on public.cycle_feedback for delete to authenticated
using (
  public.is_company_staff(auth.uid(), company_id)
  and exists (
    select 1 from public.students s
    where s.id = cycle_feedback.student_id
      and s.company_id = cycle_feedback.company_id
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = cycle_feedback.enrollment_id
        and e.student_id = cycle_feedback.student_id
      and e.company_id = cycle_feedback.company_id
    )
  )
  and (
    cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = cycle_feedback.cycle_id
        and tc.student_id = cycle_feedback.student_id
        and tc.company_id = cycle_feedback.company_id
    )
  )
);

create policy cycle_feedback_student_select
on public.cycle_feedback for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id = cycle_feedback.student_id
      and s.company_id = cycle_feedback.company_id
      and s.user_id = auth.uid()
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = cycle_feedback.enrollment_id
        and e.student_id = cycle_feedback.student_id
      and e.company_id = cycle_feedback.company_id
    )
  )
  and (
    cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = cycle_feedback.cycle_id
        and tc.student_id = cycle_feedback.student_id
        and tc.company_id = cycle_feedback.company_id
    )
  )
);

create policy cycle_feedback_student_insert
on public.cycle_feedback for insert to authenticated
with check (
  not applied
  and exists (
    select 1 from public.students s
    where s.id = cycle_feedback.student_id
      and s.company_id = cycle_feedback.company_id
      and s.user_id = auth.uid()
  )
  and (
    enrollment_id is null
    or exists (
      select 1 from public.enrollments e
      where e.id = cycle_feedback.enrollment_id
        and e.student_id = cycle_feedback.student_id
        and e.company_id = cycle_feedback.company_id
    )
  )
  and (
    cycle_id is null
    or exists (
      select 1 from public.training_cycles tc
      where tc.id = cycle_feedback.cycle_id
        and tc.student_id = cycle_feedback.student_id
        and tc.company_id = cycle_feedback.company_id
    )
  )
);
