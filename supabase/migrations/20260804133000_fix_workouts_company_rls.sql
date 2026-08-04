-- Backfill and protect workouts.company_id so non-master staff can save workouts
-- through RLS. Older rows without company_id were visible to master but blocked
-- trainers on UPDATE because the policy is company scoped.

update public.workouts w
set
  company_id = resolved.company_id,
  name = coalesce(nullif(w.name, ''), nullif(w.title, ''), 'Treino'),
  updated_at = now()
from (
  select
    tc.id as cycle_id,
    coalesce(tc.company_id, e.company_id) as company_id
  from public.training_cycles tc
  left join public.enrollments e on e.id = tc.enrollment_id
) resolved
where w.cycle_id = resolved.cycle_id
  and resolved.company_id is not null
  and w.company_id is distinct from resolved.company_id;

create or replace function public.set_workout_company_from_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if new.cycle_id is null then
    return new;
  end if;

  select coalesce(tc.company_id, e.company_id)
  into v_company_id
  from public.training_cycles tc
  left join public.enrollments e on e.id = tc.enrollment_id
  where tc.id = new.cycle_id;

  if v_company_id is not null then
    if new.company_id is null then
      new.company_id := v_company_id;
    elsif new.company_id is distinct from v_company_id then
      raise exception 'workout company_id must match training cycle company_id';
    end if;
  end if;

  if new.name is null or btrim(new.name) = '' then
    new.name := coalesce(nullif(new.title, ''), 'Treino');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_workout_company_from_cycle on public.workouts;
create trigger trg_set_workout_company_from_cycle
before insert or update of cycle_id, company_id, name, title
on public.workouts
for each row
execute function public.set_workout_company_from_cycle();
