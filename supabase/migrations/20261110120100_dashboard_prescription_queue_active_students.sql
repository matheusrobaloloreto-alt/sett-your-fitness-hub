-- The trainer snapshot reads the same queue as the interactive dashboard.
-- Restrict only the upcoming-prescriptions CTE and retain the wrapper's grants.
do $migration$
declare
  definition text := pg_get_functiondef('commercial_private.get_company_dashboard_snapshot(uuid)'::regprocedure);
  anchor constant text := E'\n  ), renewal_countdowns as (';
  anchor_position integer := strpos(definition, anchor);
begin
  if anchor_position = 0
    or strpos(substring(definition from anchor_position + length(anchor)), anchor) <> 0
    or substring(definition from anchor_position - length('n on true') for length('n on true')) <> 'n on true'
  then
    raise exception 'Unexpected definition of the dashboard prescription countdowns';
  end if;

  execute overlay(definition placing E'\n    where e.student_status = ''active''' || anchor
    from anchor_position for length(anchor));
end
$migration$;
