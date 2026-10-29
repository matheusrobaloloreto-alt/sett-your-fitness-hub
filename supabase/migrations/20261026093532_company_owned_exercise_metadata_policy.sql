-- Local-only. Preserve the master global-catalog policy; company staff edit private owned rows.
begin;

drop policy if exists "Company staff manage owned exercise metadata" on public.exercise_metadata;
create policy "Company staff manage owned exercise metadata"
on public.exercise_metadata for all to authenticated
using (exists (
  select 1 from public.exercise_library exercise
  where exercise.id = exercise_metadata.exercise_id and not exercise.is_global
    and exercise.company_id is not null
    and public.is_company_staff(auth.uid(), exercise.company_id)
    and (public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'coordinator'::public.app_role))
))
with check (exists (
  select 1 from public.exercise_library exercise
  where exercise.id = exercise_metadata.exercise_id and not exercise.is_global
    and exercise.company_id is not null
    and public.is_company_staff(auth.uid(), exercise.company_id)
    and (public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'coordinator'::public.app_role))
));

create or replace function public.validate_exercise_metadata_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare source_company uuid; source_global boolean;
begin
  select company_id, is_global into source_company, source_global
  from public.exercise_library where id = new.exercise_id;
  if not found then raise exception 'exercise_metadata_source_invalid' using errcode = '23514'; end if;
  if tg_op = 'UPDATE' and new.exercise_id is distinct from old.exercise_id then
    raise exception 'exercise_metadata_source_immutable' using errcode = '23514';
  end if;
  if cardinality(new.equivalent_substitutes) > 30
    or cardinality(new.contraindications) > 30 or cardinality(new.regressions) > 30 then
    raise exception 'exercise_metadata_limit' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.contraindications || new.regressions) item
    where item is null or length(btrim(item)) = 0 or length(item) > 300) then
    raise exception 'exercise_metadata_criteria_invalid' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.equivalent_substitutes) target_id
    where target_id = new.exercise_id or target_id is null or not exists (
      select 1 from public.exercise_library target where target.id = target_id
        and (target.is_global or (not source_global and source_company is not null and target.company_id = source_company))
    )
  ) then raise exception 'exercise_metadata_substitute_scope_invalid' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function public.validate_exercise_metadata_scope() from public, anon;
create trigger validate_exercise_metadata_scope before insert or update on public.exercise_metadata
for each row execute function public.validate_exercise_metadata_scope();
commit;
