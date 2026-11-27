-- Business conflicts are permanent for this expected version; never request a serialization retry.
create or replace function public.bn_content_studio_save(
  p_actor uuid, p_id uuid, p_expected_version integer, p_brief text, p_spec jsonb, p_status text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare saved public.bn_content_studio_posts;
begin
  if p_actor is null or not public.has_role(p_actor,'master'::public.app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_brief is null or length(btrim(p_brief)) not between 1 and 6000 or p_status is null or p_status not in ('draft','approved')
    or not public.bn_content_spec_valid(p_spec,p_status='approved') then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  if p_id is null then
    if p_expected_version is not null then raise exception 'invalid version' using errcode = '22023'; end if;
    insert into public.bn_content_studio_posts(brief,spec,status,created_by,updated_by)
      values(p_brief,p_spec,p_status,p_actor,p_actor) returning * into saved;
  else
    if p_expected_version is null or p_expected_version < 1 or p_expected_version >= 2147483647 then
      raise exception 'invalid version' using errcode = '22023';
    end if;
    update public.bn_content_studio_posts set brief=p_brief,spec=p_spec,status=p_status,
      version=version+1,updated_by=p_actor,updated_at=clock_timestamp()
      where id=p_id and version=p_expected_version returning * into saved;
    if not found then raise exception 'version conflict' using errcode = 'PT409'; end if;
  end if;
  return to_jsonb(saved) - 'created_by' - 'updated_by';
end;
$$;
