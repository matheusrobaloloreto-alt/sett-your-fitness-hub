-- Rollback for scripts/restore-cycle-missing-exercise-library-rows-20260914.sql
-- Only removes rows inserted for the be282d1b-6d73-407f-b67c-5086337c9022 repair.

begin;

create temporary table pg_temp.rollback_exercise_library_targets as
select id
from public.exercise_library
where id in (
  'c78ec371-9f27-5abb-aa6c-a24bdd8015e7',
  '68435077-73bf-4ad9-9f10-1cf1f7fe35b8',
  'bdfadd50-d76a-5dc1-8496-bae5f85db591',
  'ccfae29c-c2cf-5a8e-bb0f-e8dd242a6e01',
  '7a8976b1-789e-4ea7-b499-8b81ece87d25',
  'da6ed290-59ef-49c0-a831-51ee224233bf',
  '627da02e-17f0-5878-84e0-263787e4ac3d',
  '7bf6dc5d-28c0-57e3-b104-5a059e2af3d0',
  '7bdb19e1-e88e-59d8-89f1-9a5ae09f7b4a',
  '3e192862-ed2e-4063-b6f9-13b433844cf8',
  'd65552e0-a929-4a03-9be0-0bb86899e428'
)
and (
  description like 'Restaurado do item importado do ciclo be282d1b-6d73-407f-b67c-5086337c9022.%'
  or description like 'Restaurado do roster de gravação SETT/BN;%'
);

do $$
declare
  v_target_count integer;
begin
  select count(*) into v_target_count from pg_temp.rollback_exercise_library_targets;

  if v_target_count <> 11 then
    raise exception 'restore_cycle_missing_exercise_library_rollback_target_mismatch expected=11 actual=%', v_target_count;
  end if;
end $$;

delete from public.exercise_muscle_targets emt
using pg_temp.rollback_exercise_library_targets target
where emt.exercise_id = target.id;

delete from public.exercise_library el
using pg_temp.rollback_exercise_library_targets target
where el.id = target.id;

commit;
