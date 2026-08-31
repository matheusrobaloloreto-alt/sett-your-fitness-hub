alter table public.payments
  add column if not exists plan_id uuid references public.plans(id) on delete set null,
  add column if not exists plan_name_snapshot text,
  add column if not exists plan_duration_weeks_snapshot integer,
  add column if not exists checkout_request_key text;

update public.payments p
set plan_id = e.plan_id
from public.enrollments e
where p.enrollment_id = e.id
  and p.plan_id is null;

update public.payments p
set plan_name_snapshot = pl.name,
    plan_duration_weeks_snapshot = pl.duration_weeks
from public.plans pl
where p.plan_id = pl.id
  and (p.plan_name_snapshot is null or p.plan_duration_weeks_snapshot is null);

create unique index if not exists payments_checkout_request_key_unique
  on public.payments (checkout_request_key)
  where checkout_request_key is not null;

create index if not exists payments_plan_id_idx on public.payments (plan_id);

comment on column public.payments.plan_id is
  'Immutable plan association captured when the charge is created.';
comment on column public.payments.checkout_request_key is
  'Server-derived checkout idempotency key. Never contains card data.';
