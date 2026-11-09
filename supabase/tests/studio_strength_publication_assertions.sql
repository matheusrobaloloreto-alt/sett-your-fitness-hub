begin;

-- Compact deterministic IDs make it possible to spot cross-cycle or cross-tenant mistakes.
create function public.fixture_id(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into cycle_templates values
  (fixture_id(90), fixture_id(1), '{"workouts":[{"name":"Modelo","exercises":[{}]}]}'),
  (fixture_id(91), fixture_id(99), '{"workouts":[{"name":"Outro","exercises":[{}]}]}');
insert into auth.users values (fixture_id(2)), (fixture_id(3));
insert into companies values (fixture_id(1));
insert into students (id, company_id, user_id) values (fixture_id(2), fixture_id(1), fixture_id(2));
insert into enrollments values (fixture_id(4), fixture_id(1), fixture_id(2), 'active');
insert into training_cycles (id, company_id, student_id, enrollment_id, status, start_date, end_date, cycle_number)
values
  (fixture_id(10), fixture_id(1), fixture_id(2), fixture_id(4), 'active', '2026-11-01', '2026-12-12', 1),
  (fixture_id(11), fixture_id(1), fixture_id(2), fixture_id(4), 'pending', '2026-12-13', '2027-01-23', 2);
insert into prescription_bundles
  (id, company_id, student_id, training_cycle_id, has_strength, has_cardio, modalities, status, studio_strength_draft)
values
  (fixture_id(20), fixture_id(1), fixture_id(2), fixture_id(10), true, false, array['musculacao'], 'active', false),
  (fixture_id(21), fixture_id(1), fixture_id(2), fixture_id(10), true, true, array['musculacao','corrida'], 'active', false);
update training_cycles set bundle_id = fixture_id(20), prescribed_offline_at = '2026-10-30' where id = fixture_id(10);
insert into workouts (id, cycle_id, company_id, title, exercises, updated_at)
values (fixture_id(40), fixture_id(10), fixture_id(1), 'Treino anterior', '[{}]', '2026-11-01');

insert into prescription_bundles
  (id, company_id, student_id, training_cycle_id, has_strength, has_cardio, modalities, status, studio_strength_draft)
values
  (fixture_id(22), fixture_id(1), fixture_id(2), fixture_id(10), true, false, array['musculacao'], 'draft', true),
  (fixture_id(23), fixture_id(1), fixture_id(2), fixture_id(11), true, false, array['musculacao'], 'draft', true);

insert into ai_strength_plans (id, company_id, student_id, training_cycle_id, bundle_id, plan, duration_weeks,
  updated_at, studio_draft_cycle_id)
values
  (fixture_id(30), fixture_id(1), fixture_id(2), fixture_id(10), fixture_id(20), '{"old":true}', 6, '2026-11-01', null),
  (fixture_id(31), fixture_id(1), fixture_id(2), null, null, '{"legacy":true}', 6, '2026-11-01', null),
  (fixture_id(32), fixture_id(1), fixture_id(2), null, fixture_id(22), '{"workouts":[{}]}', 6, '2026-11-06', fixture_id(10)),
  (fixture_id(33), fixture_id(1), fixture_id(2), null, fixture_id(23), '{"workouts":[{}]}', 6, '2026-11-06', fixture_id(11));

update prescription_bundles set strength_plan_id = fixture_id(30) where id = fixture_id(20);
insert into prescription_bundle_items values (fixture_id(22), fixture_id(1), fixture_id(2), 'avaliacao', 'functional_assessment', fixture_id(50));

create function public.fixture_publish(draft int default 32, cycle int default 10,
  version timestamptz default '2026-11-06')
returns jsonb language sql as $$
  select public.publish_studio_strength_draft(fixture_id(draft), fixture_id(cycle), version,
    '{"cycle_name":"Novo","workouts":[{"name":"Treino novo","exercises":[{}]}]}',
    '[{"title":"Treino novo","exercises":[{}]}]')
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', fixture_id(2)::text, true);
do $$
begin
  if (select array_agg(id order by id) from ai_strength_plans) is distinct from array[fixture_id(30),fixture_id(31)]
    or exists (select from prescription_bundles where id = fixture_id(22))
    or exists (select from prescription_bundle_items where bundle_id = fixture_id(22)) then
    raise exception 'student draft visibility failure';
  end if;
  begin
    perform fixture_publish();
    raise exception 'student published strength';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_forbidden' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', fixture_id(99)::text, true);
do $$
begin
  begin
    perform fixture_publish();
    raise exception 'out-of-scope staff published strength';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_forbidden' then raise; end if;
  end;
end $$;

reset role;
do $$
begin
  begin
    update ai_strength_plans set bundle_id = fixture_id(22), plan = '{"overwritten":true}' where id = fixture_id(30);
    raise exception 'legacy generation overwrote the current strength plan';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_draft_link_invalid' then raise; end if;
  end;
end $$;

-- Fail after workouts, the strength link, and the bundle have already been updated.
create function public.fixture_reject_item() returns trigger language plpgsql as $$
begin
  if current_setting('sett.test_fail_item', true) = 'yes' then
    raise exception 'fixture_late_failure';
  end if;
  return new;
end $$;
create trigger fixture_reject_item before insert on prescription_bundle_items for each row execute function fixture_reject_item();

set local role authenticated;
select set_config('request.jwt.claim.sub', fixture_id(3)::text, true);
do $$
begin
  begin
    perform public.stage_studio_strength_template(fixture_id(10), fixture_id(91));
    raise exception 'other tenant template accepted';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_template_invalid' then raise; end if;
  end;
  if not exists (select from ai_strength_plans where id = fixture_id(32)) then
    raise exception 'authorized staff cannot see draft';
  end if;
  begin
    perform fixture_publish(version => '2026-11-05');
    raise exception 'stale draft accepted';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_draft_changed' then raise; end if;
  end;
  begin
    update ai_strength_plans set bundle_id = null, studio_draft_cycle_id = null where id = fixture_id(32);
    raise exception 'staff removed the draft visibility guard';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_draft_link_invalid' then raise; end if;
  end;
  begin
    update prescription_bundles set studio_strength_draft = false, status = 'active' where id = fixture_id(22);
    raise exception 'staff bypassed bundle promotion';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_draft_link_invalid' then raise; end if;
  end;
  perform set_config('sett.test_feature_off','yes',true);
  begin
    perform fixture_publish();
    raise exception 'published while the commercial feature was disabled';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_forbidden' then raise; end if;
  end;
  perform set_config('sett.test_feature_off','no',true);
  perform set_config('sett.test_fail_item','yes',true);
  begin
    perform fixture_publish();
    raise exception 'late failure was swallowed';
  exception when raise_exception then
    if sqlerrm <> 'fixture_late_failure' then raise; end if;
  end;
end $$;

reset role;
select set_config('sett.test_fail_item','no',true);
do $$
begin
  begin
    update training_cycles set start_date = '2026-11-02' where id = fixture_id(10);
    perform fixture_publish();
    raise exception 'changed cycle accepted';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_cycle_changed' then raise; end if;
  end;
  begin
    update training_cycles set prescribed_offline_at = '2026-11-07' where id = fixture_id(10);
    perform fixture_publish();
    raise exception 'changed offline marker accepted';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_cycle_changed' then raise; end if;
  end;
  begin
    update workouts set updated_at = '2026-11-07' where id = fixture_id(40);
    perform fixture_publish();
    raise exception 'changed workouts accepted';
  exception when raise_exception then
    if sqlerrm <> 'workout_revision_changed' then raise; end if;
  end;
  if (select count(*) from workouts) <> 1
    or (select superseded_at from workouts where id = fixture_id(40)) is not null
    or exists (select from ai_plan_versions)
    or (select training_cycle_id from ai_strength_plans where id = fixture_id(30)) is distinct from fixture_id(10)
    or (select studio_draft_cycle_id from ai_strength_plans where id = fixture_id(32)) is distinct from fixture_id(10)
    or (select status from prescription_bundles where id = fixture_id(22)) is distinct from 'draft'
    or (select bundle_id from training_cycles where id = fixture_id(10)) is distinct from fixture_id(20) then
    raise exception 'partial publication persisted';
  end if;
end $$;

-- The draft is already loaded, and a recorded dispensation previously allowed
-- generation without a response. A late clinical response must supersede it.
insert into intercycle_anamnesis_waivers (
  company_id, student_id, enrollment_id, training_cycle_id, prior_cycle_id, reason, waived_by
) values (fixture_id(1), fixture_id(2), fixture_id(4), fixture_id(11), fixture_id(10), 'Dispensa original', fixture_id(3));
insert into intercycle_anamnesis_deliveries (
  id, company_id, student_id, enrollment_id, training_cycle_id,
  idempotency_key, status, scheduled_for, last_error_code
) values (
  fixture_id(60), fixture_id(1), fixture_id(2), fixture_id(4), fixture_id(10),
  'studio-publication-fixture', 'ready', now(), 'intercycle_manual_link_ready'
);
insert into intercycle_anamnesis_invites (
  delivery_id, company_id, student_id, enrollment_id, training_cycle_id, token_sha256, expires_at
) values (fixture_id(60), fixture_id(1), fixture_id(2), fixture_id(4), fixture_id(10), repeat('a', 64), now() + interval '1 hour');
savepoint before_intercycle_response;
set local role service_role;
select public.submit_intercycle_anamnesis(repeat('a', 64), 'same', true, null, false, null,
  null, null, null, true, 'Synthetic QA', 6, null, null, null, true, 'intercycle-sensitive-v1');
set local role authenticated;
do $$
begin
  begin
    perform fixture_publish(33, 11, '2026-11-06');
    raise exception 'published despite a late clinical response';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_intercycle_review_required' then raise; end if;
  end;
  if not exists (select from ai_strength_plans where id = fixture_id(33) and studio_draft_cycle_id = fixture_id(11)
      and training_cycle_id is null and updated_at = '2026-11-06' and studio_publication is null)
    or not exists (select from prescription_bundles where id = fixture_id(23)
      and status = 'draft' and studio_strength_draft and strength_plan_id is null)
    or exists (select from workouts where cycle_id = fixture_id(11))
    or exists (select from prescription_bundle_items where bundle_id = fixture_id(23))
    or (select bundle_id from training_cycles where id = fixture_id(11)) is not null
    or not exists (select from workouts where id = fixture_id(40) and superseded_at is null) then
    raise exception 'blocked publication modified the draft, cycle, bundle or workouts';
  end if;
end $$;
rollback to before_intercycle_response;

-- Normal publication with a new non-blocking response at the EVA threshold.
set local role service_role;
select public.submit_intercycle_anamnesis(repeat('a', 64), 'same', true, null, false, null,
  null, null, null, true, 'Synthetic QA', 5, null, null, null, true, 'intercycle-sensitive-v1');

set local role authenticated;
select set_config('sett.test_fail_item','no',true);
do $$
declare
  receipt jsonb := fixture_publish();
  replay jsonb := fixture_publish();
  future jsonb := fixture_publish(33, 11, '2026-11-06');
  template jsonb := public.stage_studio_strength_template(fixture_id(10), fixture_id(90));
begin
  if template->'plan'->'workouts'->0->>'name' is distinct from 'Modelo'

    or not exists (select from ai_strength_plans where id = (template->>'id')::uuid
      and studio_draft_cycle_id = fixture_id(10) and training_cycle_id is null) then
    raise exception 'template did not open a private draft on the selected cycle';
  end if;
  if receipt->>'replayed' <> 'false' or receipt->>'current' <> 'true'
    or replay->>'replayed' <> 'true' or receipt->>'revision_id' is distinct from replay->>'revision_id'
    or future->>'scheduled' <> 'true' or future->>'current' <> 'false' then
    raise exception 'unexpected publication confirmation';
  end if;
end $$;

reset role;
do $$
begin
  begin
    update workouts set updated_at = '2026-11-08' where cycle_id = fixture_id(10) and superseded_at is null;
    perform fixture_publish();
    raise exception 'receipt replay confirmed a workout edited in place';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_draft_changed' then raise; end if;
  end;
  if (select count(*) from ai_plan_versions) <> 2
    or (select count(*) from workouts where cycle_id = fixture_id(10) and superseded_at is null) <> 1
    or (select superseded_at from workouts where id = fixture_id(40)) is null
    or (select studio_superseded_cycle_id from ai_strength_plans where id = fixture_id(30)) is distinct from fixture_id(10)
    or (select training_cycle_id from ai_strength_plans where id = fixture_id(32)) is distinct from fixture_id(10)
    or (select plan->>'cycle_name' from ai_strength_plans where id = fixture_id(32)) is distinct from 'Novo'
    or (select strength_plan_id from prescription_bundles where id = fixture_id(22)) is distinct from fixture_id(32)
    or (select status from prescription_bundles where id = fixture_id(20)) is distinct from 'superseded'
    or (select status from prescription_bundles where id = fixture_id(21)) is distinct from 'active'
    or (select count(*) from prescription_bundle_items where bundle_id = fixture_id(22) and modality = 'musculacao') <> 2
    or (select bundle_id from training_cycles where id = fixture_id(10)) is distinct from fixture_id(22)
    or (select prescribed_offline_at from training_cycles where id = fixture_id(10)) is not null
    or (select status from training_cycles where id = fixture_id(11)) is distinct from 'pending' then
    raise exception 'inconsistent published state';
  end if;
end $$;

set local role service_role;
do $$
begin
  begin
    update ai_strength_plans set plan = '{"legacy_overwrite":true}' where id = fixture_id(32);
    raise exception 'legacy service overwrote a published plan';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_draft_link_invalid' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', fixture_id(2)::text, true);
do $$
begin
  if (select array_agg(id order by id) from ai_strength_plans) is distinct from array[fixture_id(31),fixture_id(32)] then
    raise exception 'student can see a retired or future plan, or lost legacy access';
  end if;
end $$;

-- The existing archive RPC detaches the published plan and leaves the row for audit.
reset role;
update ai_strength_plans set training_cycle_id = null, bundle_id = null where id = fixture_id(33);
set local role authenticated;
do $$
begin
  if exists (select from ai_strength_plans where id = fixture_id(33))
    or not exists (select from ai_strength_plans where id = fixture_id(31)) then
    raise exception 'detached Studio publication reappeared as a legacy plan';
  end if;
end $$;

rollback;
