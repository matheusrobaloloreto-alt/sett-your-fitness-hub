-- Preserve every cycle/workout while resolving legacy duplicate active states.
-- A materialized prescription bundle is the strongest signal of the canonical
-- cycle; recency is used only as a deterministic tie-breaker.
with ranked_active_cycles as (
  select
    tc.id,
    row_number() over (
      partition by tc.enrollment_id
      order by
        case when exists (
          select 1
          from public.prescription_bundles pb
          where pb.training_cycle_id = tc.id
        ) then 0 else 1 end,
        case when current_date between tc.start_date and tc.end_date then 0 else 1 end,
        tc.cycle_number desc,
        tc.created_at desc
    ) as active_rank
  from public.training_cycles tc
  where tc.enrollment_id is not null
    and tc.status = 'active'
)
update public.training_cycles tc
set status = 'completed'
from ranked_active_cycles ranked
where tc.id = ranked.id
  and ranked.active_rank > 1;

create unique index if not exists training_cycles_one_active_per_enrollment_idx
  on public.training_cycles (enrollment_id)
  where enrollment_id is not null and status = 'active';
