-- Run after the Studio publication fixture and the publication/idempotency migrations.
begin;

insert into public.training_cycles (id, company_id, student_id, status, start_date, end_date, cycle_number)
values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002', 'pending', '2026-11-01', '2026-12-12', 1);

insert into public.prescription_bundles (id, company_id, student_id, training_cycle_id, has_strength, status, studio_strength_draft)
select bundles.bundle_id::uuid, company_id, student_id, id, true, 'generating', true
from public.training_cycles
cross join (values ('00000000-0000-0000-0000-000000000021'), ('00000000-0000-0000-0000-000000000022')) as bundles(bundle_id);

insert into public.ai_strength_plans (id, company_id, student_id, bundle_id, studio_draft_cycle_id, plan)
select id, company_id, student_id, id, training_cycle_id, '{"workouts":[]}'
from public.prescription_bundles;

do $$
declare
  violated_constraint text;
  first_bundle constant uuid := '00000000-0000-0000-0000-000000000021';
begin
  begin
    insert into public.ai_strength_plans (id, company_id, student_id, bundle_id, studio_draft_cycle_id, plan)
    select gen_random_uuid(), company_id, student_id, id, training_cycle_id, '{"workouts":[]}'
    from public.prescription_bundles where id = first_bundle;
    raise exception 'duplicate Studio draft persisted';
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint is distinct from 'ai_strength_plans_studio_bundle_uidx' then raise; end if;
  end;

  if (select count(*) from public.ai_strength_plans) <> 2 then
    raise exception 'expected a separate draft for each intentional generation';
  end if;
end $$;

-- A late insert must be refused after the package is marked failed.
insert into public.prescription_bundles (id, company_id, student_id, training_cycle_id, has_strength, status, studio_strength_draft)
select '00000000-0000-0000-0000-000000000023', company_id, student_id, id, true, 'generating', true
from public.training_cycles;

update public.prescription_bundles set status = 'failed' where id = '00000000-0000-0000-0000-000000000023';

do $$
begin
  begin
    insert into public.ai_strength_plans (id, company_id, student_id, bundle_id, studio_draft_cycle_id, plan)
    select id, company_id, student_id, id, training_cycle_id, '{"workouts":[]}'
    from public.prescription_bundles where id = '00000000-0000-0000-0000-000000000023';
    raise exception 'late Studio draft persisted after the package failed';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'studio_strength_generation_closed' then raise; end if;
  end;
end $$;

rollback;
