-- Local candidate only. Existing settings/history and legacy send ledgers remain unchanged.
-- Preserve the latest validator (including methodology); delegate all legacy fields to it.

create function public.validate_company_message_sequences(_sequences jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare ev text; parts jsonb; p jsonb; m jsonb; ids text[]; probe jsonb;
begin
 if jsonb_typeof(_sequences) is distinct from 'object' then raise exception 'message_sequences.invalid' using errcode='22023'; end if;
 for ev,parts in select * from jsonb_each(_sequences) loop
  if ev not in ('weekly_contact','pre_registration_confirmation','fiscal_invite','payment_link','assessment_onboarding','anamnesis_invite','renewal_due','renewal_overdue','intercycle_invite','first_contact') or jsonb_typeof(parts) <> 'array' then raise exception 'message_sequences.event' using errcode='22023'; end if;
  if jsonb_array_length(parts) not between 1 and 10 then raise exception 'message_sequences.count' using errcode='22023'; end if;
  ids := array[]::text[];
  for p in select * from jsonb_array_elements(parts) loop
   if jsonb_typeof(p) <> 'object' or p - array['id','type','text','media'] <> '{}' or jsonb_typeof(p->'id') is distinct from 'string' or (p->>'id') !~ '^[A-Za-z0-9_-]{1,80}$' or (p->>'id')=any(ids) or jsonb_typeof(p->'type') is distinct from 'string' or (p->>'type') not in ('text','image','video','audio') or jsonb_typeof(p->'text') is distinct from 'string' then raise exception 'message_sequences.part' using errcode='22023'; end if;
   ids := array_append(ids,p->>'id');
   -- Reuse the event variable, malformed-template, secret and length validation, including media captions.
   if (p->>'type')='text' or (p->>'text') ~ '[^[:space:]]' then
    probe := public.validate_company_product_settings(jsonb_build_object('messages',jsonb_build_object(ev,p->>'text')));
   elsif length(p->>'text') > 6000 then raise exception 'message_sequences.text' using errcode='22023'; end if;
   if (p->>'type')='text' then
    if p ? 'media' then raise exception 'message_sequences.media' using errcode='22023'; end if;
   else
    m := p->'media';
    if jsonb_typeof(m) is distinct from 'object' or m - array['bucket','path','mimeType','fileName'] <> '{}' or not (m ?& array['bucket','path','mimeType','fileName']) or exists(select 1 from jsonb_each(m) x where jsonb_typeof(x.value)<>'string') or (m->>'bucket')<>'whatsapp-media'
      or (m->>'path') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/message-settings/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|jpeg|png|webp|mp4|mp3|m4a|ogg|webm)$'
      or length(m->>'fileName') not between 1 and 180 or (m->>'fileName') ~ '[/\\[:cntrl:]]'
      or not (case p->>'type' when 'image' then (m->>'mimeType') in ('image/jpeg','image/png','image/webp') when 'video' then (m->>'mimeType')='video/mp4' when 'audio' then (m->>'mimeType') in ('audio/mpeg','audio/mp4','audio/ogg','audio/webm') else false end)
      then raise exception 'message_sequences.media' using errcode='22023'; end if;
    -- Reuse secret checks for filenames without interpreting filenames as templates.
    perform public.validate_company_product_settings(jsonb_build_object('brand',jsonb_build_object('company_name',m->>'fileName')));
   end if;
  end loop;
 end loop;
 return _sequences;
end $$;
create or replace function public.validate_company_product_settings(_settings jsonb)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_defaults jsonb := public.company_product_settings_defaults();
  v_result jsonb := v_defaults;
  v_section text;
  v_key text;
  v_value jsonb;
  v_text text;
  v_clean text;
  v_match text[];
  v_message_variables jsonb := '{
    "weekly_contact":["primeiro_nome","nome","empresa"],
    "pre_registration_confirmation":["primeiro_nome","nome","empresa"],
    "fiscal_invite":["primeiro_nome","nome","empresa","link"],
    "payment_link":["primeiro_nome","nome","empresa","link"],
    "assessment_onboarding":["primeiro_nome","nome","empresa","prazo","data"],
    "anamnesis_invite":["primeiro_nome","nome","empresa","link"],
    "renewal_due":["primeiro_nome","nome","empresa","link"],
    "renewal_overdue":["primeiro_nome","nome","empresa","link"],
    "intercycle_invite":["primeiro_nome","nome","empresa","link"],
    "first_contact":["primeiro_nome","nome","empresa","profissional"],
    "daily_reminder_title":["primeiro_nome","nome","empresa","link","data"],
    "daily_reminder_body":["primeiro_nome","nome","empresa","link","data"],
    "new_workout_push_title":["primeiro_nome","nome","empresa"],
    "new_workout_push_body":["primeiro_nome","nome","empresa"]
  }'::jsonb;
  v_number numeric;
  v_range jsonb;
  v_ranges jsonb := '{"max_weekly_contacts":[1,2],"minimum_interval_hours":[72,168],"no_workout_days":[7,90],"no_workout_repeat_days":[6,90],"cart_abandonment_hours":[2,720],"payment_repeat_hours":[24,720],"start_hour":[0,23],"end_hour":[1,24],"assessment_sla_business_days":[1,30],"installments_short":[1,12],"installments_medium":[1,12],"installments_long":[1,12],"daily_reminder_hour":[0,23],"cadence_warning_hours":[1,720],"cadence_critical_hours":[1,720],"risk_no_workout_days":[1,90],"renewal_notice_days":[1,90],"xp_workout":[0,10000],"xp_external_activity":[0,10000],"weekly_consistency_xp":[0,10000],"beginner_max_weekly_sets":[1,21],"first_week_volume_multiplier":[0.5,1],"endurance_strength_multiplier":[0.5,1]}'::jsonb;
begin
  if _settings is null or jsonb_typeof(_settings) <> 'object' then
    raise exception 'Invalid settings object' using errcode = '22023';
  end if;
  for v_section in select jsonb_object_keys(_settings) loop
    if v_section='message_sequences' then
      v_result := v_result || jsonb_build_object('message_sequences', public.validate_company_message_sequences(_settings->v_section));
      continue;
    end if;
    if not (v_defaults ? v_section) or jsonb_typeof(_settings -> v_section) <> 'object' then
      raise exception 'Invalid settings section: %', v_section using errcode = '22023';
    end if;
    for v_key, v_value in select * from jsonb_each(_settings -> v_section) loop
      if not ((v_defaults -> v_section) ? v_key)
        or jsonb_typeof(v_value) <> jsonb_typeof(v_defaults #> array[v_section,v_key]) then
        raise exception 'Invalid settings field: %.%', v_section, v_key using errcode = '22023';
      end if;
      if v_section = 'prescription' and v_key in ('weekly_rules','allowed_methods','progression_mode','answer_mappings') then
        perform public.validate_prescription_methodology_field(v_key, v_value);
      elsif v_key = 'weekdays' then
        if jsonb_array_length(v_value) < 1 or jsonb_array_length(v_value) > 7 then
          raise exception 'Invalid weekdays' using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements(v_value) d where jsonb_typeof(d) <> 'number') then
          raise exception 'Invalid weekdays type' using errcode = '22023';
        end if;
        if exists (select 1 from jsonb_array_elements_text(v_value) d where d::numeric <> trunc(d::numeric) or d::numeric < 1 or d::numeric > 7)
          or (select count(distinct d) from jsonb_array_elements(v_value) d) <> jsonb_array_length(v_value) then
          raise exception 'Invalid weekdays values' using errcode = '22023';
        end if;
      elsif jsonb_typeof(v_value) = 'number' then
        v_number := v_value::text::numeric;
        v_range := v_ranges -> v_key;
        if v_range is null or v_number < (v_range ->> 0)::numeric or v_number > (v_range ->> 1)::numeric
          or (v_key not in ('first_week_volume_multiplier','endurance_strength_multiplier') and v_number <> trunc(v_number)) then
          raise exception 'Invalid numeric setting: %.%', v_section, v_key using errcode = '22023';
        end if;
      elsif jsonb_typeof(v_value) = 'string' then
        v_text := v_value #>> '{}';
        if char_length(v_text) > 6000 or v_text ~* '(\mBearer\s+\S+|\m(sk|sb_secret|service_role)[_-][A-Za-z0-9_-]{8,}|\meyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(api[_ -]?key|secret|password|senha|token)\s*[:=]\s*\S+)' then
          raise exception 'Invalid text or credential-like value: %.%', v_section, v_key using errcode = '22023';
        end if;
        if v_section = 'messages' then
          if v_text !~ '[^[:space:]]' then
            raise exception 'messages.%.required', v_key using errcode = '22023';
          end if;
          for v_match in select regexp_matches(v_text, '\{\{\s*([a-z_]+)\s*\}\}', 'g') loop
            if not coalesce((v_message_variables -> v_key) ? v_match[1], false) then
              raise exception 'messages.%.variable.%', v_key, v_match[1] using errcode = '22023';
            end if;
          end loop;
          v_clean := regexp_replace(v_text, '\{\{\s*([a-z_]+)\s*\}\}', '', 'g');
          if v_clean ~ '[{}]' then
            raise exception 'Malformed message variable' using errcode = '22023';
          end if;
        elsif position('{{' in v_text) > 0 or position('}}' in v_text) > 0 then
          raise exception 'Variables only allowed in messages' using errcode = '22023';
        end if;
        if v_key = 'timezone' and not exists (select 1 from pg_timezone_names where name = v_text) then
          raise exception 'Invalid timezone' using errcode = '22023';
        end if;
        if v_key = 'default_cadence' and v_text !~ '^[0-9]{4}$' then
          raise exception 'Invalid cadence' using errcode = '22023';
        end if;
        if v_key = 'preferred_split' and v_text not in ('auto','full_body','upper_lower','push_pull_legs') then
          raise exception 'Invalid split' using errcode = '22023';
        end if;
        if v_key = 'support_email' and v_text <> '' and v_text !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
          raise exception 'Invalid email' using errcode = '22023';
        end if;
        if v_key = 'support_whatsapp' and v_text <> '' and v_text !~ '^\+?[0-9 ()-]{7,30}$' then
          raise exception 'Invalid support number' using errcode = '22023';
        end if;
        if v_key in ('terms_url','privacy_url') and v_text <> '' and v_text !~ '^https://[^\s/?#]+([/?#][^\s]*)?$' then
          raise exception 'Invalid HTTPS URL' using errcode = '22023';
        end if;
      end if;
    end loop;
    v_result := jsonb_set(v_result, array[v_section], (v_defaults -> v_section) || (_settings -> v_section));
  end loop;
  if (v_result #>> '{contact_policy,start_hour}')::int >= (v_result #>> '{contact_policy,end_hour}')::int then
    raise exception 'Contact end hour must follow start hour' using errcode = '22023';
  end if;
  if (v_result #>> '{experience,cadence_warning_hours}')::int >= (v_result #>> '{experience,cadence_critical_hours}')::int then
    raise exception 'Critical threshold must exceed warning' using errcode = '22023';
  end if;
  return v_result;
end;
$$;
revoke all on function public.validate_company_message_sequences(jsonb),public.validate_company_product_settings(jsonb) from public,anon,authenticated;

-- Validate tenant + real private Storage reference at the existing CAS write boundary.
create function public.check_company_message_media() returns trigger language plpgsql set search_path='' as $$
declare p jsonb;
begin
 for p in select p.value from jsonb_each(coalesce(new.settings->'message_sequences','{}')) e cross join lateral jsonb_array_elements(e.value) p loop
  if (p->>'type') <> 'text' and not exists (
   select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
   where o.bucket_id='whatsapp-media' and b.public=false and o.name=p#>>'{media,path}'
     and split_part(o.name,'/',1)=new.company_id::text and o.metadata->>'mimetype'=p#>>'{media,mimeType}'
     and (o.metadata->>'size')::bigint between 1 and 16777216
  ) then raise exception 'message_sequences.media_unavailable' using errcode='22023'; end if;
 end loop;
 return new;
end $$;
-- Trigger executes under the authenticated save RPC definer; direct writes remain revoked.
create trigger company_message_media_guard before insert or update on public.company_product_settings for each row execute function public.check_company_message_media();
revoke all on function public.check_company_message_media() from public,anon,authenticated;

-- Reuse private chat bucket and existing tenant SELECT/INSERT policies. No public URLs.
-- Settings references are immutable: old history and frozen dispatches may still refer to them.
create policy message_settings_insert_guard on storage.objects as restrictive for insert to authenticated
 with check (bucket_id <> 'whatsapp-media' or split_part(name,'/',2) <> 'message-settings' or
  ((public.has_role(auth.uid(),'master'::public.app_role) or (public.has_role(auth.uid(),'admin'::public.app_role) and public.is_company_staff(auth.uid(),public.try_uuid(split_part(name,'/',1)))))
   and name ~ '^[a-f0-9-]{36}/message-settings/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|mp3|m4a|ogg|webm)$'));
create policy message_settings_update_guard on storage.objects as restrictive for update to authenticated
 using (bucket_id <> 'whatsapp-media' or split_part(name,'/',2) <> 'message-settings')
 with check (bucket_id <> 'whatsapp-media' or split_part(name,'/',2) <> 'message-settings');
create policy message_settings_delete_guard on storage.objects as restrictive for delete to authenticated
 using (bucket_id <> 'whatsapp-media' or split_part(name,'/',2) <> 'message-settings');

create table public.company_message_sequences (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 chat_id uuid not null references public.whatsapp_chats(id), occurrence text not null check(occurrence ~ '^[a-f0-9]{64}$'),
 snapshot jsonb not null, scope jsonb, created_at timestamptz not null default clock_timestamp(),
 unique(company_id,chat_id,occurrence)
);
create table public.company_message_parts (
 sequence_id uuid not null references public.company_message_sequences(id), part_index integer not null check(part_index between 0 and 19),
 state text not null default 'pending' check(state in ('pending','in_flight','acked')), token uuid,
 receipt text, updated_at timestamptz not null default clock_timestamp(), primary key(sequence_id,part_index)
);
alter table public.company_message_sequences enable row level security;
alter table public.company_message_parts enable row level security;
revoke all on public.company_message_sequences,public.company_message_parts from public,anon,authenticated;
grant select on public.company_message_sequences,public.company_message_parts to service_role;

-- Only trusted Edge service_role invokes these RPCs. Scope fence shares existing owner locks.
create function public.snapshot_company_message_sequence(_company_id uuid,_chat_id uuid,_occurrence text,_snapshot jsonb,_scope jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.company_message_sequences; n integer; states jsonb;
begin
 if not exists(select 1 from public.whatsapp_chats where id=_chat_id and company_id=_company_id) then raise exception 'sequence_scope_invalid'; end if;
 if _scope is not null then perform public.lock_automation_dispatch_owner(_scope->>'kind',(_scope->>'ownerId')::uuid,(_scope->>'leaseToken')::uuid); end if;
 if _scope is not null and not (
  ((_scope->>'kind')='flow' and exists(select 1 from public.flow_sessions f join public.automation_flows a on a.id=f.flow_id where f.id=(_scope->>'ownerId')::uuid and f.chat_id=_chat_id and a.company_id=_company_id))
  or ((_scope->>'kind')='intercycle' and exists(select 1 from public.intercycle_anamnesis_deliveries d where d.id=(_scope->>'ownerId')::uuid and d.company_id=_company_id))
 ) then raise exception 'sequence_scope_invalid'; end if;

 -- Serialize duplicate creation. Existing snapshots are never replaced by later settings.
 perform pg_advisory_xact_lock(hashtextextended('message_sequence:'||_company_id::text||':'||_chat_id::text||':'||_occurrence,0));
 select * into s from public.company_message_sequences where company_id=_company_id and chat_id=_chat_id and occurrence=_occurrence for update;
 if not found then
  if jsonb_typeof(_snapshot->'parts') is distinct from 'array' then raise exception 'sequence_parts_invalid'; end if;
  n := jsonb_array_length(_snapshot->'parts');
  if n not between 1 and 20 then raise exception 'sequence_parts_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(_snapshot->'parts') part where part->>'type'<>'text' and not exists (
   select 1 from (select settings from public.company_product_settings where company_id=_company_id
    union all select settings from public.company_product_settings_history where company_id=_company_id) cfg
   cross join lateral jsonb_each(coalesce(cfg.settings->'message_sequences','{}')) ev
   cross join lateral jsonb_array_elements(ev.value) allowed
   where allowed->'media'=part->'media'
  )) then raise exception 'sequence_media_not_authorized'; end if;
  insert into public.company_message_sequences(company_id,chat_id,occurrence,snapshot,scope) values(_company_id,_chat_id,_occurrence,_snapshot,_scope) returning * into s;
  insert into public.company_message_parts(sequence_id,part_index) select s.id,generate_series(0,n-1);
 elsif (s.scope->>'kind') is distinct from (_scope->>'kind') or (s.scope->>'ownerId') is distinct from (_scope->>'ownerId') then raise exception 'sequence_scope_changed'; end if;
 select jsonb_agg(state order by part_index) into states from public.company_message_parts where sequence_id=s.id;
 return jsonb_build_object('id',s.id,'snapshot',s.snapshot,'states',states);
end $$;
create function public.claim_company_message_part(_sequence_id uuid,_index integer,_scope jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.company_message_sequences; p public.company_message_parts;
begin
 if _scope is not null then perform public.lock_automation_dispatch_owner(_scope->>'kind',(_scope->>'ownerId')::uuid,(_scope->>'leaseToken')::uuid); end if;
 select * into s from public.company_message_sequences where id=_sequence_id for update;
 if not found then raise exception 'sequence_missing'; end if;
 if (s.scope->>'kind') is distinct from (_scope->>'kind') or (s.scope->>'ownerId') is distinct from (_scope->>'ownerId') then raise exception 'sequence_scope_changed'; end if;
 select * into p from public.company_message_parts where sequence_id=_sequence_id and part_index=_index for update;
 if not found then raise exception 'sequence_part_missing'; end if;
 if p.state='acked' then return jsonb_build_object('state','acked'); end if;
 if p.state <> 'pending' or exists(select 1 from public.company_message_parts where sequence_id=_sequence_id and part_index<_index and state<>'acked') then raise exception 'dispatch_uncertain'; end if;
 update public.company_message_parts set state='in_flight',token=gen_random_uuid(),updated_at=clock_timestamp() where sequence_id=_sequence_id and part_index=_index returning * into p;
 return jsonb_build_object('state',p.state,'token',p.token);
end $$;
create function public.authorize_company_message_part(_sequence_id uuid,_index integer,_token uuid,_scope jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
declare s public.company_message_sequences;
begin
 if _scope is not null then perform public.lock_automation_dispatch_owner(_scope->>'kind',(_scope->>'ownerId')::uuid,(_scope->>'leaseToken')::uuid); end if;
 select * into s from public.company_message_sequences where id=_sequence_id for update;
 if not found or (s.scope->>'kind') is distinct from (_scope->>'kind') or (s.scope->>'ownerId') is distinct from (_scope->>'ownerId') then raise exception 'sequence_scope_changed'; end if;
 if not exists(select 1 from public.company_message_parts where sequence_id=_sequence_id and part_index=_index and state='in_flight' and token=_token) then raise exception 'dispatch_uncertain'; end if;
end $$;
create function public.ack_company_message_part(_sequence_id uuid,_index integer,_token uuid,_receipt text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if _receipt is null or length(btrim(_receipt)) not between 1 and 200 or _receipt ~ '[[:cntrl:]]' then raise exception 'dispatch_receipt_missing'; end if;
 update public.company_message_parts set state='acked',receipt=_receipt,updated_at=clock_timestamp() where sequence_id=_sequence_id and part_index=_index and state='in_flight' and token=_token;
 if not found then raise exception 'dispatch_uncertain'; end if;
end $$;
revoke all on function public.snapshot_company_message_sequence(uuid,uuid,text,jsonb,jsonb), public.claim_company_message_part(uuid,integer,jsonb),public.authorize_company_message_part(uuid,integer,uuid,jsonb),public.ack_company_message_part(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.snapshot_company_message_sequence(uuid,uuid,text,jsonb,jsonb),public.claim_company_message_part(uuid,integer,jsonb),public.authorize_company_message_part(uuid,integer,uuid,jsonb),public.ack_company_message_part(uuid,integer,uuid,text) to service_role;

create function public.complete_intercycle_message_sequence(_owner_id uuid,_lease_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.lock_automation_dispatch_owner('intercycle',_owner_id,_lease_token);
 if not exists(select 1 from public.company_message_sequences s where s.scope->>'kind'='intercycle' and s.scope->>'ownerId'=_owner_id::text
   and not exists(select 1 from public.company_message_parts p where p.sequence_id=s.id and p.state<>'acked')) then raise exception 'sequence_not_complete'; end if;
 update public.intercycle_anamnesis_deliveries set status='sent',sent_at=clock_timestamp(),last_error_code=null,next_attempt_at=null,
  updated_at=clock_timestamp(),dispatch_lease_token=null,dispatch_lease_until=null where id=_owner_id;
end $$;
revoke all on function public.complete_intercycle_message_sequence(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_intercycle_message_sequence(uuid,uuid) to service_role;

-- Existing recovery predicates retained; new in-flight parts pause and safe pending parts resume.
create or replace function public.claim_automation_sessions(_limit integer default 25)
returns setof public.flow_sessions language plpgsql security definer
set search_path = public as $$
declare r public.flow_sessions;
begin
  for r in select s.* from public.flow_sessions s
    where s.current_node_id is not null and (
      (s.status = 'active' and coalesce(s.context->>'dispatch_error','') <> 'dispatch_uncertain'
       and (s.context->>'next_dispatch_at' is null or
         case when s.context->>'next_dispatch_at' ~ '^\d{4}-\d{2}-\d{2}T'
           then (s.context->>'next_dispatch_at')::timestamptz <= now() else true end))
      or (s.status = 'processing' and
        (s.dispatch_lease_until <= now() or s.dispatch_lease_token is null)))
    order by s.created_at for update skip locked
    limit greatest(1,least(coalesce(_limit,25),100))
  loop
    if public.automation_legacy_retry_uncertain('flow',r.status,r.context,null,r.dispatch_lease_token) and not exists(select 1 from public.company_message_sequences s where s.scope->>'kind'='flow' and s.scope->>'ownerId'=r.id::text) then
      insert into public.automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state)
        values ('flow',r.id,'_legacy_unknown',gen_random_uuid(),'in_flight') on conflict do nothing;
    end if;
    if exists (
      select 1 from public.automation_dispatch_attempts a
      where a.kind = 'flow' and a.owner_id = r.id and a.state = 'in_flight'
    ) or exists (select 1 from public.company_message_sequences s join public.company_message_parts p on p.sequence_id=s.id
      where s.scope->>'kind'='flow' and s.scope->>'ownerId'=r.id::text and p.state='in_flight') then
      update public.flow_sessions set status = 'failed',
        context = coalesce(context,'{}') || '{"dispatch_error":"dispatch_uncertain","next_dispatch_at":null}'::jsonb,
        dispatch_lease_token = null, dispatch_lease_until = null, updated_at = now()
        where id = r.id;
      continue;
    end if;
    update public.flow_sessions set status = 'processing',
      dispatch_lease_token = gen_random_uuid(), dispatch_lease_until = now() + interval '15 minutes',
      last_activity_at = now(), updated_at = now() where id = r.id returning * into r;
    return next r;
  end loop;
end $$;

-- Existing recovery predicates retained; new in-flight parts pause and safe pending parts resume.
create or replace function public.claim_intercycle_anamnesis_deliveries(_limit integer default 25)
returns setof public.intercycle_anamnesis_deliveries language plpgsql security definer
set search_path = public as $$
declare r public.intercycle_anamnesis_deliveries;
begin
  for r in select d.* from public.intercycle_anamnesis_deliveries d
    where ((d.status in ('scheduled','failed') and coalesce(d.last_error_code,'') not in
      ('dispatch_uncertain','company_feature_denied','company_feature_unavailable'))
      or (d.status = 'sending' and (d.dispatch_lease_until <= now() or d.dispatch_lease_token is null)))
      and d.scheduled_for <= now() and (d.next_attempt_at is null or d.next_attempt_at <= now())
    order by d.scheduled_for for update skip locked
    limit greatest(1,least(coalesce(_limit,25),100))
  loop
    if public.automation_legacy_retry_uncertain('intercycle',r.status,null,r.last_error_code,r.dispatch_lease_token) and not exists(select 1 from public.company_message_sequences s where s.scope->>'kind'='intercycle' and s.scope->>'ownerId'=r.id::text) then
      insert into public.automation_dispatch_attempts(kind,owner_id,send_key,lease_token,state)
        values ('intercycle',r.id,'_legacy_unknown',gen_random_uuid(),'in_flight') on conflict do nothing;
    end if;
    if exists (
      select 1 from public.automation_dispatch_attempts a
      where a.kind = 'intercycle' and a.owner_id = r.id and a.state = 'in_flight'
    ) or exists (select 1 from public.company_message_sequences s join public.company_message_parts p on p.sequence_id=s.id
      where s.scope->>'kind'='intercycle' and s.scope->>'ownerId'=r.id::text and p.state='in_flight') then
      update public.intercycle_anamnesis_deliveries set status = 'failed',
        last_error_code = 'dispatch_uncertain', next_attempt_at = null,
        dispatch_lease_token = null, dispatch_lease_until = null, updated_at = now()
        where id = r.id;
      continue;
    end if;
    update public.intercycle_anamnesis_deliveries set status = 'sending',
      dispatch_lease_token = gen_random_uuid(), dispatch_lease_until = now() + interval '15 minutes',
      updated_at = now() where id = r.id returning * into r;
    return next r;
  end loop;
end $$;

create function public.inspect_company_message_sequences(_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_company_staff(auth.uid(),_company_id) then raise exception 'Staff company access required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(x),'[]') into result from (
  select s.id,s.chat_id,s.created_at,s.scope->>'kind' source,s.scope->>'ownerId' owner_id,
   count(*) filter(where p.state='acked') confirmed_parts,
   count(*) filter(where p.state='in_flight') uncertain_parts,
   count(*) filter(where p.state='pending') pending_parts
  from public.company_message_sequences s join public.company_message_parts p on p.sequence_id=s.id
  where s.company_id=_company_id group by s.id having count(*) filter(where p.state='in_flight')>0
  order by s.created_at desc limit 50
 ) x;
 return result;
end $$;
revoke all on function public.inspect_company_message_sequences(uuid) from public,anon;
grant execute on function public.inspect_company_message_sequences(uuid) to authenticated;
