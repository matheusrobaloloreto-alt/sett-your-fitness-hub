-- Each Studio generation has its own bundle. Keep that bundle reserved after
-- publication as well, so a late insert cannot recreate its private draft.
create unique index ai_strength_plans_studio_bundle_uidx
  on public.ai_strength_plans (bundle_id)
  where studio_draft_cycle_id is not null or studio_publication is not null;

-- Serialize a new private draft with changes to the package status. A share
-- lock permits concurrent inserts to reach the unique index and prevents an
-- already failed package from accepting a late result.
create function public.guard_studio_strength_generation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.prescription_bundles bundle
  where bundle.id = new.bundle_id and bundle.company_id = new.company_id
    and bundle.student_id = new.student_id and bundle.training_cycle_id = new.studio_draft_cycle_id
    and bundle.studio_strength_draft and bundle.has_strength
    and bundle.status in ('generating', 'draft')
  for share;
  if not found then
    raise exception 'studio_strength_generation_closed' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_studio_strength_generation_status()
from public, anon, authenticated, service_role;

create trigger guard_studio_strength_generation_status
before insert on public.ai_strength_plans for each row
when (new.studio_draft_cycle_id is not null)
execute function public.guard_studio_strength_generation_status();
