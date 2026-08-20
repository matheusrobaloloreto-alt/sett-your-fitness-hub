\set ON_ERROR_STOP on

begin;

create temporary table qa_trainer_history_ctx on commit drop as
select
  gen_random_uuid() as history_id,
  gen_random_uuid() as legacy_user_id,
  s.id as student_id,
  s.company_id,
  cm.user_id as valid_user_id
from public.students s
join public.company_members cm on cm.company_id = s.company_id
limit 1;

do $$
begin
  if not exists (select 1 from qa_trainer_history_ctx) then
    raise exception 'Missing synthetic QA context';
  end if;
end;
$$;

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

-- A current member of the same company remains a valid replacement.
update public.trainer_assignments_history
set trainer_id = (select valid_user_id from qa_trainer_history_ctx)
where id = (select history_id from qa_trainer_history_ctx);

do $$
begin
  if not exists (
    select 1
    from public.trainer_assignments_history h
    join qa_trainer_history_ctx q on q.history_id = h.id
    where h.notes = 'unrelated update allowed'
      and h.trainer_id = q.valid_user_id
  ) then
    raise exception 'Drift-safe trainer history assertions failed';
  end if;
end;
$$;

rollback;

\echo 'Trainer history drift guard PASS: immutable legacy refs preserved, new refs validated'
