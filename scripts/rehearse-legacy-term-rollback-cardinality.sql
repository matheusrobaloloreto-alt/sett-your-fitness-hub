-- Negative rehearsal for exact applied-row cardinality. Uses pg_temp only.

begin;

create temporary table pg_temp.legacy_term_cardinality_probe (
  id bigint generated always as identity primary key,
  repair_key text not null,
  state text not null
) on commit drop;

create temporary table pg_temp.legacy_term_cardinality_result (
  first_batch_extra_rejected boolean not null,
  second_batch_extra_rejected boolean not null
) on commit drop;

insert into pg_temp.legacy_term_cardinality_probe(repair_key,state)
select 'bn_legacy_terms_20260909','applied' from generate_series(1,12);
insert into pg_temp.legacy_term_cardinality_probe(repair_key,state)
select 'bn_remaining_legacy_terms_20260909','applied' from generate_series(1,6);

do $cardinality$
declare
  v_first_rejected boolean := false;
  v_second_rejected boolean := false;
begin
  if (select count(*) from pg_temp.legacy_term_cardinality_probe
      where repair_key='bn_legacy_terms_20260909' and state='applied')<>12 then
    raise exception 'first_cardinality_seed_invalid';
  end if;
  if (select count(*) from pg_temp.legacy_term_cardinality_probe
      where repair_key='bn_remaining_legacy_terms_20260909' and state='applied')<>6 then
    raise exception 'second_cardinality_seed_invalid';
  end if;

  insert into pg_temp.legacy_term_cardinality_probe(repair_key,state)
  values('bn_legacy_terms_20260909','applied');
  begin
    if (select count(*) from pg_temp.legacy_term_cardinality_probe
        where repair_key='bn_legacy_terms_20260909' and state='applied')<>12 then
      raise check_violation using message='first_batch_cardinality_mismatch';
    end if;
  exception when check_violation then
    v_first_rejected := true;
  end;

  insert into pg_temp.legacy_term_cardinality_probe(repair_key,state)
  values('bn_remaining_legacy_terms_20260909','applied');
  begin
    if (select count(*) from pg_temp.legacy_term_cardinality_probe
        where repair_key='bn_remaining_legacy_terms_20260909' and state='applied')<>6 then
      raise check_violation using message='second_batch_cardinality_mismatch';
    end if;
  exception when check_violation then
    v_second_rejected := true;
  end;

  if not v_first_rejected or not v_second_rejected then
    raise exception 'legacy_term_cardinality_negative_rehearsal_failed';
  end if;
  insert into pg_temp.legacy_term_cardinality_result values(v_first_rejected,v_second_rejected);
end
$cardinality$;

select * from pg_temp.legacy_term_cardinality_result;

rollback;
