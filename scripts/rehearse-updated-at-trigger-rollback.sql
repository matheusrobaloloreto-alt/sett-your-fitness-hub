-- Synthetic rehearsal of the production updated_at trigger used by rollback.
-- The only data changed is a transaction-local temporary row; nothing persists.

begin;

create temporary table pg_temp.updated_at_rollback_probe (
  id integer primary key,
  business_state text not null,
  updated_at timestamptz not null
) on commit drop;

create trigger updated_at_rollback_probe_touch
before update on pg_temp.updated_at_rollback_probe
for each row execute function public.update_updated_at_column();

insert into pg_temp.updated_at_rollback_probe(id,business_state,updated_at)
values (1,'after-state',timestamptz '2000-01-01 00:00:00+00');

update pg_temp.updated_at_rollback_probe
set business_state='before-state',
    updated_at=timestamptz '1999-01-01 00:00:00+00'
where id=1;

do $assert_trigger_behavior$
begin
  if not exists (
    select 1
    from pg_temp.updated_at_rollback_probe
    where id=1
      and business_state='before-state'
      and updated_at is not distinct from transaction_timestamp()
  ) then
    raise exception 'updated_at_rollback_trigger_rehearsal_failed';
  end if;
end
$assert_trigger_behavior$;

select
  count(*)::integer as synthetic_rows,
  bool_and(business_state='before-state') as business_state_restored,
  bool_and(updated_at is not distinct from transaction_timestamp()) as trigger_timestamp_observed
from pg_temp.updated_at_rollback_probe;

rollback;
