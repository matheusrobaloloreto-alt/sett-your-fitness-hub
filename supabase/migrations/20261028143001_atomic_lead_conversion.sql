-- Created with supabase migration new; ordered after the existing forward candidate.
-- Service-only operations. The Edge authenticates actor; SQL rechecks membership,
-- commercial admission and transitions. No provider I/O or financial activation.
create function commercial_private.registration_actor_allowed(_actor uuid,_company uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select _actor is not null and _company is not null and
 (public.has_role(_actor,'master'::public.app_role) or
  (exists(select 1 from public.company_members where user_id=_actor and company_id=_company) and
   (public.has_role(_actor,'admin'::public.app_role) or public.has_role(_actor,'coordinator'::public.app_role) or public.has_role(_actor,'trainer'::public.app_role))));
$$;
create function commercial_private.registration_phone_key(_phone text,_country text,_format text) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare d text:=regexp_replace(coalesce(_phone,''),'[^0-9]','','g');
begin
 if _country is null or _format is null or _country !~ '^[A-Z]{2}$' or _format not in ('national','e164','stored') then return null;end if;
 if _country='BR' then
  if _format in ('national','stored') and length(d) in (10,11) and d ~ '^[1-9][0-9]+$' then return '55'||d;end if;
  if _format in ('e164','stored') and length(d) in (12,13) and d ~ '^55[1-9][0-9]+$' then return d;end if;
  return null;
 end if;
 if _format in ('e164','stored') and d ~ '^[1-9][0-9]{7,14}$' then return d;end if;
 return null;
end;
$$;
-- Caller holds the policy lock, and the student row is locked here. Shared by
-- conversion and standalone link creation so concurrent callers reuse one link.
create function commercial_private.prepare_registration_link(_student uuid,_company uuid,_actor uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.students%rowtype;l public.public_registration_links%rowtype;source text;
begin
 select * into s from public.students where id=_student and company_id=_company for update;
 if not found then raise exception 'Registration profile unavailable' using errcode='PT409';end if;
 -- Never move an established/financial lifecycle backwards to interested.
 if s.status in ('interested','inactive') and (s.sales_stage is null or s.sales_stage in ('interested','contacted','fiscal_registration_pending','fiscal_registration','lost')) and s.user_id is null and s.activated_at is null and s.fiscal_completed_at is null
 and not exists(select 1 from public.enrollments where student_id=s.id) then
  source:=case when s.sales_stage='fiscal_registration' then 'fiscal_registration_pending'
    when s.sales_stage in ('interested','contacted','fiscal_registration_pending','lost') then s.sales_stage
    when s.status='inactive' then 'lost' else 'interested' end;
  if source<>'fiscal_registration_pending' then
   perform public.assert_company_operation_transition(_company,source,'fiscal_registration_pending');
  end if;
  update public.students set sales_stage='fiscal_registration_pending',status='interested'
   where id=s.id and company_id=_company returning * into s;
 end if;
 select * into l from public.public_registration_links where student_id=s.id and company_id=_company
  and revoked_at is null and completed_at is null and expires_at>clock_timestamp()
  order by created_at desc,id desc limit 1;
 if not found then
  insert into public.public_registration_links(student_id,company_id,created_by)
   values(s.id,_company,_actor) returning * into l;
 end if;
 return jsonb_build_object('id',l.id,'token',l.token,'company_id',l.company_id,'expires_at',l.expires_at,
  'student',jsonb_build_object('id',s.id,'full_name',s.full_name,'status',s.status,'sales_stage',s.sales_stage,
    'phone',s.phone,'whatsapp',s.whatsapp,'country_code',s.country_code));
end;
$$;
create function public.prepare_registration_link_atomic(_student_id uuid,_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare company uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation required' using errcode='42501';end if;
 select company_id into company from public.students where id=_student_id;
 if not commercial_private.registration_actor_allowed(_actor_id,company) then raise exception 'Not authorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('company_operations:'||company::text,0));
 perform 1 from public.user_roles where user_id=_actor_id for share;
 perform 1 from public.companies where id=company for share;
 perform 1 from public.company_members where company_id=company and user_id=_actor_id for share;
 perform 1 from public.company_feature_policies where company_id=company for share;
 perform 1 from public.platform_product_settings for share;
 if not commercial_private.registration_actor_allowed(_actor_id,company) or not commercial_private.feature_allowed(company,'hasRegistration') then raise exception 'Not authorized' using errcode='42501';end if;
 return commercial_private.prepare_registration_link(_student_id,company,_actor_id);
end;
$$;
create function public.convert_lead_to_fiscal_atomic(_lead_id uuid,_actor_id uuid,_expected_updated_at timestamptz,_anamnesis jsonb,_demographics jsonb,_phone_country text,_phone_format text,_confirmed_phone text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare lead public.leads%rowtype;s public.students%rowtype;a public.student_anamneses%rowtype;
 student_id uuid;matches uuid[];identity_phone text;source text;created_student boolean:=false;registration jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service operation required' using errcode='42501';end if;
 select * into lead from public.leads where id=_lead_id for update;
 if not found or not commercial_private.registration_actor_allowed(_actor_id,lead.company_id) then raise exception 'Not authorized' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('company_operations:'||lead.company_id::text,0));
 perform 1 from public.user_roles where user_id=_actor_id for share;
 perform 1 from public.companies where id=lead.company_id for share;
 perform 1 from public.company_members where company_id=lead.company_id and user_id=_actor_id for share;
 perform 1 from public.company_feature_policies where company_id=lead.company_id for share;
 perform 1 from public.platform_product_settings for share;
 if not commercial_private.registration_actor_allowed(_actor_id,lead.company_id) or not commercial_private.feature_allowed(lead.company_id,'hasRegistration') then raise exception 'Not authorized' using errcode='42501';end if;
 identity_phone:=commercial_private.registration_phone_key(lead.phone,_phone_country,_phone_format);
 if identity_phone is null or identity_phone !~ '^[1-9][0-9]{7,14}$' then raise exception 'Review lead phone before conversion' using errcode='PT422';end if;
 if _confirmed_phone is null or _confirmed_phone is distinct from identity_phone then raise exception 'Phone changed; reload and confirm again' using errcode='PT409';end if;
 student_id:=lead.converted_to_student_id;
 -- Replays never overwrite demographics/anamnesis or repeat a stage transition.
 if student_id is not null then
  select * into s from public.students where id=student_id and company_id=lead.company_id for update;
  if not found or not coalesce(commercial_private.registration_phone_key(s.phone,s.country_code,'stored')=identity_phone,false)
   and not coalesce(commercial_private.registration_phone_key(s.whatsapp,s.country_code,'stored')=identity_phone,false) then
   raise exception 'Linked profile identity changed; review before replay' using errcode='PT409';
  end if;
  registration:=commercial_private.prepare_registration_link(student_id,lead.company_id,_actor_id);
  return registration||jsonb_build_object('leadId',lead.id,'studentId',student_id,'messageSent',false,'confirmedPhone',identity_phone,'reused',true);
 end if;
 if lead.updated_at is distinct from _expected_updated_at then raise exception 'Reload lead before converting' using errcode='PT409';end if;
 source:=case when lead.stage='fiscal_registration' then 'fiscal_registration_pending' else coalesce(lead.stage,'interested') end;
 if source not in ('interested','contacted','fiscal_registration_pending','lost') then raise exception 'Lead stage cannot be converted' using errcode='PT409';end if;
 if source<>'fiscal_registration_pending' then perform public.assert_company_operation_transition(lead.company_id,source,'fiscal_registration_pending');end if;

 perform pg_advisory_xact_lock(hashtextextended('registration_identity:'||lead.company_id::text||':'||identity_phone,0));
 select array_agg(candidate.id order by candidate.id) into matches from public.students candidate where candidate.company_id=lead.company_id and
  (commercial_private.registration_phone_key(candidate.phone,candidate.country_code,'stored')=identity_phone or
   commercial_private.registration_phone_key(candidate.whatsapp,candidate.country_code,'stored')=identity_phone);
 if cardinality(matches)>1 then raise exception 'Multiple profiles match; review before converting' using errcode='PT409';end if;
 student_id:=matches[1];
 if student_id is not null then
  select * into s from public.students where id=student_id and company_id=lead.company_id for update;
  if not found or not coalesce(commercial_private.registration_phone_key(s.phone,s.country_code,'stored')=identity_phone,false)
   and not coalesce(commercial_private.registration_phone_key(s.whatsapp,s.country_code,'stored')=identity_phone,false) then
   raise exception 'Profile identity changed; review before converting' using errcode='PT409';
  end if;
 end if;
 if student_id is null then
  if jsonb_typeof(_anamnesis) is distinct from 'object' or jsonb_typeof(_demographics) is distinct from 'object'
   or octet_length(_anamnesis::text)>131072 then raise exception 'Invalid conversion data' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(_demographics) k where k not in ('gender','weight_kg','height_cm')) then raise exception 'Invalid demographics' using errcode='22023';end if;
  insert into public.students(company_id,full_name,phone,whatsapp,country_code,status,sales_stage,gender,weight_kg,height_cm)
   values(lead.company_id,lead.full_name,identity_phone,identity_phone,_phone_country,'interested','fiscal_registration_pending',
    case when _demographics->>'gender' in ('M','F') then _demographics->>'gender' else null end,
    (_demographics->>'weight_kg')::numeric,(_demographics->>'height_cm')::numeric) returning id into student_id;
  created_student:=true;
  a:=jsonb_populate_record(null::public.student_anamneses,
   jsonb_build_object('is_endurance_athlete',false,'has_kitchen',true,'meals_per_day',5,'wants_strength',true,
    'wants_running',false,'wants_swimming',false,'wants_cycling',false,'wants_nutrition',false,'has_nutritionist',false,
    'has_endurance_coach',false,'shown_blocks','[]'::jsonb,'current_volume_unit','km_week')||_anamnesis||
   jsonb_build_object('id',gen_random_uuid(),'student_id',student_id,'company_id',lead.company_id,'created_at',now(),'updated_at',now(),
    'custom_answers',lead.pre_registration_answers));
  insert into public.student_anamneses select (a).*;
  insert into public.student_anamnesis_history(student_id,company_id,version,snapshot)
    values(student_id,lead.company_id,1,to_jsonb(a));
 end if;
 -- Existing students are linked without replacing their health/fiscal/history data.
 registration:=commercial_private.prepare_registration_link(student_id,lead.company_id,_actor_id);
 update public.leads set stage='fiscal_registration',contact_outcome='qualified',converted_to_student_id=student_id,
  fiscal_invited_at=now(),updated_at=now() where id=lead.id and company_id=lead.company_id;
 insert into public.student_funnel_events(student_id,company_id,event_type,event_key,payload)
  values(student_id,lead.company_id,'lead_converted','lead_converted:'||lead.id::text,
   jsonb_build_object('lead_id',lead.id,'created_student',created_student,'existing_anamnesis_preserved',not created_student));
 return registration||jsonb_build_object('leadId',lead.id,'studentId',student_id,'messageSent',false,'confirmedPhone',identity_phone,'reused',not created_student);
end;
$$;
revoke all on function commercial_private.registration_actor_allowed(uuid,uuid),commercial_private.registration_phone_key(text,text,text),commercial_private.prepare_registration_link(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_registration_link_atomic(uuid,uuid),public.convert_lead_to_fiscal_atomic(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_registration_link_atomic(uuid,uuid),public.convert_lead_to_fiscal_atomic(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text) to service_role;
