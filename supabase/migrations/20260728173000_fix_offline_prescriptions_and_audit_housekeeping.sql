-- Fix offline prescriptions that were previously represented as empty workouts.
-- Empty rows in public.workouts are not renderable by the student app; offline
-- prescriptions belong on training_cycles metadata instead.

alter table public.training_cycles
  add column if not exists prescribed_offline_at timestamptz;

alter table public.training_cycles
  add column if not exists prescribed_offline_by uuid;

alter table public.training_cycles
  add column if not exists prescribed_offline_note text;

comment on column public.training_cycles.prescribed_offline_at is
  'Marks a cycle as prescribed outside the app. This does not create a renderable workout for students.';
comment on column public.training_cycles.prescribed_offline_by is
  'User who marked the cycle as prescribed outside the app.';
comment on column public.training_cycles.prescribed_offline_note is
  'Optional note for offline prescriptions.';

create index if not exists idx_training_cycles_prescribed_offline_at
  on public.training_cycles (prescribed_offline_at)
  where prescribed_offline_at is not null;

with marker_workouts as (
  select
    w.id,
    w.cycle_id,
    w.created_at,
    w.created_by
  from public.workouts w
  where w.cycle_id is not null
    and coalesce(w.title, w.name, '') like 'Treino Ciclo %'
    and (
      case
        when jsonb_typeof(w.exercises) = 'array' then jsonb_array_length(w.exercises)
        else 0
      end
    ) = 0
),
collapsed_markers as (
  select
    cycle_id,
    min(created_at) as first_created_at,
    (array_agg(created_by order by created_at nulls last))[1] as first_created_by
  from marker_workouts
  group by cycle_id
)
update public.training_cycles tc
set prescribed_offline_at = coalesce(tc.prescribed_offline_at, cm.first_created_at, now()),
    prescribed_offline_by = coalesce(tc.prescribed_offline_by, cm.first_created_by)
from collapsed_markers cm
where tc.id = cm.cycle_id;

with marker_workouts as (
  select w.id
  from public.workouts w
  where w.cycle_id is not null
    and coalesce(w.title, w.name, '') like 'Treino Ciclo %'
    and (
      case
        when jsonb_typeof(w.exercises) = 'array' then jsonb_array_length(w.exercises)
        else 0
      end
    ) = 0
)
delete from public.workouts w
using marker_workouts mw
where w.id = mw.id;

create or replace function public.set_progress_photo_company_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid;
begin
  select s.company_id
  into v_company_id
  from public.students s
  where s.id = new.student_id;

  if v_company_id is null then
    raise exception 'progress photo company_id could not be resolved';
  end if;

  new.company_id := v_company_id;
  return new;
end;
$$;

create or replace function public.sync_prescription_cycles(
  _student_id uuid,
  _start_date date default null
)
returns table (
  id uuid,
  enrollment_id uuid,
  cycle_number integer,
  start_date date,
  end_date date,
  status text,
  has_workouts boolean,
  has_bundle boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_company_id uuid;
  v_start date;
  v_end date;
  v_cycle_start date;
  v_cycle_end date;
  v_cycle_days integer := 42;
  v_plan_days integer := 42;
  v_cycle_number integer := 1;
begin
  select e.*
  into v_enrollment
  from public.enrollments e
  where e.student_id = _student_id
    and e.status in ('active', 'awaiting_training', 'awaiting_renewal')
  order by
    case e.status when 'active' then 0 when 'awaiting_training' then 1 else 2 end,
    e.created_at desc
  limit 1;

  if v_enrollment.id is null then
    raise exception using errcode = 'P0002', message = 'Aluno sem matrícula vigente para agendar prescrições.';
  end if;

  v_company_id := v_enrollment.company_id;
  if not public.is_company_staff(auth.uid(), v_company_id) then
    raise exception using errcode = '42501', message = 'Acesso restrito à equipe da empresa do aluno.';
  end if;

  select
    coalesce(p.cycle_duration_days, 42),
    coalesce(p.duration_days, p.duration_weeks * 7, 42)
  into v_cycle_days, v_plan_days
  from public.plans p
  where p.id = v_enrollment.plan_id;

  v_cycle_days := greatest(coalesce(v_cycle_days, 42), 1);
  v_plan_days := greatest(coalesce(v_plan_days, 42), 1);
  v_start := coalesce(v_enrollment.training_start_date, _start_date, v_enrollment.start_date, current_date);
  v_end := coalesce(v_enrollment.end_date, v_start + v_plan_days - 1);
  if v_end < v_start then
    v_end := v_start + v_plan_days - 1;
  end if;

  if v_enrollment.training_start_date is null then
    update public.enrollments
    set training_start_date = v_start,
        updated_at = now()
    where public.enrollments.id = v_enrollment.id;
  end if;

  v_cycle_start := v_start;
  while v_cycle_start <= v_end loop
    v_cycle_end := least(v_cycle_start + v_cycle_days - 1, v_end);

    insert into public.training_cycles (
      enrollment_id,
      student_id,
      company_id,
      cycle_number,
      start_date,
      end_date,
      duration_weeks,
      status,
      name
    )
    select
      v_enrollment.id,
      _student_id,
      v_company_id,
      v_cycle_number,
      v_cycle_start,
      v_cycle_end,
      greatest(1, ceil((v_cycle_end - v_cycle_start + 1) / 7.0)::integer),
      case
        when v_cycle_end < current_date then 'completed'
        when current_date between v_cycle_start and v_cycle_end then 'active'
        else 'pending'
      end,
      format('Ciclo %s', v_cycle_number)
    where not exists (
      select 1
      from public.training_cycles existing_cycle
      where existing_cycle.enrollment_id = v_enrollment.id
        and existing_cycle.cycle_number = v_cycle_number
    );

    update public.training_cycles existing_cycle
    set student_id = _student_id,
        company_id = v_company_id
    where existing_cycle.enrollment_id = v_enrollment.id
      and existing_cycle.cycle_number = v_cycle_number;

    v_cycle_number := v_cycle_number + 1;
    v_cycle_start := v_cycle_end + 1;
  end loop;

  perform public.advance_training_cycles();

  return query
  select
    tc.id,
    tc.enrollment_id,
    tc.cycle_number,
    tc.start_date,
    tc.end_date,
    tc.status,
    (
      tc.prescribed_offline_at is not null
      or exists (
        select 1
        from public.workouts w
        where w.cycle_id = tc.id
          and (
            case
              when jsonb_typeof(w.exercises) = 'array' then jsonb_array_length(w.exercises)
              else 0
            end
          ) > 0
      )
    ) as has_workouts,
    exists (
      select 1
      from public.prescription_bundles pb
      where pb.training_cycle_id = tc.id
        and pb.status <> 'failed'
    ) as has_bundle
  from public.training_cycles tc
  where tc.enrollment_id = v_enrollment.id
  order by tc.cycle_number;
end;
$$;

revoke all on function public.sync_prescription_cycles(uuid, date) from public, anon;
grant execute on function public.sync_prescription_cycles(uuid, date) to authenticated, service_role;

do $$
begin
  if to_regclass('public.workout_exercises') is not null then
    comment on table public.workout_exercises is
      'Deprecated/unused. Live prescriptions are stored in public.workouts.exercises jsonb.';
  end if;

  if to_regclass('public.student_anamneses') is not null then
    comment on table public.student_anamneses is
      'Canonical anamnese table for Studio/AI workflows.';
  end if;

  if to_regclass('public.anamnesis') is not null then
    comment on table public.anamnesis is
      'Legacy anamnese mirror kept for compatibility with older public form/detail UI.';
  end if;
end;
$$;

do $$
declare
  v_version text;
  v_name text;
  v_has_name boolean;
  v_has_statements boolean;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name = 'name'
  )
  into v_has_name;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
      and column_name = 'statements'
  )
  into v_has_statements;

  for v_version, v_name in
    select *
    from (values
      ('20260721120000', 'prevent_duplicate_students_per_company'),
      ('20260721133000', 'sync_student_enrollment_trainers')
    ) as missing(version, name)
  loop
    if v_has_name and v_has_statements then
      execute
        'insert into supabase_migrations.schema_migrations (version, statements, name) values ($1, $2, $3) on conflict do nothing'
      using v_version, array[]::text[], v_name;
    elsif v_has_name then
      execute
        'insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict do nothing'
      using v_version, v_name;
    elsif v_has_statements then
      execute
        'insert into supabase_migrations.schema_migrations (version, statements) values ($1, $2) on conflict do nothing'
      using v_version, array[]::text[];
    else
      execute
        'insert into supabase_migrations.schema_migrations (version) values ($1) on conflict do nothing'
      using v_version;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_schedule text;
  v_command text;
  v_wrapped text;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select schedule, command
  into v_schedule, v_command
  from cron.job
  where jobname = 'push-daily-reminder'
  limit 1;

  if v_command is null or position('push_subscriptions' in v_command) > 0 then
    return;
  end if;

  perform cron.unschedule('push-daily-reminder');
  v_wrapped := format(
    'do $push_guard$ begin if exists (select 1 from public.push_subscriptions limit 1) then %s; end if; end $push_guard$;',
    regexp_replace(regexp_replace(v_command, ';\s*$', ''), '^\s*select\s+', 'perform ', 'i')
  );
  perform cron.schedule('push-daily-reminder', coalesce(v_schedule, '0 11 * * *'), v_wrapped);
end;
$$;
