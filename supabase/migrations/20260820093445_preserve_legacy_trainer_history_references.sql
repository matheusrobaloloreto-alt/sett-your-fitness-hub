-- Historical assignment rows can retain a user UUID after that trainer is
-- removed from Auth and company_members. Keep those immutable audit references
-- readable and editable for unrelated fields, while rejecting every new or
-- changed reference that is not a current company member or master user.
create or replace function public.enforce_trainer_history_reference_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.trainer_id is not null
     and (
       tg_op = 'INSERT'
       or new.company_id is distinct from old.company_id
       or new.trainer_id is distinct from old.trainer_id
     )
     and not public.has_role(new.trainer_id, 'master'::public.app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = new.trainer_id and cm.company_id = new.company_id
     ) then
    raise exception 'Trainer history trainer/company mismatch'
      using errcode = '23514';
  end if;

  if new.previous_trainer_id is not null
     and (
       tg_op = 'INSERT'
       or new.company_id is distinct from old.company_id
       or new.previous_trainer_id is distinct from old.previous_trainer_id
     )
     and not public.has_role(new.previous_trainer_id, 'master'::public.app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = new.previous_trainer_id
         and cm.company_id = new.company_id
     ) then
    raise exception 'Trainer history previous trainer/company mismatch'
      using errcode = '23514';
  end if;

  if new.changed_by is not null
     and (
       tg_op = 'INSERT'
       or new.company_id is distinct from old.company_id
       or new.changed_by is distinct from old.changed_by
     )
     and not public.has_role(new.changed_by, 'master'::public.app_role)
     and not exists (
       select 1 from public.company_members cm
       where cm.user_id = new.changed_by and cm.company_id = new.company_id
     ) then
    raise exception 'Trainer history changer/company mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_trainer_history_reference_integrity()
from public, anon, authenticated;
