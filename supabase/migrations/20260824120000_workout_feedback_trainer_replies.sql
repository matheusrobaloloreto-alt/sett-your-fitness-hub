alter table public.workout_feedback
  add column if not exists workout_title text,
  add column if not exists trainer_reply text,
  add column if not exists trainer_replied_at timestamptz,
  add column if not exists trainer_replied_by uuid references auth.users(id) on delete set null,
  add column if not exists trainer_reply_author_name text;

-- The added columns are nullable and have no backfill. On first application,
-- existing rows pass immediately; keeping the checks validated avoids leaving
-- permanent unvalidated constraints behind. Rollback before live replies can drop
-- the RPC/trigger/columns; rollback after replies requires export/preservation.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workout_feedback_workout_title_length'
  ) then
    alter table public.workout_feedback
      add constraint workout_feedback_workout_title_length
      check (workout_title is null or char_length(btrim(workout_title)) between 1 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workout_feedback_trainer_reply_length'
  ) then
    alter table public.workout_feedback
      add constraint workout_feedback_trainer_reply_length
      check (trainer_reply is null or char_length(btrim(trainer_reply)) between 1 and 1500);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workout_feedback_trainer_reply_complete'
  ) then
    alter table public.workout_feedback
      add constraint workout_feedback_trainer_reply_complete
      check (
        (
          trainer_reply is null
          and trainer_replied_at is null
          and trainer_replied_by is null
          and trainer_reply_author_name is null
        )
        or (
          trainer_reply is not null
          and trainer_replied_at is not null
          and trainer_replied_by is not null
          and trainer_reply_author_name is not null
          and char_length(btrim(trainer_reply_author_name)) between 1 and 160
        )
      );
  end if;
end
$$;

create or replace function public.guard_workout_feedback_reply_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reply_context text := current_setting('app.workout_feedback_reply_rpc', true);
begin
  if tg_op = 'INSERT' then
    new.workout_title := nullif(btrim(coalesce(new.workout_title, '')), '');
    if new.trainer_reply is not null
       or new.trainer_replied_at is not null
       or new.trainer_replied_by is not null
       or new.trainer_reply_author_name is not null then
      raise exception 'trainer reply fields are server-managed';
    end if;
    return new;
  end if;

  new.workout_title := nullif(btrim(coalesce(new.workout_title, '')), '');

  if (old.trainer_reply, old.trainer_replied_at, old.trainer_replied_by, old.trainer_reply_author_name)
     is distinct from
     (new.trainer_reply, new.trainer_replied_at, new.trainer_replied_by, new.trainer_reply_author_name)
     and v_reply_context is distinct from 'on' then
    raise exception 'trainer reply fields are server-managed';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_workout_feedback_reply_columns() from public;

drop trigger if exists trg_guard_workout_feedback_reply_columns on public.workout_feedback;
create trigger trg_guard_workout_feedback_reply_columns
before insert or update on public.workout_feedback
for each row execute function public.guard_workout_feedback_reply_columns();

drop policy if exists "Company staff update workout feedback" on public.workout_feedback;
drop policy if exists "workout feedback company update" on public.workout_feedback;
revoke update on public.workout_feedback from authenticated;

create or replace function public.reply_to_workout_feedback(
  _feedback_id uuid,
  _trainer_reply text
)
returns public.workout_feedback
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_reply text := nullif(btrim(coalesce(_trainer_reply, '')), '');
  v_feedback public.workout_feedback%rowtype;
  v_author_name text;
  v_updated public.workout_feedback%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;
  if _feedback_id is null then
    raise exception 'feedback_id obrigatório';
  end if;
  if v_reply is null or char_length(v_reply) > 1500 then
    raise exception 'Resposta deve ter entre 1 e 1500 caracteres';
  end if;

  select *
    into v_feedback
  from public.workout_feedback
  where id = _feedback_id
  for update;

  if not found then
    raise exception 'Feedback não encontrado';
  end if;

  if not (
    public.has_role(v_actor, 'master'::public.app_role)
    or public.is_company_staff(v_actor, v_feedback.company_id)
  ) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.students s
    where s.id = v_feedback.student_id
      and s.company_id = v_feedback.company_id
  ) then
    raise exception 'Feedback sem aluno válido no tenant';
  end if;

  select nullif(btrim(full_name), '')
    into v_author_name
  from public.profiles
  where user_id = v_actor;

  v_author_name := coalesce(v_author_name, 'Treinador');
  perform set_config('app.workout_feedback_reply_rpc', 'on', true);

  update public.workout_feedback
  set trainer_reply = v_reply,
      trainer_replied_at = now(),
      trainer_replied_by = v_actor,
      trainer_reply_author_name = v_author_name,
      read_at = coalesce(read_at, now())
  where id = _feedback_id
  returning * into v_updated;

  perform set_config('app.workout_feedback_reply_rpc', 'off', true);
  return v_updated;
exception
  when others then
    perform set_config('app.workout_feedback_reply_rpc', 'off', true);
    raise;
end;
$$;

revoke all on function public.reply_to_workout_feedback(uuid, text) from public;
grant execute on function public.reply_to_workout_feedback(uuid, text) to authenticated;
