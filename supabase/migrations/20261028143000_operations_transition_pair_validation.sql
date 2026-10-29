-- Correct JSON operator precedence in nonempty transition validation.
-- Preserve function OID, ACL, constraints and all existing policy checks.
create or replace function public.validate_company_operations(_settings jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare s jsonb;t jsonb;r jsonb;seen text[]:='{}';ids text[]:='{}';pairs text[]:='{}';
 codes text[]:=array['interested','contacted','fiscal_registration_pending','payment_pending','active_onboarding','active','lost'];
 ops text[]:=array['interested','contacted','fiscal_registration_pending','lost'];
begin
 if jsonb_typeof(_settings) is distinct from 'object' or octet_length(_settings::text)>20000
 or (select count(*) from jsonb_object_keys(_settings))<>3
 or not (_settings ?& array['stages','transitions','reports']) then raise exception 'Invalid operations' using errcode='22023'; end if;
 if jsonb_typeof(_settings->'stages') is distinct from 'array' or jsonb_typeof(_settings->'transitions') is distinct from 'array'
 or jsonb_typeof(_settings->'reports') is distinct from 'array' then raise exception 'Invalid operations lists' using errcode='22023'; end if;
 if jsonb_array_length(_settings->'stages')<>7 or jsonb_array_length(_settings->'transitions')>12 or jsonb_array_length(_settings->'reports')>8 then raise exception 'Invalid operations size' using errcode='22023'; end if;
 for s in select * from jsonb_array_elements(_settings->'stages') loop
  if jsonb_typeof(s) is distinct from 'object' then raise exception 'Invalid stage' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(s))<>3 or not(s ?& array['code','label','visible'])
  or not coalesce(s->>'code'=any(codes),false) or s->>'code'=any(seen)
  or jsonb_typeof(s->'visible') is distinct from 'boolean'
  or not public.commercial_plain_text(s->'label',80) or length(btrim(s->>'label'))=0
  or (not(s->>'code'=any(ops)) and s->>'visible'<>'true') then raise exception 'Invalid stage' using errcode='22023'; end if;
  seen:=array_append(seen,s->>'code');
 end loop;
 for t in select * from jsonb_array_elements(_settings->'transitions') loop
  if jsonb_typeof(t) is distinct from 'object' then raise exception 'Invalid transition' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(t))<>2 or not(t ?& array['from','to'])
  or not coalesce(t->>'from'=any(ops),false) or not coalesce(t->>'to'=any(ops),false)
  or t->>'from'=t->>'to' or (t->>'from'='lost' and t->>'to'<>'contacted')
  or ((t->>'from')||':'||(t->>'to'))=any(pairs) then raise exception 'Invalid transition' using errcode='22023'; end if;
  pairs:=array_append(pairs,(t->>'from')||':'||(t->>'to'));
 end loop;
 for r in select * from jsonb_array_elements(_settings->'reports') loop
  if jsonb_typeof(r) is distinct from 'object' then raise exception 'Invalid report' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(r))<>4 or not(r ?& array['id','title','metric','display'])
  or jsonb_typeof(r->'id') is distinct from 'string' or not coalesce(r->>'id' ~ '^[a-z0-9_-]{1,40}$',false) or r->>'id'=any(ids)
  or not public.commercial_plain_text(r->'title',80) or length(btrim(r->>'title'))=0
  or not coalesce(r->>'metric' in ('active','pending','awaiting_renewal','inactive'),false)
  or not coalesce(r->>'display' in ('count','share'),false) then raise exception 'Invalid report' using errcode='22023'; end if;
  ids:=array_append(ids,r->>'id');
 end loop;
 return _settings;
end;
$$;
