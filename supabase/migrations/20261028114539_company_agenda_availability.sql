-- Availability only: never creates appointments, billing, cycles, or financial events.
create table public.company_agenda_availability (
 company_id uuid primary key references public.companies(id) on delete cascade,
 settings jsonb not null,version integer not null check(version>0),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table public.company_agenda_availability_history (
 company_id uuid not null references public.companies(id) on delete cascade,
 version integer not null,settings jsonb not null,updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),primary key(company_id,version)
);
alter table public.company_agenda_availability enable row level security;
alter table public.company_agenda_availability_history enable row level security;
revoke all on public.company_agenda_availability,public.company_agenda_availability_history from public,anon,authenticated,service_role;
create function public.agenda_availability_staff(_company_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(_company_id is not null and auth.uid() is not null and public.company_feature_allowed(_company_id,'hasAgenda') and
 (public.has_role(auth.uid(),'master'::public.app_role) or
 (exists(select 1 from public.company_members where company_id=_company_id and user_id=auth.uid()) and
 (public.has_role(auth.uid(),'admin'::public.app_role) or public.has_role(auth.uid(),'coordinator'::public.app_role) or public.has_role(auth.uid(),'trainer'::public.app_role)))),false);
$$;
create function public.validate_agenda_availability_windows(_windows jsonb) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare w jsonb;previous_end text;
begin
 if jsonb_typeof(_windows) is distinct from 'array' then raise exception 'Invalid availability windows' using errcode='22023';end if;
 if jsonb_array_length(_windows)>4 then raise exception 'At most four windows per day' using errcode='22023';end if;
 for w in select value from jsonb_array_elements(_windows) order by value->>'start' loop
  if jsonb_typeof(w) is distinct from 'object' then raise exception 'Invalid window' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(w))<>2 or not(w ?& array['start','end'])
  or jsonb_typeof(w->'start') is distinct from 'string' or jsonb_typeof(w->'end') is distinct from 'string'
  or not coalesce(w->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$',false)
  or not coalesce(w->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$',false)
  or w->>'start'>=w->>'end' or (previous_end is not null and w->>'start'<previous_end)
  then raise exception 'Invalid or overlapping windows' using errcode='22023';end if;
  previous_end:=w->>'end';
 end loop;
end;
$$;
create function public.validate_company_agenda_availability(_settings jsonb) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare w jsonb;e jsonb;day integer;seen text[]:='{}';windows jsonb;
begin
 if jsonb_typeof(_settings) is distinct from 'object' or octet_length(_settings::text)>30000 then raise exception 'Invalid availability' using errcode='22023';end if;
 if (select count(*) from jsonb_object_keys(_settings))<>3 or not(_settings ?& array['timezone','weekly','exceptions'])
 or jsonb_typeof(_settings->'timezone') is distinct from 'string'
 or length(_settings->>'timezone')>80
 or not coalesce((_settings->>'timezone'='UTC' or _settings->>'timezone' ~ '^[A-Za-z_]+(/[A-Za-z_+-]+)+$'),false)
 or not exists(select 1 from pg_timezone_names where name=_settings->>'timezone')
 or jsonb_typeof(_settings->'weekly') is distinct from 'array' or jsonb_typeof(_settings->'exceptions') is distinct from 'array'
 then raise exception 'Invalid availability structure or timezone' using errcode='22023';end if;
 if jsonb_array_length(_settings->'weekly')>28 or jsonb_array_length(_settings->'exceptions')>60 then raise exception 'Availability exceeds limits' using errcode='22023';end if;
 for w in select * from jsonb_array_elements(_settings->'weekly') loop
  if jsonb_typeof(w) is distinct from 'object' then raise exception 'Invalid weekly window' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(w))<>3 or not(w ?& array['weekday','start','end'])
   or jsonb_typeof(w->'weekday') is distinct from 'number' or not coalesce(w->>'weekday' ~ '^[0-6]$',false)
   then raise exception 'Invalid weekday' using errcode='22023';end if;
 end loop;
 for day in 0..6 loop
  select coalesce(jsonb_agg(value-'weekday'),'[]'::jsonb) into windows from jsonb_array_elements(_settings->'weekly') where (value->>'weekday')::integer=day;
  perform public.validate_agenda_availability_windows(windows);
 end loop;
 for e in select * from jsonb_array_elements(_settings->'exceptions') loop
  if jsonb_typeof(e) is distinct from 'object' then raise exception 'Invalid exception' using errcode='22023';end if;
  if (select count(*) from jsonb_object_keys(e))<>2 or not(e ?& array['date','windows'])
   or jsonb_typeof(e->'date') is distinct from 'string' or not coalesce(e->>'date' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$',false)
   or e->>'date'=any(seen) then raise exception 'Invalid or duplicate exception date' using errcode='22023';end if;
  if (e->>'date')::date::text<>e->>'date' then raise exception 'Invalid date' using errcode='22023';end if;
  seen:=array_append(seen,e->>'date');
  perform public.validate_agenda_availability_windows(e->'windows');
 end loop;
 return _settings;
end;
$$;
create function public.get_company_agenda_availability(_company_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.agenda_availability_staff(_company_id) then raise exception 'Not authorized' using errcode='42501';end if;
 select jsonb_build_object('settings',settings,'version',version) into result from public.company_agenda_availability where company_id=_company_id;
 return coalesce(result,'{"settings":{"timezone":"America/Sao_Paulo","weekly":[],"exceptions":[]},"version":0}'::jsonb);
end;
$$;
create function public.save_company_agenda_availability(_company_id uuid,_settings jsonb,_expected_version integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer;validated jsonb;
begin
 if not public.agenda_availability_staff(_company_id) or not (public.has_role(auth.uid(),'master'::public.app_role) or public.has_role(auth.uid(),'admin'::public.app_role)) then raise exception 'Not authorized' using errcode='42501';end if;
 if _expected_version is null or _expected_version<0 then raise exception 'Expected version required' using errcode='22023';end if;
 validated:=public.validate_company_agenda_availability(_settings);
 perform pg_advisory_xact_lock(hashtextextended('company_agenda_availability:'||_company_id::text,0));
 select version into current_version from public.company_agenda_availability where company_id=_company_id for update;
 if coalesce(current_version,0)<>_expected_version then raise exception 'Reload availability' using errcode='PT409';end if;
 insert into public.company_agenda_availability(company_id,settings,version,updated_by) values(_company_id,validated,_expected_version+1,auth.uid())
 on conflict(company_id) do update set settings=excluded.settings,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
 insert into public.company_agenda_availability_history(company_id,version,settings,updated_by) values(_company_id,_expected_version+1,validated,auth.uid());
 return jsonb_build_object('settings',validated,'version',_expected_version+1);
end;
$$;
revoke all on function public.agenda_availability_staff(uuid),public.validate_agenda_availability_windows(jsonb),public.validate_company_agenda_availability(jsonb),public.get_company_agenda_availability(uuid),public.save_company_agenda_availability(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_company_agenda_availability(uuid),public.save_company_agenda_availability(uuid,jsonb,integer) to authenticated;
