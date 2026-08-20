\set ON_ERROR_STOP on

-- Run only against a disposable database whose schema already includes
-- 20260820113000_add_explicit_staff_permissions.sql. The transaction is rolled
-- back so reruns leave no fixture data behind.
begin;

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end;
$$;

alter table auth.users disable trigger user;
insert into auth.users (id, email, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'admin-a@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'trainer-granted-a@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'trainer-scoped-a@test.invalid', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'trainer-b@test.invalid', now(), now());
alter table auth.users enable trigger user;

insert into public.companies (id, name, slug)
values
  ('20000000-0000-0000-0000-000000000001', 'Tenant A', 'tenant-a-test'),
  ('20000000-0000-0000-0000-000000000002', 'Tenant B', 'tenant-b-test');

insert into public.company_members (company_id, user_id)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004');

insert into public.user_roles (user_id, role)
values
  ('10000000-0000-0000-0000-000000000001', 'admin'),
  ('10000000-0000-0000-0000-000000000002', 'trainer'),
  ('10000000-0000-0000-0000-000000000003', 'trainer'),
  ('10000000-0000-0000-0000-000000000004', 'trainer');

insert into public.students (id, company_id, full_name, assigned_trainer_id, status)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A assigned to granted', '10000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'A assigned to scoped', '10000000-0000-0000-0000-000000000003', 'active'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'B assigned to B', '10000000-0000-0000-0000-000000000004', 'active');

insert into public.enrollments (id, company_id, student_id, trainer_id, status)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'active'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'active'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'active');

insert into public.training_cycles (
  id, enrollment_id, company_id, student_id, cycle_number, start_date, end_date, status
) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, current_date, current_date + 30, 'active'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 1, current_date, current_date + 30, 'active'),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 1, current_date, current_date + 30, 'active');

insert into public.workouts (id, cycle_id, company_id, name)
values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Workout A granted'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Workout A scoped'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Workout B');

insert into public.admin_alerts (id, company_id, type, title, target_user_id)
values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'test', 'Tenant A general', null),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'test', 'Tenant A granted trainer', '10000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'test', 'Tenant A scoped trainer', '10000000-0000-0000-0000-000000000003'),
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'test', 'Tenant B trainer', '10000000-0000-0000-0000-000000000004');

-- pg_dump --no-privileges is used by the isolated harness, so restore only the
-- normal REST privileges needed to test RLS directly.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.students, public.enrollments, public.training_cycles, public.workouts,
  public.admin_alerts
to authenticated;

select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.staff_permissions', 'select'),
  'anon must not read staff_permissions'
);
select pg_temp.assert_true(
  has_table_privilege('authenticated', 'public.staff_permissions', 'select'),
  'authenticated needs RLS-gated read access'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.staff_permissions', 'insert')
  and not has_table_privilege('authenticated', 'public.staff_permissions', 'update'),
  'authenticated must not mutate staff_permissions directly'
);

-- Admin A grants the exact trainer in tenant A through the only write path.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select pg_temp.assert_true(
  public.set_staff_permission(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'company_dashboard_full',
    true
  ),
  'admin A should grant trainer A'
);
reset role;

-- Granted trainer sees every row in A, nothing in B, through direct table
-- access (the same path exposed by REST/PostgREST).
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.assert_true(
  public.has_staff_permission('20000000-0000-0000-0000-000000000001', 'company_dashboard_full'),
  'grant must be active for tenant A'
);
select pg_temp.assert_true((select count(*) from public.students) = 2, 'granted trainer student visibility');
select pg_temp.assert_true((select count(*) from public.enrollments) = 2, 'granted trainer enrollment visibility');
select pg_temp.assert_true((select count(*) from public.training_cycles) = 2, 'granted trainer cycle visibility');
select pg_temp.assert_true((select count(*) from public.workouts) = 2, 'granted trainer workout visibility');
select pg_temp.assert_true(
  (select count(*) from public.admin_alerts where company_id = '20000000-0000-0000-0000-000000000002') = 0
  and exists (
    select 1 from public.admin_alerts
    where id = '70000000-0000-0000-0000-000000000001'
  )
  and exists (
    select 1 from public.admin_alerts
    where id = '70000000-0000-0000-0000-000000000003'
  ),
  'granted trainer sees company A alerts but no tenant B alerts'
);
do $$
declare
  changed_rows integer;
begin
  update public.students set notes = 'must stay blocked'
  where id = '30000000-0000-0000-0000-000000000002';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'ASSERTION FAILED: full dashboard grant must not widen writes';
  end if;
end;
$$;
reset role;

-- Scoped trainer sees and manages only the assigned student in A.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) from public.students) = 1, 'scoped trainer student visibility');
select pg_temp.assert_true((select count(*) from public.enrollments) = 1, 'scoped trainer enrollment visibility');
select pg_temp.assert_true((select count(*) from public.training_cycles) = 1, 'scoped trainer cycle visibility');
select pg_temp.assert_true((select count(*) from public.workouts) = 1, 'scoped trainer workout visibility');
select pg_temp.assert_true(
  not exists (
    select 1 from public.admin_alerts
    where target_user_id is distinct from '10000000-0000-0000-0000-000000000003'::uuid
  ),
  'scoped trainer target-only alerts'
);
reset role;

-- Tenant B cannot observe tenant A even if the same permission name exists.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) from public.students) = 1, 'tenant B isolation');
select pg_temp.assert_true(
  not exists (
    select 1 from public.admin_alerts
    where company_id is distinct from '20000000-0000-0000-0000-000000000002'::uuid
  ),
  'tenant B alert isolation'
);
select pg_temp.assert_true(
  not public.has_staff_permission('20000000-0000-0000-0000-000000000001', 'company_dashboard_full'),
  'tenant B cannot inherit tenant A grant'
);
reset role;

-- Revoke, then evaluate the same trainer again in this same database session.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select pg_temp.assert_true(
  not public.set_staff_permission(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'company_dashboard_full',
    false
  ),
  'admin A should revoke trainer A'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select pg_temp.assert_true(
  not public.has_staff_permission('20000000-0000-0000-0000-000000000001', 'company_dashboard_full'),
  'revocation must be visible immediately'
);
select pg_temp.assert_true((select count(*) from public.students) = 1, 'revoked trainer returns to assigned scope');
select pg_temp.assert_true(
  not exists (
    select 1 from public.admin_alerts
    where target_user_id is distinct from '10000000-0000-0000-0000-000000000002'::uuid
  ),
  'revoked trainer returns to target-only alerts'
);
reset role;

rollback;
