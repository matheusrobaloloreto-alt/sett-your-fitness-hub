-- SETT-CYCLE-UPDATE-01: a versioned, cycle-scoped update.  It deliberately
-- does not mutate student_anamneses (the original intake remains immutable).
alter table public.students
  add column if not exists intercycle_anamnesis_enabled boolean not null default false;

create table if not exists public.intercycle_anamnesis_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  training_cycle_id uuid not null references public.training_cycles(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'scheduled' check (status in ('scheduled','sending','sent','responded','failed','cancelled')),
  scheduled_for timestamptz not null,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  retry_count integer not null default 0 check (retry_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, training_cycle_id),
  unique (idempotency_key)
);

create table if not exists public.intercycle_anamnesis_invites (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.intercycle_anamnesis_deliveries(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  training_cycle_id uuid not null references public.training_cycles(id) on delete cascade,
  token_sha256 text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.intercycle_anamneses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  training_cycle_id uuid not null references public.training_cycles(id) on delete cascade,
  delivery_id uuid not null unique references public.intercycle_anamnesis_deliveries(id) on delete restrict,
  prescription_evaluation text not null check (prescription_evaluation in ('better','same','worse','not_completed')),
  goals_continue boolean not null,
  new_goals text,
  availability_changed boolean not null,
  available_days text[],
  session_duration_minutes integer check (session_duration_minutes is null or session_duration_minutes between 5 and 360),
  training_location text,
  available_equipment text,
  pain_present boolean not null,
  pain_location text,
  pain_eva integer check (pain_eva is null or pain_eva between 0 and 10),
  pain_started_at text,
  pain_movement text,
  additional_information text,
  sensitive_consent boolean not null,
  consent_text_version text not null,
  consented_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((not goals_continue) or new_goals is null),
  check ((not availability_changed) or (available_days is not null or session_duration_minutes is not null or training_location is not null or available_equipment is not null)),
  check ((not pain_present) or (pain_location is not null and pain_eva is not null)),
  check (sensitive_consent is true),
  check (length(btrim(consent_text_version)) between 3 and 80),
  check (consented_at <= submitted_at + interval '5 minutes')
);

create table if not exists public.intercycle_anamnesis_waivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  training_cycle_id uuid not null unique references public.training_cycles(id) on delete cascade,
  prior_cycle_id uuid not null references public.training_cycles(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 3 and 1000),
  waived_by uuid not null references auth.users(id) on delete restrict,
  waived_at timestamptz not null default now()
);

create index if not exists intercycle_delivery_due_idx on public.intercycle_anamnesis_deliveries(status, scheduled_for);
create index if not exists intercycle_anamneses_student_cycle_idx on public.intercycle_anamneses(company_id, student_id, training_cycle_id, submitted_at desc);

alter table public.intercycle_anamnesis_deliveries enable row level security;
alter table public.intercycle_anamnesis_invites enable row level security;
alter table public.intercycle_anamneses enable row level security;
alter table public.intercycle_anamnesis_waivers enable row level security;
revoke all on public.intercycle_anamnesis_deliveries, public.intercycle_anamnesis_invites, public.intercycle_anamneses from public, anon;
grant select on public.intercycle_anamnesis_deliveries, public.intercycle_anamnesis_invites, public.intercycle_anamneses to authenticated;
grant all on public.intercycle_anamnesis_deliveries, public.intercycle_anamnesis_invites, public.intercycle_anamneses to service_role;
revoke all on public.intercycle_anamnesis_waivers from public, anon;
grant select on public.intercycle_anamnesis_waivers to authenticated;
grant all on public.intercycle_anamnesis_waivers to service_role;

drop policy if exists "intercycle delivery company staff" on public.intercycle_anamnesis_deliveries;
drop policy if exists "intercycle delivery company staff read" on public.intercycle_anamnesis_deliveries;
drop policy if exists "intercycle invite company staff" on public.intercycle_anamnesis_invites;
drop policy if exists "intercycle answers company staff" on public.intercycle_anamneses;
drop policy if exists "intercycle answers company staff read" on public.intercycle_anamneses;
drop policy if exists "intercycle answers student read own" on public.intercycle_anamneses;
drop policy if exists "intercycle waiver company staff" on public.intercycle_anamnesis_waivers;
drop policy if exists "intercycle waiver company staff read" on public.intercycle_anamnesis_waivers;

create policy "intercycle delivery company staff read" on public.intercycle_anamnesis_deliveries for select to authenticated
  using (public.is_company_staff(auth.uid(), company_id));
create policy "intercycle invite company staff" on public.intercycle_anamnesis_invites for select to authenticated
  using (public.is_company_staff(auth.uid(), company_id));
create policy "intercycle answers company staff read" on public.intercycle_anamneses for select to authenticated
  using (public.is_company_staff(auth.uid(), company_id));
create policy "intercycle answers student read own" on public.intercycle_anamneses for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_id and s.company_id = intercycle_anamneses.company_id and s.user_id = auth.uid()));
create policy "intercycle waiver company staff read" on public.intercycle_anamnesis_waivers for select to authenticated
  using (public.is_company_staff(auth.uid(), company_id));

create or replace function public.assert_intercycle_delivery_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_student public.students%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_cycle public.training_cycles%rowtype;
begin
  select * into v_student from public.students where id = new.student_id and company_id = new.company_id;
  if not found then
    raise exception 'intercycle_student_scope_mismatch';
  end if;

  select * into v_enrollment from public.enrollments where id = new.enrollment_id;
  if not found or v_enrollment.company_id is distinct from new.company_id or v_enrollment.student_id is distinct from new.student_id then
    raise exception 'intercycle_enrollment_scope_mismatch';
  end if;
  if coalesce(v_enrollment.status, '') not in ('active','awaiting_training','awaiting_renewal') then
    raise exception 'intercycle_enrollment_status_invalid';
  end if;

  select * into v_cycle from public.training_cycles where id = new.training_cycle_id;
  if not found
    or v_cycle.company_id is distinct from new.company_id
    or v_cycle.student_id is distinct from new.student_id
    or v_cycle.enrollment_id is distinct from new.enrollment_id then
    raise exception 'intercycle_cycle_scope_mismatch';
  end if;
  if new.status <> 'cancelled'
    and (coalesce(v_cycle.status, '') in ('cancelled','superseded') or v_cycle.superseded_at is not null) then
    raise exception 'intercycle_cycle_status_invalid';
  end if;

  new.updated_at := now();
  return new;
end $$;

create or replace function public.assert_intercycle_delivery_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'scheduled' and new.status in ('sending','cancelled') then
    return new;
  end if;
  if old.status = 'failed' and new.status in ('sending','scheduled','cancelled') then
    return new;
  end if;
  if old.status = 'sending' and new.status in ('sent','responded','failed','cancelled') then
    return new;
  end if;
  if old.status = 'cancelled' and new.status = 'scheduled' and new.reopened_at is not null then
    return new;
  end if;
  if old.status = 'sent' and new.status = 'responded' then
    return new;
  end if;

  raise exception 'intercycle_delivery_transition_invalid:%->%', old.status, new.status;
end $$;

create or replace function public.assert_intercycle_invite_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_delivery public.intercycle_anamnesis_deliveries%rowtype;
begin
  select * into v_delivery from public.intercycle_anamnesis_deliveries where id = new.delivery_id;
  if not found
    or v_delivery.company_id is distinct from new.company_id
    or v_delivery.student_id is distinct from new.student_id
    or v_delivery.enrollment_id is distinct from new.enrollment_id
    or v_delivery.training_cycle_id is distinct from new.training_cycle_id then
    raise exception 'intercycle_invite_delivery_scope_mismatch';
  end if;
  if v_delivery.status in ('responded','cancelled') then
    raise exception 'intercycle_invite_delivery_status_invalid';
  end if;
  return new;
end $$;

create or replace function public.assert_intercycle_answer_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_delivery public.intercycle_anamnesis_deliveries%rowtype;
begin
  select * into v_delivery from public.intercycle_anamnesis_deliveries where id = new.delivery_id;
  if not found
    or v_delivery.company_id is distinct from new.company_id
    or v_delivery.student_id is distinct from new.student_id
    or v_delivery.enrollment_id is distinct from new.enrollment_id
    or v_delivery.training_cycle_id is distinct from new.training_cycle_id then
    raise exception 'intercycle_answer_delivery_scope_mismatch';
  end if;
  if v_delivery.status in ('responded','cancelled') then
    raise exception 'intercycle_answer_delivery_status_invalid';
  end if;
  return new;
end $$;

create or replace function public.assert_intercycle_waiver_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_student public.students%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_cycle public.training_cycles%rowtype;
  v_prior public.training_cycles%rowtype;
begin
  if new.waived_by is null then
    raise exception 'intercycle_waiver_actor_required';
  end if;

  select * into v_student from public.students where id = new.student_id and company_id = new.company_id;
  if not found then
    raise exception 'intercycle_waiver_student_scope_mismatch';
  end if;

  select * into v_enrollment from public.enrollments where id = new.enrollment_id;
  if not found or v_enrollment.company_id is distinct from new.company_id or v_enrollment.student_id is distinct from new.student_id then
    raise exception 'intercycle_waiver_enrollment_scope_mismatch';
  end if;

  select * into v_cycle from public.training_cycles where id = new.training_cycle_id;
  select * into v_prior from public.training_cycles where id = new.prior_cycle_id;
  if v_cycle.id is null
    or v_cycle.company_id is distinct from new.company_id
    or v_cycle.student_id is distinct from new.student_id
    or v_cycle.enrollment_id is distinct from new.enrollment_id then
    raise exception 'intercycle_waiver_cycle_scope_mismatch';
  end if;
  if coalesce(v_cycle.status, '') in ('cancelled','superseded') or v_cycle.superseded_at is not null then
    raise exception 'intercycle_waiver_cycle_status_invalid';
  end if;
  if v_prior.id is null
    or v_prior.company_id is distinct from new.company_id
    or v_prior.student_id is distinct from new.student_id
    or v_prior.enrollment_id is distinct from new.enrollment_id
    or v_prior.start_date >= v_cycle.start_date then
    raise exception 'intercycle_waiver_prior_cycle_invalid';
  end if;
  if coalesce(v_prior.status, '') in ('cancelled','superseded') or v_prior.superseded_at is not null then
    raise exception 'intercycle_waiver_prior_cycle_status_invalid';
  end if;
  return new;
end $$;

drop trigger if exists trg_assert_intercycle_delivery_scope on public.intercycle_anamnesis_deliveries;
create trigger trg_assert_intercycle_delivery_scope before insert or update on public.intercycle_anamnesis_deliveries
  for each row execute function public.assert_intercycle_delivery_scope();

drop trigger if exists trg_assert_intercycle_delivery_transition on public.intercycle_anamnesis_deliveries;
create trigger trg_assert_intercycle_delivery_transition before update on public.intercycle_anamnesis_deliveries
  for each row execute function public.assert_intercycle_delivery_transition();

drop trigger if exists trg_assert_intercycle_invite_scope on public.intercycle_anamnesis_invites;
create trigger trg_assert_intercycle_invite_scope before insert or update on public.intercycle_anamnesis_invites
  for each row execute function public.assert_intercycle_invite_scope();

drop trigger if exists trg_assert_intercycle_answer_scope on public.intercycle_anamneses;
create trigger trg_assert_intercycle_answer_scope before insert or update on public.intercycle_anamneses
  for each row execute function public.assert_intercycle_answer_scope();

drop trigger if exists trg_assert_intercycle_waiver_scope on public.intercycle_anamnesis_waivers;
create trigger trg_assert_intercycle_waiver_scope before insert or update on public.intercycle_anamnesis_waivers
  for each row execute function public.assert_intercycle_waiver_scope();

-- A queued row is the audit source and unique per cycle.  It is created only
-- after the first day of week 5 (day 29), never when the trainer toggles opt-in.
create or replace function public.process_intercycle_anamnesis_schedule()
returns integer language plpgsql security definer set search_path = public as $$
declare
  inserted_count integer := 0;
  v_today date := public.current_business_date();
begin
  with due as (
    select s.company_id, s.id as student_id, e.id as enrollment_id, c.id as training_cycle_id,
      (c.start_date::timestamptz + interval '28 days') as scheduled_for
    from public.students s
    join public.enrollments e on e.student_id = s.id and e.company_id = s.company_id and e.status in ('active','awaiting_training','awaiting_renewal')
    join public.training_cycles c on c.enrollment_id = e.id and c.company_id = s.company_id and c.student_id = s.id
    where s.intercycle_anamnesis_enabled = true
      and coalesce(s.status, '') in ('active','awaiting_training','awaiting_renewal')
      and coalesce(c.status, '') not in ('cancelled','superseded')
      and c.superseded_at is null
      and v_today >= c.start_date + 28
      and v_today <= coalesce(c.end_date, c.start_date + 41)
  ), inserted as (
    insert into public.intercycle_anamnesis_deliveries (company_id, student_id, enrollment_id, training_cycle_id, idempotency_key, scheduled_for)
    select company_id, student_id, enrollment_id, training_cycle_id,
      'intercycle:' || training_cycle_id::text, greatest(scheduled_for, now())
    from due
    on conflict (company_id, training_cycle_id) do nothing
    returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end $$;

create or replace function public.claim_intercycle_anamnesis_deliveries(_limit integer default 25)
returns setof public.intercycle_anamnesis_deliveries language plpgsql security definer set search_path = public as $$
begin
  return query with due as (
    select id from public.intercycle_anamnesis_deliveries
    where (
        status in ('scheduled','failed')
        or (status = 'sending' and updated_at < now() - interval '15 minutes')
      )
      and scheduled_for <= now()
      and (next_attempt_at is null or next_attempt_at <= now())
    order by scheduled_for asc for update skip locked limit greatest(1, least(coalesce(_limit, 25), 100))
  ), claimed as (
    update public.intercycle_anamnesis_deliveries d
    set status = 'sending',
      last_error_code = case when d.status = 'sending' then 'sending_lease_expired' else d.last_error_code end,
      updated_at = now()
    from due where d.id = due.id returning d.*
  ) select * from claimed;
end $$;
revoke all on function public.process_intercycle_anamnesis_schedule(), public.claim_intercycle_anamnesis_deliveries(integer) from public, anon, authenticated;
grant execute on function public.process_intercycle_anamnesis_schedule(), public.claim_intercycle_anamnesis_deliveries(integer) to service_role;

create or replace function public.reconcile_intercycle_delivery_for_cycle_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_scheduled_for timestamptz := new.start_date::timestamptz + interval '28 days';
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(new.status, '') in ('cancelled','superseded')
    or new.superseded_at is not null
    or new.company_id is distinct from old.company_id
    or new.student_id is distinct from old.student_id
    or new.enrollment_id is distinct from old.enrollment_id then
    update public.intercycle_anamnesis_deliveries
    set status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      last_error_code = 'cycle_cancelled_or_rescoped',
      updated_at = now()
    where training_cycle_id = new.id
      and status in ('scheduled','failed');
    return new;
  end if;

  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    update public.intercycle_anamnesis_deliveries
    set scheduled_for = greatest(v_scheduled_for, now()),
      status = case when status = 'failed' then 'scheduled' else status end,
      next_attempt_at = null,
      last_error_code = 'cycle_rescheduled',
      updated_at = now()
    where training_cycle_id = new.id
      and status in ('scheduled','failed');
  end if;

  return new;
end $$;

drop trigger if exists trg_reconcile_intercycle_delivery_for_cycle_change on public.training_cycles;
create trigger trg_reconcile_intercycle_delivery_for_cycle_change after update on public.training_cycles
  for each row execute function public.reconcile_intercycle_delivery_for_cycle_change();

create or replace function public.record_intercycle_anamnesis_waiver(
  _company_id uuid,
  _student_id uuid,
  _enrollment_id uuid,
  _training_cycle_id uuid,
  _prior_cycle_id uuid,
  _reason text
) returns public.intercycle_anamnesis_waivers
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_row public.intercycle_anamnesis_waivers%rowtype;
begin
  if v_actor is null then
    raise exception 'intercycle_waiver_actor_required';
  end if;
  if not public.is_company_staff(v_actor, _company_id) then
    raise exception 'intercycle_waiver_staff_required';
  end if;
  if exists (
    select 1 from public.intercycle_anamneses
    where company_id = _company_id and student_id = _student_id and training_cycle_id = _prior_cycle_id
  ) then
    raise exception 'intercycle_waiver_response_already_exists';
  end if;

  insert into public.intercycle_anamnesis_waivers (
    company_id, student_id, enrollment_id, training_cycle_id, prior_cycle_id, reason, waived_by
  ) values (
    _company_id, _student_id, _enrollment_id, _training_cycle_id, _prior_cycle_id, btrim(_reason), v_actor
  )
  on conflict (training_cycle_id) do update
    set reason = excluded.reason,
      prior_cycle_id = excluded.prior_cycle_id,
      waived_by = v_actor,
      waived_at = now()
  returning * into v_row;

  return v_row;
end $$;

revoke all on function public.record_intercycle_anamnesis_waiver(uuid, uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.record_intercycle_anamnesis_waiver(uuid, uuid, uuid, uuid, uuid, text) to authenticated;
