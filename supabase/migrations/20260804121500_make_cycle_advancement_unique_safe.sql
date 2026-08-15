-- Cycle advancement used to recalculate every historical cycle and could
-- reopen completed, overlapping legacy cycles. The partial unique index then
-- aborted unrelated enrollment updates when two cycles became active.

create or replace function public.advance_training_cycles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.current_business_date();
  v_previously_active uuid[];
begin
  -- Enrollment triggers and the lifecycle cron can call this function at the
  -- same time. Serialize the status transition to keep the partial unique
  -- index valid throughout the transaction.
  perform pg_advisory_xact_lock(hashtext('public.advance_training_cycles'));

  select coalesce(array_agg(tc.id), '{}'::uuid[])
  into v_previously_active
  from public.training_cycles tc
  where tc.status = 'active'
    and tc.start_date is not null
    and tc.end_date is not null
    and v_today between tc.start_date and tc.end_date;

  -- Completed cycles are historical records and must never be reopened merely
  -- because imported dates overlap the current business date.
  update public.training_cycles
  set status = 'completed'
  where status in ('active', 'pending')
    and end_date is not null
    and end_date < v_today;

  update public.training_cycles
  set status = 'pending'
  where status in ('active', 'pending')
    and start_date is not null
    and start_date > v_today;

  -- Clear current active rows first so selecting a canonical cycle cannot
  -- transiently violate training_cycles_one_active_per_enrollment_idx.
  update public.training_cycles
  set status = 'pending'
  where status in ('active', 'pending')
    and start_date is not null
    and end_date is not null
    and v_today between start_date and end_date;

  with ranked_current_cycles as (
    select
      tc.id,
      row_number() over (
        partition by tc.enrollment_id
        order by
          case when tc.id = any(v_previously_active) then 0 else 1 end,
          case when exists (
            select 1
            from public.prescription_bundles pb
            where pb.training_cycle_id = tc.id
          ) then 0 else 1 end,
          tc.start_date desc,
          tc.cycle_number desc,
          tc.created_at desc
      ) as current_rank
    from public.training_cycles tc
    where tc.enrollment_id is not null
      and tc.status = 'pending'
      and tc.start_date is not null
      and tc.end_date is not null
      and v_today between tc.start_date and tc.end_date
  )
  update public.training_cycles tc
  set status = 'active'
  from ranked_current_cycles ranked
  where tc.id = ranked.id
    and ranked.current_rank = 1;
end;
$$;

revoke all on function public.advance_training_cycles() from public, anon, authenticated;
grant execute on function public.advance_training_cycles() to service_role;

comment on function public.advance_training_cycles() is
  'Advances cycle statuses without reopening completed history and guarantees at most one active cycle per enrollment.';
