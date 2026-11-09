-- Keep the draft template out of the strict settings JSON read by older Edge releases.
-- NULL preserves the original draft copy for existing tenants and legacy clients.
-- Apply before updating the UI. On rollback, revert the UI first and retain saved templates.
begin;

create function settings_private.valid_birthday_message_template(template text)
returns boolean language sql immutable strict set search_path='' as $$
  select char_length(template) <= 6000
    and template ~ '[^[:space:]]'
    and template !~* '(\mBearer\s+\S+|\m(sk|sb_secret|service_role)[_-][A-Za-z0-9_-]{8,}|\meyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(api[_ -]?key|secret|password|senha|token)\s*[:=]\s*\S+)'
    and regexp_replace(template, '\{\{\s*(primeiro_nome|nome|empresa)\s*\}\}', '', 'g') !~ '[{}]';
$$;
revoke all on function settings_private.valid_birthday_message_template(text) from public,anon,authenticated,service_role;

alter table public.company_product_settings
 add column birthday_message_template text
 check (settings_private.valid_birthday_message_template(birthday_message_template));
alter table public.company_product_settings_history
 add column birthday_message_template text
 check (settings_private.valid_birthday_message_template(birthday_message_template));

-- The existing trigger also captures the template when a legacy writer omits it.
create or replace function settings_private.capture_workout_expiry_policy_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 select s.expired_workout_behavior,s.birthday_message_template
 into new.expired_workout_behavior,new.birthday_message_template
 from public.company_product_settings s where s.company_id=new.company_id;
 if not found then raise exception 'Settings policy missing for history' using errcode='23514'; end if;
 return new;
end $$;

create or replace function public.save_company_product_settings(_company_id uuid,_settings jsonb,_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; behavior text; current_behavior text; saved_version integer; changed integer; birthday_template text;
begin
 -- The legacy function authenticates and authorizes this exact company BEFORE
 -- we read/write its policy. Removing the virtual field never bypasses validation.
 result:=settings_private.save_company_product_settings(
   _company_id,_settings #- '{prescription,expired_workout_behavior}' #- '{messages,birthday}',_expected_version);
 saved_version:=(result->>'version')::integer;
 select expired_workout_behavior, birthday_message_template into strict current_behavior, birthday_template
 from public.company_product_settings where company_id=_company_id for update;
 behavior:=current_behavior;
 if (_settings->'prescription') ? 'expired_workout_behavior' then
   if jsonb_typeof(_settings#>'{prescription,expired_workout_behavior}') is distinct from 'string' then
     raise exception 'Invalid expired workout behavior' using errcode='22023';
   end if;
   behavior:=_settings#>>'{prescription,expired_workout_behavior}';
   if behavior not in ('keep_until_replaced','hide_on_expiry') then
     raise exception 'Invalid expired workout behavior' using errcode='22023';
   end if;
 end if;
 if behavior is distinct from current_behavior then
   if not public.company_feature_allowed(_company_id,'hasPrescription') then
     raise exception 'Company feature unavailable: hasPrescription' using errcode='42501';
   end if;
 end if;
 if (_settings->'messages') ? 'birthday' then
   if jsonb_typeof(_settings#>'{messages,birthday}') is distinct from 'string' then
     raise exception 'Invalid birthday message template' using errcode='22023';
   end if;
   birthday_template:=_settings#>>'{messages,birthday}';
   if not settings_private.valid_birthday_message_template(birthday_template) then
     raise exception 'Invalid birthday message template' using errcode='22023';
   end if;
 end if;
 update public.company_product_settings
 set expired_workout_behavior=behavior, birthday_message_template=birthday_template
 where company_id=_company_id and version=saved_version
   and (expired_workout_behavior is distinct from behavior or birthday_message_template is distinct from birthday_template);
 -- Update the same history version atomically with both settings columns.
 update public.company_product_settings_history set expired_workout_behavior=behavior, birthday_message_template=birthday_template
 where company_id=_company_id and version=saved_version;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Settings policy history missing' using errcode='23514'; end if;
 return result || jsonb_build_object('expired_workout_behavior',behavior,'birthday_message_template',birthday_template);
end $$;
revoke all on function public.save_company_product_settings(uuid,jsonb,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.save_company_product_settings(uuid,jsonb,integer) to authenticated;

commit;
