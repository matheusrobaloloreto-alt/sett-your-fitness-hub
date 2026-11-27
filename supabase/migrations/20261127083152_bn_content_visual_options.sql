-- Optional visual configuration preserves the existing post schema and CAS contract.
create or replace function public.bn_content_design_valid(v jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare k text; t text;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(v) loop
    t := v->>k;
    if k in ('background','textColor','accent') then
      if jsonb_typeof(v->k) <> 'string' or t !~ '^#[0-9A-Fa-f]{6}$' then return false; end if;
    elsif k in ('focusX','focusY') then
      if jsonb_typeof(v->k) <> 'number' then return false; end if;
      if t::numeric < 0 or t::numeric > 100 then return false; end if;
    elsif k='symbols' then
      if jsonb_typeof(v->k) <> 'string' or length(t)>100 then return false; end if;
    else
      if jsonb_typeof(v->k) <> 'string' then return false; end if;
      if not ((k='family' and t in ('editorial','visual','didatico'))
        or (k='font' and t in ('sans','serif','mixed'))
        or (k='align' and t in ('left','center','right'))
        or (k='position' and t in ('top','center','bottom'))
        or (k='imageArea' and t in ('background','right','top','none'))
        or (k='dimensions' and t in ('portrait','square','story'))) then return false; end if;
    end if;
  end loop;
  return true;
end; $$;
create or replace function public.bn_content_references_valid(v jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb; k text; c jsonb;
begin
  if v is null or jsonb_typeof(v)<>'array' then return false; end if;
  if jsonb_array_length(v)>8 then return false; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(v) x) <> jsonb_array_length(v) then return false; end if;
  for r in select value from jsonb_array_elements(v) loop
    if jsonb_typeof(r)<>'object' or not r ?& array['id','url','criteria'] then return false; end if;
    for k in select jsonb_object_keys(r) loop
      if k<>all(array['id','url','criteria','asset_path','design']) then return false; end if;
    end loop;
    if jsonb_typeof(r->'id')<>'string' or r->>'id' !~ '^[a-zA-Z0-9_-]{1,64}$'
      or jsonb_typeof(r->'url')<>'string' or length(r->>'url')>2000
      or ((r->>'url')<>'' and r->>'url' !~ '^https://')
      or jsonb_typeof(r->'criteria')<>'array' then return false; end if;
    if jsonb_array_length(r->'criteria')>9 then return false; end if;
    if (select count(distinct x) from jsonb_array_elements(r->'criteria') x) <> jsonb_array_length(r->'criteria') then return false; end if;
    for c in select value from jsonb_array_elements(r->'criteria') loop
      if jsonb_typeof(c)<>'string' or (c #>> '{}')<>all(array['font','textColor','align','position','imageArea','background','emphasis','dimensions','symbols']) then return false; end if;
    end loop;
    if r ? 'design' and not public.bn_content_design_valid(r->'design') then return false; end if;
    if r ? 'asset_path' and (jsonb_typeof(r->'asset_path')<>'string' or r->>'asset_path' !~ '^studio/[0-9a-f-]{36}/assets/[0-9a-f-]{36}\.png$') then return false; end if;
  end loop;
  return true;
end; $$;
revoke all on function public.bn_content_design_valid(jsonb), public.bn_content_references_valid(jsonb) from public,anon,authenticated;
grant execute on function public.bn_content_design_valid(jsonb), public.bn_content_references_valid(jsonb) to service_role;
-- Shared only among masters. Client table writes and cost RPCs are never granted.
create or replace function public.bn_content_spec_valid(p_spec jsonb, p_approved boolean default false)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare s jsonb; t jsonb; k text;
begin
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' or octet_length(p_spec::text) > 98304 then return false; end if;
  if not (p_spec ?& array['format','aesthetic','topic','audience','slides','caption','hashtags']) then return false; end if;
  for k in select jsonb_object_keys(p_spec) loop
    if k <> all(array['format','aesthetic','topic','audience','slides','caption','hashtags','design','references']) then return false; end if;
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
      if k <> all(array['role','title','subtitle','body','bullets','image_scene','background_path','design']) then return false; end if;
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
  if p_spec ? 'design' and not public.bn_content_design_valid(p_spec->'design') then return false; end if;
  for s in select value from jsonb_array_elements(p_spec->'slides') loop
    if s ? 'design' and not public.bn_content_design_valid(s->'design') then return false; end if;
  end loop;
  if p_spec ? 'references' and not public.bn_content_references_valid(p_spec->'references') then return false; end if;
  if p_approved and (length(btrim(p_spec->>'caption')) = 0 or p_spec->'slides'->0->>'role' <> 'capa'
    or (jsonb_array_length(p_spec->'slides') > 1 and p_spec->'slides'->-1->>'role' <> 'cta')) then return false; end if;
  return true;
end;
$$;

