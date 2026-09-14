-- Negative rehearsal for the rollback before-image integrity gate.
-- It uses only pg_temp objects, exposes no production data, and always rolls back.

begin;

create temporary table pg_temp.before_image_rollback_probe (
  id bigint generated always as identity primary key,
  before_enrollment jsonb not null,
  before_student jsonb not null,
  before_sha256 text not null
) on commit drop;

create temporary table pg_temp.before_image_rollback_result (
  corrupt_snapshot_rejected boolean not null
) on commit drop;

insert into pg_temp.before_image_rollback_probe (
  before_enrollment,
  before_student,
  before_sha256
)
select
  enrollment,
  student,
  encode(extensions.digest(
    (enrollment||jsonb_build_object('student',student))::text,
    'sha256'
  ),'hex')
from (
  values (
    '{"id":"00000000-0000-0000-0000-000000000001","status":"active"}'::jsonb,
    '{"id":"00000000-0000-0000-0000-000000000002","status":"active"}'::jsonb
  )
) as seed(enrollment,student);

do $valid_snapshot$
begin
  if (
    select count(*)
    from pg_temp.before_image_rollback_probe probe
    where probe.before_sha256=encode(extensions.digest(
      (probe.before_enrollment||jsonb_build_object('student',probe.before_student))::text,
      'sha256'
    ),'hex')
  )<>1 then
    raise exception 'before_image_negative_rehearsal_valid_seed_failed';
  end if;
end
$valid_snapshot$;

update pg_temp.before_image_rollback_probe
set before_enrollment=before_enrollment||'{"status":"corrupted"}'::jsonb;

do $corrupt_snapshot$
declare
  v_rejected boolean := false;
begin
  begin
    if (
      select count(*)
      from pg_temp.before_image_rollback_probe probe
      where probe.before_sha256=encode(extensions.digest(
        (probe.before_enrollment||jsonb_build_object('student',probe.before_student))::text,
        'sha256'
      ),'hex')
    )<>1 then
      raise check_violation using message='before_image_hash_mismatch';
    end if;
  exception when check_violation then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'before_image_negative_rehearsal_did_not_reject_corruption';
  end if;

  insert into pg_temp.before_image_rollback_result(corrupt_snapshot_rejected)
  values (v_rejected);
end
$corrupt_snapshot$;

select
  count(*)::integer as probe_rows,
  bool_and(corrupt_snapshot_rejected) as corrupt_snapshot_rejected
from pg_temp.before_image_rollback_result;

rollback;
