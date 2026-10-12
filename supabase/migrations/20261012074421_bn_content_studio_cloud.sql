-- Shared only among masters. Client table writes and cost RPCs are never granted.
create function public.bn_content_spec_valid(p_spec jsonb, p_approved boolean default false)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare s jsonb; t jsonb; k text;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' or octet_length(p_spec::text) > 98304 then return false; end if;
  if not (p_spec ?& array['format','aesthetic','topic','audience','slides','caption','hashtags']) then return false; end if;
  for k in select jsonb_object_keys(p_spec) loop
    if k <> all(array['format','aesthetic','topic','audience','slides','caption','hashtags']) then return false; end if;
  end loop;
  if jsonb_typeof(p_spec->'format') <> 'string' or p_spec->>'format' <> all(array['carrossel','storytelling','aviso','evento','post','story','reels'])
    or jsonb_typeof(p_spec->'aesthetic') <> 'string' or p_spec->>'aesthetic' <> all(array['l1_educativo','l2_storytelling','l3_aviso','l4_evento_poster','l4_evento_teaser','navy']) then return false; end if;
  foreach k in array array['topic','audience','caption'] loop
    if jsonb_typeof(p_spec->k) <> 'string' then return false; end if;
  end loop;
  if length(btrim(p_spec->>'topic')) = 0 or length(p_spec->>'topic') > 300
    or length(btrim(p_spec->>'audience')) = 0 or length(p_spec->>'audience') > 200
    or length(p_spec->>'caption') > 6000 then return false; end if;
  if jsonb_typeof(p_spec->'slides') <> 'array' or jsonb_typeof(p_spec->'hashtags') <> 'array' then return false; end if;
  if jsonb_array_length(p_spec->'slides') not between 1 and 20 or jsonb_array_length(p_spec->'hashtags') > 30 then return false; end if;
  for t in select value from jsonb_array_elements(p_spec->'hashtags') loop
    if jsonb_typeof(t) <> 'string' or length(t #>> '{}') > 100 or (t #>> '{}') !~ '^#[[:alnum:]_]+$' then return false; end if;
  end loop;
  for s in select value from jsonb_array_elements(p_spec->'slides') loop
    if jsonb_typeof(s) <> 'object' or not (s ?& array['role','title']) then return false; end if;
    for k in select jsonb_object_keys(s) loop
      if k <> all(array['role','title','subtitle','body','bullets','image_scene','background_path']) then return false; end if;
    end loop;
    if jsonb_typeof(s->'role') <> 'string' or s->>'role' <> all(array['capa','conteudo','cta'])
      or jsonb_typeof(s->'title') <> 'string' or length(btrim(s->>'title')) = 0 or length(s->>'title') > 240 then return false; end if;
    foreach k in array array['subtitle','body','image_scene'] loop
      if s ? k and (jsonb_typeof(s->k) <> 'string' or length(s->>k) > case k when 'subtitle' then 500 when 'body' then 4000 else 2000 end) then return false; end if;
    end loop;
    if s ? 'background_path' and (jsonb_typeof(s->'background_path') <> 'string' or s->>'background_path' !~ '^studio/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$') then return false; end if;
    if s ? 'bullets' then
      if jsonb_typeof(s->'bullets') <> 'array' then return false; end if;
      if jsonb_array_length(s->'bullets') > 12 then return false; end if;
      for t in select value from jsonb_array_elements(s->'bullets') loop
        if jsonb_typeof(t) <> 'string' or length(btrim(t #>> '{}')) = 0 or length(t #>> '{}') > 500 then return false; end if;
      end loop;
    end if;
  end loop;
  if p_approved and (length(btrim(p_spec->>'caption')) = 0 or p_spec->'slides'->0->>'role' <> 'capa'
    or (jsonb_array_length(p_spec->'slides') > 1 and p_spec->'slides'->-1->>'role' <> 'cta')) then return false; end if;
  return true;
end;
$$;

create table public.bn_content_studio_posts (
  id uuid primary key default gen_random_uuid(),
  brief text not null check (length(btrim(brief)) between 1 and 6000),
  spec jsonb not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bn_content_studio_spec_check check (public.bn_content_spec_valid(spec, status = 'approved'))
);
create index bn_content_studio_posts_updated on public.bn_content_studio_posts(updated_at desc, id);

create table public.bn_content_studio_calendars (
  id uuid primary key default gen_random_uuid(),
  calendar jsonb not null check (jsonb_typeof(calendar) = 'object' and octet_length(calendar::text) <= 98304),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index bn_content_studio_calendars_created on public.bn_content_studio_calendars(created_at desc, id);

create table public.bn_content_studio_quota (
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('text','image')),
  hour_start timestamptz not null,
  used integer not null check (used > 0),
  primary key (user_id, kind, hour_start)
);

alter table public.bn_content_studio_posts enable row level security;
alter table public.bn_content_studio_calendars enable row level security;
alter table public.bn_content_studio_quota enable row level security;
create policy "Masters read shared BN Studio posts" on public.bn_content_studio_posts
  for select to authenticated using (public.has_role((select auth.uid()), 'master'::public.app_role));
create policy "Masters read shared BN Studio calendars" on public.bn_content_studio_calendars
  for select to authenticated using (public.has_role((select auth.uid()), 'master'::public.app_role));
revoke all on public.bn_content_studio_posts, public.bn_content_studio_calendars, public.bn_content_studio_quota from public, anon, authenticated;
grant select on public.bn_content_studio_posts, public.bn_content_studio_calendars to authenticated;
grant all on public.bn_content_studio_posts, public.bn_content_studio_calendars, public.bn_content_studio_quota to service_role;

create function public.bn_content_studio_save(
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
    if not found then raise exception 'version conflict' using errcode = '40001'; end if;
  end if;
  return to_jsonb(saved) - 'created_by' - 'updated_by';
end;
$$;

create function public.bn_content_studio_take_quota(p_actor uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer; cap integer;
begin
  if p_actor is null or not public.has_role(p_actor,'master'::public.app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  cap := case p_kind when 'text' then 30 when 'image' then 10 else null end;
  if cap is null then raise exception 'invalid quota' using errcode = '22023'; end if;
  insert into public.bn_content_studio_quota(user_id,kind,hour_start,used)
    values(p_actor,p_kind,date_trunc('hour',clock_timestamp() at time zone 'UTC') at time zone 'UTC',1)
    on conflict (user_id,kind,hour_start) do update
      set used=bn_content_studio_quota.used+1 where bn_content_studio_quota.used < cap
    returning used into n;
  return n is not null;
end;
$$;
revoke all on function public.bn_content_spec_valid(jsonb,boolean) from public,anon,authenticated;
revoke all on function public.bn_content_studio_save(uuid,uuid,integer,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.bn_content_studio_take_quota(uuid,text) from public,anon,authenticated;
grant execute on function public.bn_content_spec_valid(jsonb,boolean),
  public.bn_content_studio_save(uuid,uuid,integer,text,jsonb,text),
  public.bn_content_studio_take_quota(uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('bn-content-studio','bn-content-studio',false,10485760,array['image/png','image/jpeg']);
create policy "Masters read private BN Studio assets" on storage.objects
  for select to authenticated using (bucket_id='bn-content-studio'
    and public.has_role((select auth.uid()),'master'::public.app_role));
-- Restrictive guards compose with any older broad storage policies in this project.
create policy "BN Studio assets master isolation" on storage.objects as restrictive
  for select to anon,authenticated using (bucket_id<>'bn-content-studio'
    or public.has_role((select auth.uid()),'master'::public.app_role));
create policy "BN Studio assets service insert" on storage.objects as restrictive
  for insert to anon,authenticated with check (bucket_id<>'bn-content-studio');
create policy "BN Studio assets service update" on storage.objects as restrictive
  for update to anon,authenticated using (bucket_id<>'bn-content-studio') with check (bucket_id<>'bn-content-studio');
create policy "BN Studio assets service delete" on storage.objects as restrictive
  for delete to anon,authenticated using (bucket_id<>'bn-content-studio');
