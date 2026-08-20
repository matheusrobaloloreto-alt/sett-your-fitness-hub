\set ON_ERROR_STOP on

begin;

create temporary table qa_trainer_history_ctx (
  history_id uuid not null,
  legacy_user_id uuid not null,
  student_id uuid not null,
  company_id uuid not null,
  other_company_id uuid not null,
  valid_trainer_id uuid not null,
  valid_previous_trainer_id uuid not null,
  valid_changed_by_id uuid not null,
  other_company_user_id uuid not null
) on commit drop;

insert into qa_trainer_history_ctx
select
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid();

insert into auth.users (id, email, created_at, updated_at)
select valid_trainer_id, 'qa-trainer-history-primary@invalid.local', now(), now()
from qa_trainer_history_ctx
union all
select valid_previous_trainer_id, 'qa-trainer-history-previous@invalid.local', now(), now()
from qa_trainer_history_ctx
union all
select valid_changed_by_id, 'qa-trainer-history-changer@invalid.local', now(), now()
from qa_trainer_history_ctx
union all
select other_company_user_id, 'qa-trainer-history-other-company@invalid.local', now(), now()
from qa_trainer_history_ctx;

insert into public.companies (id, name, slug)
select company_id, 'QA Trainer History Primary', 'qa-trainer-history-primary'
from qa_trainer_history_ctx
union all
select other_company_id, 'QA Trainer History Other', 'qa-trainer-history-other'
from qa_trainer_history_ctx;

insert into public.company_members (company_id, user_id)
select company_id, valid_trainer_id from qa_trainer_history_ctx
union all
select company_id, valid_previous_trainer_id from qa_trainer_history_ctx
union all
select company_id, valid_changed_by_id from qa_trainer_history_ctx
union all
select other_company_id, other_company_user_id from qa_trainer_history_ctx;

insert into public.students (id, company_id, full_name, status)
select student_id, company_id, 'QA Trainer History Student', 'active'
from qa_trainer_history_ctx;

alter table public.trainer_assignments_history
  disable trigger zz_enforce_trainer_history_reference_integrity;

insert into public.trainer_assignments_history (
  id,
  student_id,
  trainer_id,
  previous_trainer_id,
  company_id,
  assigned_at,
  changed_by,
  notes
)
select
  history_id,
  student_id,
  legacy_user_id,
  legacy_user_id,
  company_id,
  now(),
  legacy_user_id,
  'legacy'
from qa_trainer_history_ctx;

alter table public.trainer_assignments_history
  enable trigger zz_enforce_trainer_history_reference_integrity;

-- An unrelated update must preserve the immutable historical UUIDs.
update public.trainer_assignments_history
set notes = 'unrelated update allowed'
where id = (select history_id from qa_trainer_history_ctx);

-- A new invalid reference remains forbidden.
do $$
begin
  begin
    update public.trainer_assignments_history
    set trainer_id = gen_random_uuid()
    where id = (select history_id from qa_trainer_history_ctx);
    raise exception 'New invalid trainer reference unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;

-- The other immutable audit references are protected symmetrically.
do $$
begin
  begin
    update public.trainer_assignments_history
    set previous_trainer_id = gen_random_uuid()
    where id = (select history_id from qa_trainer_history_ctx);
    raise exception 'New invalid previous trainer reference unexpectedly succeeded';
  exception when check_violation then
    null;
  end;

  begin
    update public.trainer_assignments_history
    set changed_by = gen_random_uuid()
    where id = (select history_id from qa_trainer_history_ctx);
    raise exception 'New invalid changer reference unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;

-- A current member of the same company remains a valid replacement for every
-- guarded reference.
update public.trainer_assignments_history
set trainer_id = (select valid_trainer_id from qa_trainer_history_ctx),
    previous_trainer_id = (
      select valid_previous_trainer_id from qa_trainer_history_ctx
    ),
    changed_by = (select valid_changed_by_id from qa_trainer_history_ctx)
where id = (select history_id from qa_trainer_history_ctx);

-- A tenant switch forces all retained references to be checked again. Disable
-- the generic student/company trigger only for this assertion so the failure
-- is proven to come from the trainer-history guard itself.
alter table public.trainer_assignments_history
  disable trigger zz_enforce_student_company_integrity;

do $$
begin
  begin
    update public.trainer_assignments_history
    set company_id = (select other_company_id from qa_trainer_history_ctx)
    where id = (select history_id from qa_trainer_history_ctx);
    raise exception 'Cross-company history reassignment unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;

alter table public.trainer_assignments_history
  enable trigger zz_enforce_student_company_integrity;

do $$
begin
  if not exists (
    select 1
    from public.trainer_assignments_history h
    join qa_trainer_history_ctx q on q.history_id = h.id
    where h.notes = 'unrelated update allowed'
      and h.company_id = q.company_id
      and h.trainer_id = q.valid_trainer_id
      and h.previous_trainer_id = q.valid_previous_trainer_id
      and h.changed_by = q.valid_changed_by_id
  ) then
    raise exception 'Drift-safe trainer history assertions failed';
  end if;
end;
$$;

rollback;

\echo 'Trainer history drift guard PASS: fresh fixture, immutable refs, symmetric field and tenant validation'
