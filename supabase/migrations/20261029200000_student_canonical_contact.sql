-- Section 6 only. Forward migration; NO bulk reconciliation/backfill.
-- Deploy before the contact editor. Existing consent generation/auth guards remain.
-- Rollback: first retire the new caller, then drop update_student_contact and the
-- three contact triggers/functions introduced here in a reviewed forward migration.
-- Retain the private audit and the two ambiguity filters. Data rollback is a
-- separate row-CAS operation against the root's restricted before-snapshot; never
-- restore a stale snapshot or transfer consent automatically.
begin;
-- Refuse to replace unknown live routing/locking code. Only the exact inspected
-- source is accepted (whitespace ignored); root must review any drift first.
do $contact_preflight$
begin
 if to_regprocedure('commercial_private.registration_phone_key(text,text,text)') is null
 or to_regprocedure('public.weekly_contact_current_recipient_key(text,text,text)') is null
 or to_regprocedure('public.can_manage_staff_student(uuid,uuid)') is null then
  raise exception 'contact_schema_prerequisite_missing' using errcode='23514';
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.link_whatsapp_chat_to_student()') and prosecdef and proconfig=array['search_path=public']::text[] and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='487b3e9835a7087f5d396a10aea3ae21') then raise exception 'contact_linker_baseline_changed: link_whatsapp_chat_to_student' using errcode='23514'; end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.link_student_to_existing_whatsapp_chats()') and prosecdef and proconfig=array['search_path=public']::text[] and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='9dee91946ca5d3c571e3025bdd47455e') then raise exception 'contact_linker_baseline_changed: link_student_to_existing_whatsapp_chats' using errcode='23514'; end if;
end $contact_preflight$;
create schema if not exists student_contact_private;
revoke all on schema student_contact_private from public,anon,authenticated;
create table student_contact_private.write_context (
 transaction_id bigint not null, backend_pid integer not null, student_id uuid not null,
 actor_id uuid, source_role text not null, expected_updated_at timestamptz not null,
 target_key text, target_country text, confirmed boolean not null,
 primary key(transaction_id,backend_pid,student_id)
);
create table student_contact_private.audit (
 id bigint generated always as identity primary key,
 student_id uuid not null, company_id uuid, actor_id uuid, source_role text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 before_updated_at timestamptz, after_updated_at timestamptz,
 source text not null check(source in ('rpc','direct')),
 changed_fields text[] not null, explicit_confirmation boolean not null,
 old_identity_unresolved boolean not null,
 before_recipient_generation bigint, after_recipient_generation bigint
);
alter table student_contact_private.write_context enable row level security;
alter table student_contact_private.audit enable row level security;
revoke all on all tables in schema student_contact_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema student_contact_private from public,anon,authenticated,service_role;

-- Service repair is an explicitly separate trusted execution context, not a
-- fabricated human identity. Staff still uses auth.uid + existing permissions.
create function student_contact_private.is_service_request()
returns boolean language sql stable set search_path=pg_catalog,public as $$
 select coalesce(auth.role()='service_role',false) or current_setting('role',true)='service_role'
$$;
revoke all on function student_contact_private.is_service_request() from public,anon,authenticated,service_role;

-- Validation/normalization delegates entirely to existing DB helpers. In
-- particular, store the FULL registration-normalized contact, preserving its
-- ninth digit. Weekly recipient keys are identity-only, never display storage.
create function student_contact_private.normalized_contact(_value text,_country text)
returns text language plpgsql immutable set search_path=pg_catalog,public as $$
declare k text;
begin
 if nullif(btrim(_value),'') is null then return null; end if;
 k:=commercial_private.registration_phone_key(_value,_country,'stored');
 if k is null then raise exception 'contact_format_invalid' using errcode='22023'; end if;
 if public.weekly_contact_stored_recipient_key(k,_country) is null then raise exception 'contact_identity_invalid' using errcode='22023'; end if;
 return k;
end $$;
revoke all on function student_contact_private.normalized_contact(text,text) from public,anon,authenticated,service_role;

create function student_contact_private.guard_contact()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 phone_changed boolean; whatsapp_changed boolean; k_phone text; k_whatsapp text;
 k text; identity_key text; country text; old_unresolved boolean:=false; authorized boolean:=false;
begin
 if tg_op='UPDATE' then
  if new.phone is not distinct from old.phone and new.whatsapp is not distinct from old.whatsapp
    and new.country_code is not distinct from old.country_code and new.company_id is not distinct from old.company_id then
   return new; -- Preserve legacy divergence on unrelated edits; identity stays blocked.
  end if;
  phone_changed:=new.phone is distinct from old.phone;
  whatsapp_changed:=new.whatsapp is distinct from old.whatsapp;
  old_unresolved:=public.weekly_contact_current_recipient_key(old.whatsapp,old.phone,old.country_code) is null
    and (nullif(btrim(old.whatsapp),'') is not null or nullif(btrim(old.phone),'') is not null);
 else
  phone_changed:=nullif(btrim(new.phone),'') is not null;
  whatsapp_changed:=nullif(btrim(new.whatsapp),'') is not null;
 end if;
 country:=upper(btrim(new.country_code));
 if country is null or country !~ '^[A-Z]{2}$' then raise exception 'contact_country_invalid' using errcode='22023'; end if;
 if new.company_id is null then raise exception 'contact_company_required' using errcode='23514'; end if;
 if phone_changed and not whatsapp_changed then
  k:=student_contact_private.normalized_contact(new.phone,country);
 elsif whatsapp_changed and not phone_changed then
  k:=student_contact_private.normalized_contact(new.whatsapp,country);
 else
  k_phone:=student_contact_private.normalized_contact(new.phone,country);
  k_whatsapp:=student_contact_private.normalized_contact(new.whatsapp,country);
  if public.weekly_contact_stored_recipient_key(k_phone,country) is distinct from public.weekly_contact_stored_recipient_key(k_whatsapp,country) then raise exception 'contact_fields_divergent' using errcode='PT409'; end if;
  k:=k_whatsapp;
 end if;
 if tg_op='UPDATE' and old_unresolved then
  select exists(select 1 from student_contact_private.write_context c
   where c.transaction_id=txid_current() and c.backend_pid=pg_backend_pid() and c.student_id=old.id
     and c.actor_id is not distinct from auth.uid() and c.expected_updated_at=old.updated_at and c.confirmed
     and c.target_key is not distinct from k and c.target_country=country) into authorized;
  if not authorized then raise exception 'contact_reconciliation_confirmation_required' using errcode='PT409'; end if;
 end if;
 identity_key:=public.weekly_contact_stored_recipient_key(k,country);
 -- Same tenant serialization protects concurrent different-student claims, without
 -- imposing uniqueness on historical data or locking/modifying peer rows.
 perform pg_advisory_xact_lock(hashtextextended('student-contact:'||new.company_id::text,29200000));
 if k is not null and exists(select 1 from public.students peer
   where peer.company_id=new.company_id and peer.id<>new.id and
   (public.weekly_contact_stored_recipient_key(peer.whatsapp,peer.country_code)=identity_key
    or public.weekly_contact_stored_recipient_key(peer.phone,peer.country_code)=identity_key)) then
  raise exception 'contact_ownership_conflict' using errcode='PT409';
 end if;
 if k is not null and exists(select 1 from public.whatsapp_chats chat
   where chat.company_id=new.company_id and chat.student_id is not null and chat.student_id<>new.id
   and public.weekly_contact_recipient_key(chat.remote_jid)=identity_key) then
  raise exception 'contact_chat_ownership_conflict' using errcode='PT409';
 end if;
 new.whatsapp:=k;new.phone:=k;new.country_code:=country;
 return new;
end $$;
revoke all on function student_contact_private.guard_contact() from public,anon,authenticated,service_role;
-- Runs BEFORE the existing recipient-generation trigger, not instead of it.
create trigger a_student_canonical_contact before insert or update on public.students
for each row execute function student_contact_private.guard_contact();

create function student_contact_private.bump_version()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 -- Existing update_students_updated_at sets now(). This final trigger ensures a
 -- fresh CAS epoch even for mirror-only correction or multiple edits in one tx.
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 return new;
end $$;
revoke all on function student_contact_private.bump_version() from public,anon,authenticated,service_role;
create trigger zzzz_student_contact_version before update on public.students
for each row execute function student_contact_private.bump_version();

create function student_contact_private.audit_contact()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare c student_contact_private.write_context; changed text[]; before_row jsonb;
begin
 before_row:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 select * into c from student_contact_private.write_context
 where transaction_id=txid_current() and backend_pid=pg_backend_pid() and student_id=new.id;
 select coalesce(array_agg(e.key order by e.key),'{}'::text[]) into changed
 from jsonb_each(to_jsonb(new)) e where e.key=any(array['phone','whatsapp','country_code','full_name','email','birth_date','cpf','cep','address','address_number','neighborhood','city','state','status','notes'])
 and e.value is distinct from before_row->e.key;
 if c.student_id is null and (tg_op='UPDATE' and new.phone is not distinct from old.phone
  and new.whatsapp is not distinct from old.whatsapp and new.country_code is not distinct from old.country_code) then return new; end if;
 insert into student_contact_private.audit(student_id,company_id,actor_id,source_role,before_updated_at,after_updated_at,source,
  changed_fields,explicit_confirmation,old_identity_unresolved,before_recipient_generation,after_recipient_generation)
 values(new.id,new.company_id,auth.uid(),coalesce(c.source_role,case when student_contact_private.is_service_request() then 'service_role' else 'authenticated' end),case when tg_op='UPDATE' then old.updated_at end,new.updated_at,
  case when c.student_id is not null then 'rpc' else 'direct' end,changed,coalesce(c.confirmed,false),
  case when tg_op='UPDATE' then public.weekly_contact_current_recipient_key(old.whatsapp,old.phone,old.country_code) is null
    and (nullif(btrim(old.whatsapp),'') is not null or nullif(btrim(old.phone),'') is not null) else false end,
  case when tg_op='UPDATE' then old.weekly_contact_recipient_generation end,new.weekly_contact_recipient_generation);
 return new;
end $$;
revoke all on function student_contact_private.audit_contact() from public,anon,authenticated,service_role;
create trigger student_canonical_contact_audit after insert or update on public.students
for each row execute function student_contact_private.audit_contact();

create function public.update_student_contact(
 _student_id uuid,_company_id uuid,_expected_updated_at timestamptz,_expected_phone text,_expected_whatsapp text,
 _contact text,_country_code text,_confirmed_contact boolean,_profile_patch jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.students; p public.students; country text; k text; patch jsonb:=coalesce(_profile_patch,'{}'::jsonb); result jsonb; service_request boolean:=student_contact_private.is_service_request();
begin
 if not service_request and (auth.uid() is null or not public.can_manage_staff_student(_company_id,_student_id)) then
  raise exception 'contact_not_authorized' using errcode='42501';
 end if;
 if jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_each(patch) e
  where e.key<>all(array['full_name','email','birth_date','cpf','cep','address','address_number','neighborhood','city','state','status','notes'])
   or jsonb_typeof(e.value) not in ('string','null')) then raise exception 'contact_profile_patch_invalid' using errcode='22023'; end if;
 select * into s from public.students where id=_student_id and company_id=_company_id for update;
 if not found or s.updated_at is distinct from _expected_updated_at or s.phone is distinct from _expected_phone or s.whatsapp is distinct from _expected_whatsapp then
  raise exception 'contact_version_conflict' using errcode='PT409';
 end if;
 -- Re-evaluate authorization after the row lock (tenant/membership may change).
 if not service_request and not public.can_manage_staff_student(_company_id,_student_id) then raise exception 'contact_not_authorized' using errcode='42501'; end if;
 country:=upper(btrim(_country_code));
 if _confirmed_contact is true then
  if country is null or country !~ '^[A-Z]{2}$' then raise exception 'contact_country_invalid' using errcode='22023'; end if;
  k:=student_contact_private.normalized_contact(_contact,country);
 else
  if country is distinct from upper(btrim(s.country_code)) or (_contact is distinct from s.whatsapp and
   (public.weekly_contact_stored_recipient_key(s.whatsapp,s.country_code) is null or
    public.weekly_contact_stored_recipient_key(_contact,country) is distinct from public.weekly_contact_stored_recipient_key(s.whatsapp,s.country_code))) then
   raise exception 'contact_confirmation_required' using errcode='PT409';
  end if;
  country:=s.country_code;
  k:=public.weekly_contact_stored_recipient_key(s.whatsapp,s.country_code);
 end if;
 p:=jsonb_populate_record(s,patch);
 if nullif(btrim(p.full_name),'') is null then raise exception 'contact_profile_name_required' using errcode='22023'; end if;
 insert into student_contact_private.write_context values(txid_current(),pg_backend_pid(),s.id,auth.uid(),case when service_request then 'service_role' else 'authenticated' end,s.updated_at,k,country,coalesce(_confirmed_contact,false));
 update public.students set
  phone=case when _confirmed_contact is true then k else s.phone end,
  whatsapp=case when _confirmed_contact is true then k else s.whatsapp end,
  country_code=case when _confirmed_contact is true then country else s.country_code end,
  full_name=p.full_name,email=p.email,birth_date=p.birth_date,cpf=p.cpf,cep=p.cep,address=p.address,
  address_number=p.address_number,neighborhood=p.neighborhood,city=p.city,state=p.state,status=p.status,notes=p.notes
 where id=s.id and company_id=_company_id returning * into s;
 delete from student_contact_private.write_context where transaction_id=txid_current() and backend_pid=pg_backend_pid() and student_id=s.id;
 select jsonb_object_agg(e.key,e.value) into result from jsonb_each(to_jsonb(s)) e
 where e.key=any(array['id','company_id','updated_at','phone','whatsapp','country_code','weekly_contact_recipient_generation',
 'full_name','email','birth_date','cpf','cep','address','address_number','neighborhood','city','state','status','notes']);
 return result;
end $$;
revoke all on function public.update_student_contact(uuid,uuid,timestamptz,text,text,text,text,boolean,jsonb) from public,anon,service_role;
grant execute on function public.update_student_contact(uuid,uuid,timestamptz,text,text,text,text,boolean,jsonb) to authenticated,service_role;

-- Exact live definitions inspected read-only on 2026-10-29. Add only ambiguity
-- filters; preserve routing, count semantics, existing links and all other logic.
create or replace function public.link_whatsapp_chat_to_student()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_phone_key text;v_student_id uuid;v_matches integer;
begin
 if new.student_id is not null or new.remote_jid not like '%@s.whatsapp.net' then return new; end if;
 v_phone_key:=public.sett_phone_key(split_part(new.remote_jid,'@',1));
 if v_phone_key is null then return new; end if;
 select (array_agg(s.id order by s.id))[1],count(distinct s.id) into v_student_id,v_matches
 from public.students s where s.company_id=new.company_id
 and public.weekly_contact_current_recipient_key(s.whatsapp,s.phone,s.country_code) is not null
 and v_phone_key in (public.sett_phone_key(s.whatsapp),public.sett_phone_key(s.phone));
 if v_matches=1 then new.student_id:=v_student_id; end if;
 return new;
end $$;
create or replace function public.link_student_to_existing_whatsapp_chats()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.whatsapp_chats c set student_id=new.id
 where c.company_id=new.company_id and c.student_id is null and c.remote_jid like '%@s.whatsapp.net'
 and public.weekly_contact_current_recipient_key(new.whatsapp,new.phone,new.country_code) is not null
 and public.sett_phone_key(split_part(c.remote_jid,'@',1)) in (public.sett_phone_key(new.whatsapp),public.sett_phone_key(new.phone))
 and 1=(select count(distinct candidate.id) from public.students candidate where candidate.company_id=new.company_id
  and public.weekly_contact_current_recipient_key(candidate.whatsapp,candidate.phone,candidate.country_code) is not null
  and public.sett_phone_key(split_part(c.remote_jid,'@',1)) in (public.sett_phone_key(candidate.whatsapp),public.sett_phone_key(candidate.phone)));
 return new;
end $$;
commit;
