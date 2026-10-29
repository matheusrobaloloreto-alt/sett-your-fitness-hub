begin;

-- Service-only policy readers. Hard bounds preserve the existing contact ceiling.
create or replace function public.company_communication_number(_company_id uuid, _key text, _default integer, _min integer, _max integer)
returns integer language sql stable security definer set search_path = public
as $$
  select greatest(_min, least(_max, coalesce((
    select case when settings->'contact_policy'->>_key ~ '^\d{1,6}$'
      then (settings->'contact_policy'->>_key)::integer end
    from public.company_product_settings where company_id = _company_id
  ), _default)));
$$;

create or replace function public.company_contact_window_open(_company_id uuid, _now timestamptz default now())
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
  v_policy jsonb;
  v_local timestamp;
  v_zone text;
begin
  select settings->'contact_policy' into v_policy from public.company_product_settings where company_id = _company_id;
  if v_policy is null then return true; end if; -- Legacy unset policy keeps its window.
  v_zone := coalesce(v_policy->>'timezone', 'America/Sao_Paulo');
  if not exists(select 1 from pg_timezone_names where name = v_zone) then return false; end if;
  v_local := _now at time zone v_zone;
  return coalesce(v_policy->'weekdays', '[1,2,3,4,5,6,7]'::jsonb) @> to_jsonb(extract(isodow from v_local)::integer)
    and extract(hour from v_local) >= public.company_communication_number(_company_id, 'start_hour', 8, 0, 23)
    and extract(hour from v_local) < public.company_communication_number(_company_id, 'end_hour', 20, 1, 24);
end;
$$;

revoke all on function public.company_communication_number(uuid,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.company_contact_window_open(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.company_communication_number(uuid,text,integer,integer,integer) to service_role;
grant execute on function public.company_contact_window_open(uuid,timestamptz) to service_role;

-- Transform the canonical function, retaining every consent/recipient ledger check.
-- Refuse installation if the expected source has drifted rather than weakening it.
do $$
declare v_source text; v_before text;
begin
  v_source := pg_get_functiondef('public.process_automation_triggers()'::regprocedure);
  if position('weekly_contact_consent_is_current' in v_source) = 0
    or position('weekly_contact_current_recipient_key' in v_source) = 0
    or position('recipient_generation' in v_source) = 0 then
    raise exception 'communication_policy_requires_consent_ledger';
  end if;
  v_before := v_source;
  v_source := replace(v_source, 'select public.mark_payment_recovery_abandoned() into v_abandoned;',
    'if not pg_try_advisory_xact_lock(hashtextextended(''company_automation_trigger_scan'',0)) then return jsonb_build_object(''deferred'',true); end if; select public.mark_payment_recovery_abandoned() into v_abandoned;');
  v_source := replace(v_source, 'select f.id as flow_id,c.id as chat_id,c.remote_jid as recipient_candidate,',
    'select f.company_id,f.id as flow_id,c.id as chat_id,c.remote_jid as recipient_candidate,');
  v_source := replace(v_source,
    'where fs.flow_id=c.flow_id and fs.chat_id=c.chat_id and fs.status in (''active'',''waiting_response'') and fs.context->>''trigger_type''=''weekly_contact''',
    'where (fs.chat_id=c.chat_id or fs.context->>''student_id''=c.student_id::text) and fs.status in (''active'',''waiting_response'',''processing'') and fs.context->>''trigger_type''=''weekly_contact'' and exists(select 1 from public.automation_flows pending_flow where pending_flow.id=fs.flow_id and pending_flow.company_id=c.company_id)');
  v_source := replace(v_source,
    'left join public.flow_sessions fs on fs.flow_id=f.id and fs.chat_id=c.id and fs.context->>''trigger_type''=''weekly_contact''',
    'left join public.flow_sessions fs on fs.context->>''trigger_type''=''weekly_contact'' and (fs.context->>''student_id''=s.id::text or fs.chat_id=c.id) and exists(select 1 from public.automation_flows history_flow where history_flow.id=fs.flow_id and history_flow.company_id=f.company_id)');
  v_source := replace(v_source,
    'select c.flow_id,c.chat_id,c.start_node_id,''active'',jsonb_build_object(''trigger_type'',''weekly_contact''',
    'select distinct on(c.student_id) c.flow_id,c.chat_id,c.start_node_id,''active'',jsonb_build_object(''trigger_type'',''weekly_contact''');
  v_source := replace(v_source,
    'pending_flow.company_id=c.company_id)) returning 1',
    'pending_flow.company_id=c.company_id)) order by c.student_id,c.flow_id,c.chat_id returning 1');
  v_before := v_source;
  v_source := replace(v_source, 'count(fs.id) filter(where fs.created_at>now()-interval ''7 days'')<2',
    'count(fs.id) filter(where fs.created_at>now()-interval ''7 days'')<public.company_communication_number(f.company_id,''max_weekly_contacts'',2,1,2)');
  if v_source = v_before then raise exception 'communication_policy_weekly_count_source_drift'; end if;
  v_before := v_source;
  v_source := replace(v_source, 'now()-interval ''72 hours''',
    'now()-make_interval(hours => public.company_communication_number(f.company_id,''minimum_interval_hours'',72,72,168))');
  if v_source = v_before then raise exception 'communication_policy_weekly_interval_source_drift'; end if;
  v_source := replace(v_source, 'and f.trigger_type=''weekly_contact''',
    'and f.trigger_type=''weekly_contact'' and public.company_contact_window_open(f.company_id)');
  v_source := replace(v_source, 'current_date-7)',
    'current_date-public.company_communication_number(f.company_id,''no_workout_days'',7,7,90))');
  v_source := replace(v_source, '<now()-interval ''7 days''',
    '<now()-make_interval(days => public.company_communication_number(f.company_id,''no_workout_days'',7,7,90))');
  v_source := replace(v_source, '>now()-interval ''6 days''',
    '>now()-make_interval(days => public.company_communication_number(c.company_id,''no_workout_repeat_days'',6,6,90))');
  v_source := replace(v_source, 'select f.id as flow_id,c.id as chat_id,public.get_automation_start_node(f.id) as start_node_id,',
    'select f.company_id,f.id as flow_id,c.id as chat_id,public.get_automation_start_node(f.id) as start_node_id,');
  v_source := replace(v_source, '>now()-interval ''1 day''',
    '>now()-make_interval(hours => public.company_communication_number(c.company_id,''payment_repeat_hours'',24,24,720))');
  v_source := replace(v_source, 'select distinct on(f.id,c.id,s.id) f.id as flow_id,c.id as chat_id,',
    'select distinct on(f.id,c.id,s.id) f.company_id,f.id as flow_id,c.id as chat_id,');
  execute v_source;

  v_source := pg_get_functiondef('public.mark_payment_recovery_abandoned()'::regprocedure);
  v_source := replace(v_source, 'now() - interval ''2 hours''',
    'now() - make_interval(hours => public.company_communication_number(e.company_id,''cart_abandonment_hours'',2,2,720))');
  execute v_source;
end;
$$;

-- One durable receipt per company/user/local date. No client can create receipts.
create table public.company_push_reminder_receipts (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  created_at timestamptz not null default now(),
  primary key(company_id,user_id,local_date)
);
alter table public.company_push_reminder_receipts enable row level security;
revoke all on table public.company_push_reminder_receipts from public, anon, authenticated;
grant select,insert,delete on table public.company_push_reminder_receipts to service_role;

-- Reuse the installed authenticated command. Do not embed secrets or create a new origin.
do $$
declare v_command text;
begin
  if to_regclass('cron.job') is null then return; end if;
  select command into v_command from cron.job where jobname = 'push-daily-reminder' limit 1;
  if v_command is null then return; end if;
  perform cron.unschedule('push-daily-reminder');
  perform cron.schedule('push-daily-reminder', '*/15 * * * *', v_command);
end;
$$;

commit;
