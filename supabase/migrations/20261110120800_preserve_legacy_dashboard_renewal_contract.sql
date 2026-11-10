-- Keep the previous dashboard contract for already-open tabs. The new queue
-- has a different scope and may include contracts without an end date.
do $migration$
declare
  definition text := pg_get_functiondef('commercial_private.get_company_dashboard_snapshot(uuid)'::regprocedure);
  old_anchor constant text := $sql$'renewalQueueVersion',1,'expiringContracts',coalesce(($sql$;
  new_anchor constant text := $sql$'expiringContracts',coalesce((
    select jsonb_agg(row order by end_date desc,id) from contracts
    where status in ('active','awaiting_renewal') and student_status in ('active','pending','awaiting_renewal')
      and end_date <= _today+(_experience->>'renewal_notice_days')::int
  ),'[]'::jsonb),
    'renewalQueueVersion',2,'dashboardRenewalContracts',coalesce(($sql$;
begin
  if strpos(definition, old_anchor) = 0
    or length(definition) - length(replace(definition, old_anchor, '')) <> length(old_anchor)
    or strpos(definition, '_experience jsonb') = 0
  then
    raise exception 'Unexpected dashboard renewal definition for compatibility';
  end if;
  execute replace(definition, old_anchor, new_anchor);
end
$migration$;
