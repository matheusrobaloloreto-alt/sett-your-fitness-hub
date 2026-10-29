-- EMPTY disposable local database only; synthetic policy consumer fixture.
create schema auth;
create table auth.users(id uuid primary key);
create table public.companies(id uuid primary key);
create table public.company_product_settings(company_id uuid primary key, settings jsonb);
create table public.students(id uuid primary key, company_id uuid, full_name text, whatsapp text, phone text, country_code text, status text, weekly_contact_recipient_generation bigint default 1, weekly_contact_recipient_key text, weekly_contact_enabled boolean default true);
create table public.automation_flows(id uuid primary key, company_id uuid, is_active boolean default true, trigger_type text);
create table public.whatsapp_chats(id uuid primary key, company_id uuid, student_id uuid, remote_jid text);
create table public.workout_sessions(id uuid primary key, student_id uuid, completed_at timestamptz, session_date date, status text);
create table public.enrollments(id uuid primary key, student_id uuid, status text, training_start_date date, start_date date, created_at timestamptz default now(), payment_status text);
create table public.payments(id uuid primary key, student_id uuid, status text, created_at timestamptz default now());
create table public.payment_recovery_events(id uuid primary key default gen_random_uuid(), student_id uuid, company_id uuid, plan_id uuid, payment_id uuid, enrollment_id uuid, event_type text, source text, metadata jsonb, occurred_at timestamptz default now());
create table public.flow_sessions(id uuid primary key default gen_random_uuid(), flow_id uuid, chat_id uuid, current_node_id text, status text, context jsonb, started_at timestamptz, last_activity_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function public.get_automation_start_node(uuid) returns text language sql as $$ select 'start'::text $$;
-- Canonical ledger/recipient functions, not eligibility stubs.
-- BASELINE_CONSENT
-- BASELINE_RECOVERY
-- BASELINE_TRIGGERS
-- LOCAL_MIGRATION

insert into public.companies values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.students(id,company_id,full_name,phone,status) select id,id,'Synthetic','5548999999999','active' from companies;
insert into auth.users select id from companies;
insert into public.weekly_contact_consent_events(student_id,company_id,event_type,recipient_key,recipient_generation,policy_version,source,actor_user_id)
 select id,company_id,'granted',weekly_contact_recipient_key,weekly_contact_recipient_generation,public.weekly_contact_policy_version(),'staff_confirmed_student',company_id from students;
insert into public.whatsapp_chats select id,id,id,'5548999999999@s.whatsapp.net' from companies;
insert into public.enrollments(id,student_id,status,start_date) select id,id,'active',current_date-30 from companies;
insert into public.automation_flows select id,id,true,'weekly_contact' from companies;
insert into public.automation_flows values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',true,'weekly_contact');
insert into public.company_product_settings values ('00000000-0000-0000-0000-000000000001','{"contact_policy":{"minimum_interval_hours":168,"max_weekly_contacts":2,"start_hour":0,"end_hour":24,"weekdays":[1,2,3,4,5,6,7],"timezone":"UTC","no_workout_days":14,"no_workout_repeat_days":10,"payment_repeat_hours":72,"cart_abandonment_hours":24}}');
do $$ begin
  assert (public.process_automation_triggers()->>'weekly_contact')::integer = 2;
  assert (select count(*) = 2 from flow_sessions where context->>'recipient_generation' = '1');
end $$;
delete from public.flow_sessions;
insert into public.flow_sessions(flow_id,chat_id,status,context,created_at,updated_at)
 select id,id,'completed','{"trigger_type":"weekly_contact"}',now()-interval '80 hours',now()-interval '80 hours' from companies;
do $$ begin
  assert (public.process_automation_triggers()->>'weekly_contact')::integer = 1;
  assert (select count(*)=1 from flow_sessions where status='active' and flow_id='00000000-0000-0000-0000-000000000002');
end $$;
delete from public.flow_sessions;
update public.students set weekly_contact_enabled=false where company_id='00000000-0000-0000-0000-000000000001';
do $$ begin assert (public.process_automation_triggers()->>'weekly_contact')::integer=1; end $$;
delete from public.flow_sessions;
-- A mismatched persisted recipient never becomes eligible through settings.
update public.students set weekly_contact_enabled=true;
update public.whatsapp_chats set remote_jid='5548888888888@s.whatsapp.net' where company_id='00000000-0000-0000-0000-000000000001';
do $$ begin assert (public.process_automation_triggers()->>'weekly_contact')::integer=1; end $$;
delete from public.flow_sessions;
update public.automation_flows set trigger_type='no_workout_7d';
insert into public.workout_sessions select id,id,now()-interval '10 days',current_date-10,'completed' from companies;
do $$ begin
  assert (public.process_automation_triggers()->>'no_workout_7d')::integer=1;
  assert (select count(*)=1 from flow_sessions where flow_id='00000000-0000-0000-0000-000000000002');
end $$;
insert into public.payment_recovery_events(student_id,company_id,event_type,occurred_at) select id,id,'plan_selected',now()-interval '3 hours' from companies;
do $$ begin
  assert public.mark_payment_recovery_abandoned()=1;
  assert (select count(*)=1 from payment_recovery_events where event_type='payment_abandoned' and company_id='00000000-0000-0000-0000-000000000002');
  assert not has_function_privilege('authenticated','public.company_contact_window_open(uuid,timestamptz)','execute');
  assert not has_table_privilege('authenticated','public.company_push_reminder_receipts','INSERT');
end $$;
-- Exercise the canonical ledger eligibility and monotonic identity generation.
do $$
declare v_student public.students; v_key text; v_generation bigint;
begin
  select * into v_student from public.students where company_id='00000000-0000-0000-0000-000000000001';
  v_key:=v_student.weekly_contact_recipient_key; v_generation:=v_student.weekly_contact_recipient_generation;
  assert public.weekly_contact_consent_is_current(v_student.id,v_student.company_id,v_key,v_generation);
  assert not public.weekly_contact_consent_is_current(v_student.id,'00000000-0000-0000-0000-000000000002',v_key,v_generation);
  assert not public.weekly_contact_consent_is_current(v_student.id,v_student.company_id,'5548888888888',v_generation);
  assert not public.weekly_contact_consent_is_current(v_student.id,v_student.company_id,v_key,v_generation+1);
  assert not public.weekly_contact_consent_is_current(v_student.id,v_student.company_id,'123@g.us',v_generation);
  insert into public.weekly_contact_consent_events(student_id,company_id,event_type,recipient_key,recipient_generation,policy_version,source,actor_user_id)
    values(v_student.id,v_student.company_id,'granted',v_key,v_generation,'obsolete-policy','staff_confirmed_student',v_student.company_id);
  assert not public.weekly_contact_consent_is_current(v_student.id,v_student.company_id,v_key,v_generation);
  insert into public.weekly_contact_consent_events(student_id,company_id,event_type,policy_version,source,actor_user_id)
    values(v_student.id,v_student.company_id,'revoked',public.weekly_contact_policy_version(),'staff_confirmed_student',v_student.company_id);
  assert not public.weekly_contact_consent_is_current(v_student.id,v_student.company_id,v_key,v_generation);
  insert into public.weekly_contact_consent_events(student_id,company_id,event_type,recipient_key,recipient_generation,policy_version,source,actor_user_id)
    values(v_student.id,v_student.company_id,'granted',v_key,v_generation,public.weekly_contact_policy_version(),'staff_confirmed_student',v_student.company_id);
  update public.students set phone='5548888888888' where id=v_student.id;
  update public.students set phone=v_student.phone where id=v_student.id;
  assert (select weekly_contact_recipient_generation>v_generation from public.students where id=v_student.id);
  assert not public.weekly_contact_consent_is_current(v_student.id,v_student.company_id,v_key,(select weekly_contact_recipient_generation from public.students where id=v_student.id));
  insert into public.weekly_contact_consent_events(student_id,company_id,event_type,recipient_key,recipient_generation,policy_version,source,actor_user_id)
    select id,company_id,'granted',weekly_contact_recipient_key,weekly_contact_recipient_generation,public.weekly_contact_policy_version(),'staff_confirmed_student',company_id from public.students where id=v_student.id;
end $$;

-- Exact business-window boundaries, hard ceilings and company-wide contact history.
do $$
declare v_company uuid:='00000000-0000-0000-0000-000000000001'; v_original jsonb;
begin
  select settings into v_original from public.company_product_settings where company_id=v_company;
  update public.company_product_settings set settings='{"contact_policy":{"timezone":"UTC","weekdays":[1],"start_hour":8,"end_hour":20,"minimum_interval_hours":1,"max_weekly_contacts":99}}' where company_id=v_company;
  assert public.company_communication_number(v_company,'minimum_interval_hours',72,72,168)=72;
  assert public.company_communication_number(v_company,'max_weekly_contacts',2,1,2)=2;
  assert public.company_contact_window_open(v_company,'2026-10-26 08:00:00+00');
  assert not public.company_contact_window_open(v_company,'2026-10-26 07:59:59+00');
  assert not public.company_contact_window_open(v_company,'2026-10-26 20:00:00+00');
  assert not public.company_contact_window_open(v_company,'2026-10-27 08:00:00+00');
  update public.company_product_settings set settings=jsonb_set(settings,'{contact_policy,timezone}','"Invalid/Zone"') where company_id=v_company;
  assert not public.company_contact_window_open(v_company,'2026-10-26 08:00:00+00');
  update public.company_product_settings set settings='{"contact_policy":{"timezone":"UTC","weekdays":[1,2,3,4,5,6,7],"start_hour":0,"end_hour":24,"minimum_interval_hours":72,"max_weekly_contacts":2}}' where company_id=v_company;
  update public.automation_flows set trigger_type='weekly_contact',is_active=(company_id=v_company);
  update public.whatsapp_chats set remote_jid='5548999999999@s.whatsapp.net' where company_id=v_company;
  delete from public.flow_sessions;
  insert into public.flow_sessions(flow_id,chat_id,status,context,created_at,updated_at)
    values(v_company,v_company,'completed','{"trigger_type":"weekly_contact"}',now()-interval '72 hours',now()-interval '72 hours');
  assert (public.process_automation_triggers()->>'weekly_contact')::integer=0;
  update public.flow_sessions set created_at=now()-interval '80 hours',updated_at=now()-interval '80 hours';
  update public.company_product_settings set settings=jsonb_set(settings,'{contact_policy,max_weekly_contacts}','1') where company_id=v_company;
  assert (public.process_automation_triggers()->>'weekly_contact')::integer=0;
  update public.company_product_settings set settings=jsonb_set(settings,'{contact_policy,max_weekly_contacts}','2') where company_id=v_company;
  assert (public.process_automation_triggers()->>'weekly_contact')::integer=1;
  delete from public.flow_sessions;
  insert into public.flow_sessions(flow_id,chat_id,status,context,created_at,updated_at)
    values(v_company,v_company,'completed','{"trigger_type":"weekly_contact"}',now()-interval '80 hours',now()-interval '80 hours'),
      ('00000000-0000-0000-0000-000000000011',v_company,'completed','{"trigger_type":"weekly_contact"}',now()-interval '160 hours',now()-interval '160 hours');
  assert (public.process_automation_triggers()->>'weekly_contact')::integer=0;
  delete from public.flow_sessions;
  insert into public.flow_sessions(flow_id,chat_id,status,context,created_at,updated_at)
    values('00000000-0000-0000-0000-000000000011',v_company,'processing',jsonb_build_object('trigger_type','weekly_contact','student_id',v_company),now()-interval '8 days',now()-interval '8 days');
  assert (public.process_automation_triggers()->>'weekly_contact')::integer=0;
  update public.company_product_settings set settings=v_original where company_id=v_company;
end $$;
-- Non-weekly business rails are consumed by the canonical trigger, per tenant.
do $$ begin
  update public.automation_flows set trigger_type='no_workout_7d',is_active=(id=company_id);
  update public.workout_sessions set completed_at=now()-interval '20 days',session_date=current_date-20;
  delete from public.flow_sessions;
  insert into public.flow_sessions(flow_id,chat_id,status,context,created_at,updated_at)
    select id,id,'completed',jsonb_build_object('trigger_type','no_workout_7d','automation_key','no_workout_7d:'||id::text),now()-interval '8 days',now()-interval '8 days' from public.companies;
  assert (public.process_automation_triggers()->>'no_workout_7d')::integer=1;
  assert (select count(*)=1 from public.flow_sessions where status='active' and flow_id='00000000-0000-0000-0000-000000000002');
  update public.automation_flows set trigger_type='payment_pending';
  update public.enrollments set payment_status='pending';
  delete from public.flow_sessions;
  insert into public.flow_sessions(flow_id,chat_id,status,context,created_at,updated_at)
    select id,id,'completed',jsonb_build_object('trigger_type','payment_pending','automation_key','payment_pending:'||id::text||':'||id::text),now()-interval '48 hours',now()-interval '48 hours' from public.companies;
  assert (public.process_automation_triggers()->>'payment_pending')::integer=1;
  assert (select count(*)=1 from public.flow_sessions where status='active' and context->>'recovery_type' is null and flow_id='00000000-0000-0000-0000-000000000002');
end $$;
select 'communication_policy_local_passed';
