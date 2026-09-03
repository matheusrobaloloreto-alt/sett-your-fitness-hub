begin;

-- Optimistic locking for editable strength prescriptions depends on this
-- server-owned timestamp. Some linked environments were created without the
-- column even though the original table definition contains it, so keep this
-- repair idempotent and preserve the creation time for existing rows.
alter table public.ai_strength_plans
  add column if not exists updated_at timestamptz;

update public.ai_strength_plans
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.ai_strength_plans
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists update_ai_strength_plans_updated_at
  on public.ai_strength_plans;

create trigger update_ai_strength_plans_updated_at
before update on public.ai_strength_plans
for each row execute function public.update_updated_at_column();

comment on column public.ai_strength_plans.updated_at is
  'Server-owned version used for optimistic locking of strength prescription drafts.';

commit;
