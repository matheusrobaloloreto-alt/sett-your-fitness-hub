-- Expand only the dashboard's renewal queue. Keep the separate reminders,
-- cycle countdowns, and the company snapshot's authorization as they are.
do $migration$
declare
  definition text := pg_get_functiondef('commercial_private.get_company_dashboard_snapshot(uuid)'::regprocedure);
  queue_start constant text := $sql$'expiringContracts',coalesce((select jsonb_agg(row order by end_date desc,id) from contracts where status in ('active','awaiting_renewal') and student_status in ('active','pending','awaiting_renewal') and end_date <= $sql$;
  queue_anchor text := queue_start || $sql$_today+(_experience->>'renewal_notice_days')::int),'[]'::jsonb)$sql$;
  queue_full constant text := $sql$'renewalQueueVersion',1,'expiringContracts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'student_id',e.student_id,'end_date',e.end_date,'trainer_id',e.trainer_id,
        'status',e.status,'created_at',e.created_at,
        'students',jsonb_build_object('full_name',s.full_name,'status',s.status),
        'plans',case when p.name is null then null else jsonb_build_object('name',p.name) end
      ) order by e.end_date,e.id)
      from public.enrollments e join students_scope s on s.id = e.student_id
      left join public.plans p on p.id = e.plan_id and p.company_id = _company_id
      where e.company_id = _company_id and e.status in ('active','awaiting_training','awaiting_renewal')
        and s.status in ('active','pending','awaiting_renewal')
    ),'[]'::jsonb)$sql$;
begin
  if strpos(definition, queue_anchor) = 0 then
    queue_anchor := queue_start || $sql$_today+7),'[]'::jsonb)$sql$;
  end if;
  if strpos(definition, queue_anchor) = 0
    or length(definition) - length(replace(definition, queue_anchor, '')) <> length(queue_anchor)
  then
    raise exception 'Unexpected definition of the dashboard renewal queue';
  end if;
  execute replace(definition, queue_anchor, queue_full);
end
$migration$;
