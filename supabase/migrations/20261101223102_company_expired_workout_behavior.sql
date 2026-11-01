-- Additive policy outside settings JSON: published legacy Edge codecs stay compatible.
-- No JSON/settings backfill, date/status changes or publication. Deploy migration
-- before the new frontend; rollback frontend first and keep the columns/wrapper.
begin;
create schema if not exists settings_private;
revoke all on schema settings_private from public,anon,authenticated,service_role;

alter table public.company_product_settings
 add column expired_workout_behavior text not null default 'keep_until_replaced'
 constraint company_product_settings_expired_workout_behavior_check
 check(expired_workout_behavior in ('keep_until_replaced','hide_on_expiry'));
alter table public.company_product_settings_history
 add column expired_workout_behavior text not null default 'keep_until_replaced'
 constraint company_product_settings_history_expired_workout_behavior_check
 check(expired_workout_behavior in ('keep_until_replaced','hide_on_expiry'));

-- SQL callers may have cached the old function OID before its schema move.
-- Capture history independently of the new wrapper so those callers cannot
-- invent a hide -> keep audit transition when omitting the virtual field.
create function settings_private.capture_workout_expiry_policy_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 select s.expired_workout_behavior into new.expired_workout_behavior
 from public.company_product_settings s where s.company_id=new.company_id;
 if not found then raise exception 'Settings policy missing for history' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function settings_private.capture_workout_expiry_policy_history() from public,anon,authenticated,service_role;
create trigger capture_workout_expiry_policy_history before insert on public.company_product_settings_history
 for each row execute function settings_private.capture_workout_expiry_policy_history();

-- Retain the established authorization, validation, advisory/row locks, CAS and
-- versioned audit. Remove the helper from the public API; only its owner calls it.
alter function public.save_company_product_settings(uuid,jsonb,integer) set schema settings_private;
revoke all on function settings_private.save_company_product_settings(uuid,jsonb,integer)
 from public,anon,authenticated,service_role;

create function public.save_company_product_settings(_company_id uuid,_settings jsonb,_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; behavior text; current_behavior text; saved_version integer; changed integer;
begin
 -- The legacy function authenticates and authorizes this exact company BEFORE
 -- we read/write its policy. Removing the virtual field never bypasses validation.
 result:=settings_private.save_company_product_settings(
   _company_id,_settings #- '{prescription,expired_workout_behavior}',_expected_version);
 saved_version:=(result->>'version')::integer;
 select expired_workout_behavior into strict current_behavior
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
   update public.company_product_settings set expired_workout_behavior=behavior
   where company_id=_company_id and version=saved_version;
 end if;
 -- The legacy INSERT uses the column default. Correct the SAME version before
 -- commit, even for an old client omitting policy: hide must stay hide in audit.
 update public.company_product_settings_history set expired_workout_behavior=behavior
 where company_id=_company_id and version=saved_version;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Settings policy history missing' using errcode='23514'; end if;
 return result || jsonb_build_object('expired_workout_behavior',behavior);
end $$;
revoke all on function public.save_company_product_settings(uuid,jsonb,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.save_company_product_settings(uuid,jsonb,integer) to authenticated;
-- Minimal student/staff read: no company settings JSON is returned or granted.
create function public.get_company_workout_expiry_policy(_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); behavior text; settings_version integer;
begin
 if actor is null or _company_id is null or not exists(select 1 from public.companies where id=_company_id)
   or not (
     public.has_role(actor,'master'::public.app_role)
     or public.is_company_staff(actor,_company_id)
     or exists(select 1 from public.students s where s.user_id=actor and s.company_id=_company_id)
   ) then raise exception 'Not authorized for company workout expiry policy' using errcode='42501'; end if;
 select expired_workout_behavior,version into behavior,settings_version
 from public.company_product_settings where company_id=_company_id;
 if not found then behavior:='keep_until_replaced'; settings_version:=0; end if;
 if behavior is null or behavior not in ('keep_until_replaced','hide_on_expiry') then
   raise exception 'Invalid stored expired workout behavior' using errcode='23514';
 end if;
 return jsonb_build_object('company_id',_company_id,'expired_workout_behavior',behavior,'version',settings_version);
end $$;
revoke all on function public.get_company_workout_expiry_policy(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_company_workout_expiry_policy(uuid) to authenticated;
-- Existing RLS, table grants, JSON defaults/validator and audit versioning are unchanged.
commit;
