-- Load the strength fixture/migrations, integrated fixture, and integrated migration first.
begin;
create function public.fixture_id(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users values (fixture_id(2)), (fixture_id(3));
insert into companies values (fixture_id(1));
insert into students (id, company_id, user_id) values (fixture_id(2), fixture_id(1), fixture_id(2));
insert into enrollments values (fixture_id(4), fixture_id(1), fixture_id(2), 'active');
insert into training_cycles (id, company_id, student_id, enrollment_id, status, start_date, end_date, cycle_number)
values
  (fixture_id(10), fixture_id(1), fixture_id(2), fixture_id(4), 'active', '2026-11-01', '2026-12-12', 1),
  (fixture_id(11), fixture_id(1), fixture_id(2), fixture_id(4), 'pending', '2026-12-13', '2027-01-23', 2);

insert into workouts (id, cycle_id, company_id, title, exercises, updated_at)
values (fixture_id(40), fixture_id(10), fixture_id(1), 'Anterior', '[{}]', '2026-11-01');
insert into running_plans (id, company_id, student_id, training_cycle_id, name, sport, weeks, status, start_date, end_date)
select fixture_id((50 + number)::integer), fixture_id(1), fixture_id(2), fixture_id(10), 'Anterior', sport, '[{}]', 'active', '2026-11-01', '2026-12-12'
from unnest(array['corrida','natacao','ciclismo']) with ordinality modalities(sport, number);
insert into nutrition_plans (id, company_id, student_id, training_cycle_id, name, meals, status, start_date, end_date)
values (fixture_id(54), fixture_id(1), fixture_id(2), fixture_id(10), 'Anterior', '[{}]', 'active', '2026-11-01', '2026-12-12');

-- Existing published packages: replace only the one whose complete
-- selection is replaced. Future nutrition must preserve the force pointer.
insert into prescription_bundles (id, company_id, student_id, training_cycle_id,
  has_strength, has_cardio, has_nutrition, modalities, status)
values
  (fixture_id(19), fixture_id(1), fixture_id(2), fixture_id(10), false, true, true, array['corrida','nutricao'], 'active'),
  (fixture_id(23), fixture_id(1), fixture_id(2), fixture_id(11), true, false, false, array['musculacao'], 'scheduled'),
  (fixture_id(24), fixture_id(1), fixture_id(2), fixture_id(10), false, true, false, array['corrida'], 'failed');
update training_cycles set bundle_id = fixture_id(23) where id = fixture_id(11);
-- This unmarked generating row models one already open before the migration.
update prescription_bundles set status = 'generating' where id = fixture_id(24);

set local role authenticated;
select set_config('request.jwt.claim.sub', fixture_id(3)::text, true);
insert into prescription_bundles
  (id, company_id, student_id, training_cycle_id, has_strength, has_cardio, has_swimming, has_cycling, has_nutrition,
   modalities, status, studio_strength_draft, studio_modalities_draft)
values
  (fixture_id(20), fixture_id(1), fixture_id(2), fixture_id(10), true, true, true, true, true,
    array['musculacao','corrida','natacao','ciclismo','nutricao'], 'generating', true, true),
  (fixture_id(21), fixture_id(1), fixture_id(2), fixture_id(11), false, false, false, false, true,
    array['nutricao'], 'generating', false, true),
  (fixture_id(22), fixture_id(1), fixture_id(2), fixture_id(10), false, true, false, false, false,
    array['corrida'], 'generating', false, false);
insert into ai_strength_plans (id, company_id, student_id, bundle_id, plan, duration_weeks, updated_at, studio_draft_cycle_id)
values (fixture_id(30), fixture_id(1), fixture_id(2), fixture_id(20), '{"workouts":[{}]}', 6, '2026-11-06', fixture_id(10));

create function pg_temp.stage_modality(bundle int, cycle int, modality text, company int default 1)
returns jsonb language sql as $$
  select public.write_studio_modality_draft(fixture_id(bundle), fixture_id(cycle), fixture_id(company), fixture_id(2),
    modality, jsonb_build_object('modality', modality),
    case when modality = 'nutricao' then
      '{"name":"Novo","meals":[{}],"target_calories":2200,"target_protein_g":120,"target_carbs_g":250,"target_fat_g":70}'::jsonb
    else jsonb_build_object('name', 'Novo', 'sport', modality, 'weeks', '[{}]'::jsonb) end)
$$;

do $$
begin
  begin
    perform pg_temp.stage_modality(20, 10, 'corrida');
    raise exception 'authenticated called the service-only staging function';
  exception when insufficient_privilege then null;
  end;
  begin
    update prescription_bundles set status = 'active' where id = fixture_id(20);
    raise exception 'direct activation was permitted';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_link_invalid' then raise; end if;
  end;
end $$;

reset role;
set local role service_role;
do $$
declare
  first_run jsonb := pg_temp.stage_modality(20, 10, 'corrida');
begin
  if pg_temp.stage_modality(20, 10, 'corrida') <> first_run then raise exception 'generation replay changed the staged version'; end if;
  perform pg_temp.stage_modality(20, 10, 'ciclismo');
  perform pg_temp.stage_modality(20, 10, 'natacao');
  perform pg_temp.stage_modality(21, 11, 'nutricao');
  perform pg_temp.stage_modality(22, 10, 'corrida');
  begin
    perform pg_temp.stage_modality(20, 11, 'nutricao');
    raise exception 'staged against the wrong cycle';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_changed' then raise; end if;
  end;
  begin
    perform pg_temp.stage_modality(20, 10, 'nutricao', 99);
    raise exception 'staged against the wrong tenant';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_changed' then raise; end if;
  end;
  begin
    update running_plans set bundle_id = fixture_id(20), name = 'Acesso direto' where id = fixture_id(51);
    raise exception 'live cardio updated from a draft bundle';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_link_invalid' then raise; end if;
  end;
  begin
    update running_plans set bundle_id = fixture_id(24), name = 'Cached direct write' where id = fixture_id(51);
    raise exception 'old Edge wrote to a pre-migration dated generating bundle';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_link_invalid' then raise; end if;
  end;
  begin
    update nutrition_plans set bundle_id = fixture_id(20), name = 'Acesso direto' where id = fixture_id(54);
    raise exception 'live nutrition updated from a draft bundle';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_link_invalid' then raise; end if;
  end;
end $$;
reset role;

create function pg_temp.expected_versions(bundle int) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(modality, jsonb_build_object('id', id, 'updated_at', updated_at)), '{}')
  from public.studio_modality_drafts where bundle_id = fixture_id(bundle)
$$;
create function pg_temp.publish_mixed(versions jsonb) returns jsonb language sql as $$
  select public.publish_studio_integrated_bundle(fixture_id(20), fixture_id(10), versions, fixture_id(30), '2026-11-06',
    '{"workouts":[{}]}', '[{"title":"Novo","exercises":[{}]}]')
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', fixture_id(2)::text, true);
do $$
begin
  if exists (select id from studio_modality_drafts) or exists (select id from prescription_bundles where id = fixture_id(20))
    or (select count(*) from running_plans where name = 'Anterior') <> 3
    or (select count(*) from nutrition_plans where name = 'Anterior') <> 1 then
    raise exception 'generation changed the student-visible records';
  end if;
  begin
    perform pg_temp.publish_mixed('{}');
    raise exception 'student published a bundle';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_forbidden' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', fixture_id(99)::text, true);
do $$
begin
  if exists (select id from studio_modality_drafts) then raise exception 'cross-tenant draft read'; end if;
  begin
    perform pg_temp.publish_mixed('{}');
    raise exception 'cross-tenant publication';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_forbidden' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', fixture_id(3)::text, true);
update prescription_bundles set status = 'draft' where id = fixture_id(20);
do $$
begin
  begin
    perform pg_temp.publish_mixed(pg_temp.expected_versions(20));
    raise exception 'missing nutrition allowed partial publication';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_incomplete' then raise; end if;
  end;
  begin
    perform public.publish_studio_strength_draft(fixture_id(30), fixture_id(10), '2026-11-06',
      '{"workouts":[{}]}', '[{"title":"Novo","exercises":[{}]}]');
    raise exception 'legacy RPC published only strength';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_requires_integrated_publish' then raise; end if;
  end;
end $$;
reset role;

-- Supply the missing row as the storage owner to model a completed generation
-- after the deliberately premature client status change above.
insert into studio_modality_drafts (bundle_id, modality, plan, payload)
values (fixture_id(20), 'nutricao', '{}',
  '{"name":"Novo","meals":[{}],"target_calories":2200,"target_protein_g":120,"target_carbs_g":250,"target_fat_g":70}');
select set_config('sett.test_versions', pg_temp.expected_versions(20)::text, true);
set local role service_role;
do $$
declare
  old jsonb := current_setting('sett.test_versions')::jsonb->'corrida';
  v_id uuid := (old->>'id')::uuid;
  v_version timestamptz := (old->>'updated_at')::timestamptz;
begin
  perform public.write_studio_modality_draft(fixture_id(20), fixture_id(10), fixture_id(1), fixture_id(2), 'corrida',
    '{"edited":true}', '{"weeks":[{"edited":true}]}', v_version, v_id);
  begin
    perform public.write_studio_modality_draft(fixture_id(20), fixture_id(10), fixture_id(1), fixture_id(2), 'corrida',
      '{}', '{}', v_version, v_id);
    raise exception 'stale cardio editor overwrote a draft';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_changed' then raise; end if;
  end;
end $$;
reset role;

create function pg_temp.reject_late_nutrition() returns trigger language plpgsql as $$
begin
  if current_setting('sett.test_fail_nutrition', true) = 'yes' and new.name = 'Novo' then
    raise exception 'fixture_late_nutrition_failure';
  end if;
  return new;
end $$;
create trigger fixture_reject_late_nutrition before insert on nutrition_plans
  for each row execute function pg_temp.reject_late_nutrition();

set local role authenticated;
update prescription_bundles set status = 'draft' where id in (fixture_id(21), fixture_id(22));
do $$
begin
  begin
    perform pg_temp.publish_mixed(current_setting('sett.test_versions')::jsonb);
    raise exception 'stale version was published';
  exception when raise_exception then
    if sqlerrm <> 'studio_bundle_changed' then raise; end if;
  end;
end $$;
select set_config('sett.test_fail_nutrition', 'yes', true);
do $$
begin
  begin
    perform pg_temp.publish_mixed(pg_temp.expected_versions(20));
    raise exception 'expected a failure after strength and all three cardio inserts';
  exception when raise_exception then
    if sqlerrm <> 'fixture_late_nutrition_failure' then raise; end if;
  end;
  if (select count(*) from running_plans where name = 'Anterior' and training_cycle_id = fixture_id(10)) <> 3
    or exists (select 1 from running_plans where name = 'Novo')
    or not exists (select 1 from workouts where id = fixture_id(40) and superseded_at is null)
    or not exists (select 1 from ai_strength_plans where id = fixture_id(30) and studio_draft_cycle_id = fixture_id(10))
    or not exists (select 1 from prescription_bundles where id = fixture_id(20) and status = 'draft')
    or exists (select 1 from prescription_bundle_items where bundle_id = fixture_id(20)) then
    raise exception 'partial bundle survived transaction rollback';
  end if;
end $$;
select set_config('sett.test_fail_nutrition', 'no', true);
reset role;
insert into intercycle_anamnesis_deliveries (
  id, company_id, student_id, enrollment_id, training_cycle_id, idempotency_key, status, scheduled_for, last_error_code
) values (fixture_id(60), fixture_id(1), fixture_id(2), fixture_id(4), fixture_id(10),
  'studio-integrated-fixture', 'ready', now(), 'intercycle_manual_link_ready');
insert into intercycle_anamnesis_invites (
  delivery_id, company_id, student_id, enrollment_id, training_cycle_id, token_sha256, expires_at
) values (fixture_id(60), fixture_id(1), fixture_id(2), fixture_id(4), fixture_id(10), repeat('a', 64), now() + interval '1 hour');
savepoint before_intercycle_response;
set local role service_role;
select public.submit_intercycle_anamnesis(repeat('a', 64), 'same', true, null, false, null,
  null, null, null, true, 'Synthetic QA', 8, null, null, null, true, 'intercycle-sensitive-v1');
set local role authenticated;
do $$
begin
  begin
    perform public.publish_studio_integrated_bundle(fixture_id(21), fixture_id(11), pg_temp.expected_versions(21));
    raise exception 'nutrition-only bundle bypassed the late clinical response';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_intercycle_review_required' then raise; end if;
  end;
end $$;
rollback to before_intercycle_response;
set local role authenticated;

do $$
declare
  versions jsonb := pg_temp.expected_versions(20);
  standalone_versions jsonb := pg_temp.expected_versions(21);
  losing_versions jsonb := pg_temp.expected_versions(22);
  receipt jsonb := pg_temp.publish_mixed(versions);
  replay jsonb := pg_temp.publish_mixed(versions);
  future jsonb;
begin
  if receipt->'modalities' <> versions or receipt->>'strength_plan_id' <> fixture_id(30)::text
    or replay <> (receipt || '{"replayed":true}')
    or not exists (select 1 from running_plans where weeks->0->>'edited' = 'true' and sport = 'corrida')
    or (select count(*) from running_plans where training_cycle_id = fixture_id(10) and bundle_id = fixture_id(20)) <> 3
    or (select count(*) from nutrition_plans where training_cycle_id = fixture_id(10) and bundle_id = fixture_id(20)) <> 1
    or (select count(*) from prescription_bundle_items where bundle_id = fixture_id(20)) <> 6
    or not exists (select 1 from training_cycles where id = fixture_id(10) and bundle_id = fixture_id(20))
    or not exists (select 1 from prescription_bundles where id = fixture_id(20) and running_plan_id = (versions->'corrida'->>'id')::uuid
      and nutrition_plan_id = (versions->'nutricao'->>'id')::uuid and status = 'active') then
    raise exception 'incomplete commit or incorrect retry receipt';
  end if;
  begin
    perform public.publish_studio_integrated_bundle(fixture_id(22), fixture_id(10), losing_versions);
    raise exception 'competing stale publication won';
  exception when raise_exception then
    if sqlerrm <> 'studio_strength_cycle_changed' then raise; end if;
  end;
  future := public.publish_studio_integrated_bundle(fixture_id(21), fixture_id(11), standalone_versions);
  if not (future->>'scheduled')::boolean or future->>'workouts_created' <> '0'
    or not exists (select 1 from nutrition_plans where training_cycle_id = fixture_id(11)
      and status = 'active' and start_date = '2026-12-13')
    or not exists (select 1 from training_cycles where id = fixture_id(11) and bundle_id = fixture_id(23))
    or not exists (select 1 from prescription_bundles where id = fixture_id(23) and status = 'scheduled')
    or not exists (select 1 from prescription_bundles where id = fixture_id(19) and status = 'superseded') then
    raise exception 'future nutrition-only publication changed the strength pointer or dates';
  end if;
end $$;
select set_config('request.jwt.claim.sub', fixture_id(2)::text, true);
do $$
begin
  if exists (select 1 from nutrition_plans where training_cycle_id = fixture_id(11))
    or (select count(*) from running_plans where training_cycle_id = fixture_id(10) and status = 'active') <> 3
    or (select count(*) from nutrition_plans where training_cycle_id = fixture_id(10) and status = 'active') <> 1 then
    raise exception 'incorrect student visibility after publication';
  end if;
end $$;
reset role;
rollback;
