begin;
create function public.validate_company_assessment_protocol(_protocol jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  entry jsonb; key_count integer; test_id text; seen text[] := '{}';
  allowed text[] := array['posture_anterior','posture_lateral_d','posture_posterior','posture_lateral_e','ohs_anterior','ohs_lateral_1','ohs_posterior','ohs_lateral_2','air_squat','toe_touch','lunge','shoulder_flexion','march','balance_d','balance_e'];
begin
  if jsonb_typeof(_protocol) is distinct from 'object' then raise exception 'Invalid assessment protocol' using errcode='22023'; end if;
  select count(*) into key_count from jsonb_object_keys(_protocol);
  if key_count <> 4 or not (_protocol ?& array['catalog_version','engine_version','scale_id','tests'])
    or _protocol->>'catalog_version' is distinct from 'sett-approved-assessment-v1'
    or _protocol->>'engine_version' is distinct from 'bn_functional_assessment_engine_v1'
    or _protocol->>'scale_id' is distinct from 'functional_severity_v1'
    or jsonb_typeof(_protocol->'tests') is distinct from 'array' then
    raise exception 'Assessment catalog, scale and clinical criteria are immutable' using errcode='22023';
  end if;
  if jsonb_array_length(_protocol->'tests') <> cardinality(allowed) then raise exception 'Incomplete assessment catalog' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(_protocol->'tests') loop
    if jsonb_typeof(entry) is distinct from 'object' then raise exception 'Invalid assessment test' using errcode='22023'; end if;
    select count(*) into key_count from jsonb_object_keys(entry);
    if key_count <> 4 or not (entry ?& array['id','enabled','label','instructions'])
      or jsonb_typeof(entry->'id') is distinct from 'string'
      or jsonb_typeof(entry->'enabled') is distinct from 'boolean'
      or jsonb_typeof(entry->'label') is distinct from 'string'
      or jsonb_typeof(entry->'instructions') is distinct from 'string' then raise exception 'Invalid assessment fields' using errcode='22023'; end if;
    test_id := entry->>'id';
    if not (test_id = any(allowed)) or test_id = any(seen) then raise exception 'Unknown or duplicate assessment test' using errcode='22023'; end if;
    seen := array_append(seen, test_id);
    if (test_id like 'posture_%' or test_id like 'ohs_%') and entry->>'enabled' <> 'true' then raise exception 'Mandatory screening cannot be hidden' using errcode='22023'; end if;
    if length(btrim(entry->>'label')) not between 1 and 120 or length(entry->>'instructions') > 600 then raise exception 'Assessment text limit exceeded' using errcode='22023'; end if;
  end loop;
  return _protocol;
end;
$$;
revoke all on function public.validate_company_assessment_protocol(jsonb) from public, anon, authenticated, service_role;

create table public.company_assessment_protocols (
  company_id uuid primary key references public.companies(id),
  protocol jsonb not null check (protocol = public.validate_company_assessment_protocol(protocol)),
  version integer not null check (version > 0),
  updated_at timestamptz not null default now(), updated_by uuid not null
);
create table public.company_assessment_protocol_history (
  company_id uuid not null references public.companies(id), version integer not null,
  protocol jsonb not null, changed_at timestamptz not null default now(), changed_by uuid not null,
  primary key (company_id,version)
);
alter table public.company_assessment_protocols enable row level security;
alter table public.company_assessment_protocol_history enable row level security;
revoke all on table public.company_assessment_protocols, public.company_assessment_protocol_history from public, anon, authenticated, service_role;
grant select on table public.company_assessment_protocols, public.company_assessment_protocol_history to authenticated, service_role;
create policy assessment_protocol_staff_read on public.company_assessment_protocols for select to authenticated
using (public.has_role(auth.uid(),'master'::public.app_role) or public.is_company_staff(auth.uid(),company_id));
create policy assessment_protocol_history_read on public.company_assessment_protocol_history for select to authenticated
using (public.has_role(auth.uid(),'master'::public.app_role) or (public.has_role(auth.uid(),'admin'::public.app_role) and public.is_company_staff(auth.uid(),company_id)));

create function public.save_company_assessment_protocol(_company_id uuid, _protocol jsonb, _expected_version integer)
returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare actor uuid := auth.uid(); current_version integer; validated jsonb;
begin
  if actor is null or _company_id is null or not (
    public.has_role(actor,'master'::public.app_role)
    or (public.has_role(actor,'admin'::public.app_role) and public.is_company_staff(actor,_company_id))
  ) then raise exception 'Assessment protocol admin required' using errcode='42501'; end if;
  if _expected_version is null or _expected_version < 0 then raise exception 'Expected version required' using errcode='22023'; end if;
  validated := public.validate_company_assessment_protocol(_protocol);
  perform pg_advisory_xact_lock(hashtextextended('company_assessment_protocol:' || _company_id::text,0));
  select version into current_version from public.company_assessment_protocols where company_id=_company_id for update;
  current_version := coalesce(current_version,0);
  if current_version <> _expected_version then raise exception 'Assessment protocol version conflict' using errcode='PT409'; end if;
  insert into public.company_assessment_protocols(company_id,protocol,version,updated_by)
  values(_company_id,validated,current_version+1,actor)
  on conflict(company_id) do update set protocol=excluded.protocol,version=excluded.version,updated_by=excluded.updated_by,updated_at=now();
  insert into public.company_assessment_protocol_history(company_id,version,protocol,changed_by)
  values(_company_id,current_version+1,validated,actor);
  return jsonb_build_object('protocol',validated,'version',current_version+1);
end;
$$;
revoke all on function public.save_company_assessment_protocol(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.save_company_assessment_protocol(uuid,jsonb,integer) to authenticated;
commit;
