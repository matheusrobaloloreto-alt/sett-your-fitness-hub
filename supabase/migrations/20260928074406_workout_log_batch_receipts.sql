-- Do not reuse a revision after deleting and recreating a set (legacy clients
-- send revisions, not row IDs). Keep existing revisions untouched at rollout.
set lock_timeout = '5s';
set statement_timeout = '30s';
lock table public.workout_logs in share row exclusive mode;
create sequence public.workout_log_revision_seq as bigint
  minvalue 1 maxvalue 9007199254740991;
select setval('public.workout_log_revision_seq',
  greatest(coalesce((select max(revision) from public.workout_logs), 0) + 1, 1), false);
revoke all on sequence public.workout_log_revision_seq from public, anon, authenticated, service_role;

create or replace function public.touch_workout_log_revision()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  new.revision := nextval('public.workout_log_revision_seq'::regclass);
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_workout_log_revision() from public, anon, authenticated, service_role;
drop trigger touch_workout_log_revision on public.workout_logs;
create trigger touch_workout_log_revision before insert or update on public.workout_logs
for each row execute function public.touch_workout_log_revision();

-- A receipt commits in the same transaction as its deletions/replacements.
-- It is private operational state, never accessible through a client table API.
create table public.workout_log_batch_receipts (
  request_hash text primary key,
  request_body jsonb not null,
  response_body jsonb not null,
  post_state jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.workout_log_batch_receipts enable row level security;
revoke all on table public.workout_log_batch_receipts from public, anon, authenticated, service_role;

-- Preserve the reviewed fractional-RPE/CAS implementation as a private core.
alter function public.save_workout_logs_if_current(jsonb)
  rename to save_workout_logs_if_current_core;
revoke all on function public.save_workout_logs_if_current_core(jsonb)
  from public, anon, authenticated, service_role;

create function public.save_workout_logs_if_current(_rows jsonb)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  normalized jsonb := '[]'::jsonb;
  student_id_value uuid;
  workout_id_value uuid;
  exercise_index_value integer;
  set_number_value integer;
  session_date_value date;
  caller_id uuid := auth.uid();
  caller_role text := coalesce(auth.role(), '');
  owner_id uuid;
  company_id_value uuid;
  workout_to_lock uuid;
  fingerprint text;
  receipt public.workout_log_batch_receipts%rowtype;
  actual_state jsonb;
  result jsonb;
  current_log public.workout_logs%rowtype;
  conflicts jsonb := '[]'::jsonb;
begin
  if _rows is null or jsonb_typeof(_rows) <> 'array' then
    raise exception '_rows must be a JSON array';
  end if;
  if jsonb_array_length(_rows) > 200 then
    raise exception '_rows exceeds the 200 item limit';
  end if;
  if octet_length(_rows::text) > 262144 then
    raise exception '_rows exceeds the request size limit';
  end if;
  if caller_role <> 'service_role' and caller_id is null then
    raise exception 'actor cannot write workout logs for this student tenant';
  end if;

  -- Authorization is repeated BEFORE reading a receipt: an old successful
  -- response must never bypass a revoked assignment or student identity.
  for item in select value from jsonb_array_elements(_rows)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'each workout log must be a JSON object';
    end if;
    if item ? 'deleted' and jsonb_typeof(item->'deleted') <> 'boolean' then
      raise exception 'deleted must be a boolean';
    end if;
    if coalesce(item->>'session_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid workout log identity in batch';
    end if;
    begin
      student_id_value := (item->>'student_id')::uuid;
      workout_id_value := (item->>'workout_id')::uuid;
      exercise_index_value := (item->>'exercise_index')::integer;
      set_number_value := (item->>'set_number')::integer;
      session_date_value := (item->>'session_date')::date;
    exception when invalid_text_representation or numeric_value_out_of_range
      or datetime_field_overflow or invalid_datetime_format then
      raise exception 'invalid workout log identity in batch';
    end;
    if student_id_value is null or workout_id_value is null
      or exercise_index_value is null or exercise_index_value < 0
      or set_number_value is null or set_number_value < 1
      or session_date_value is null then
      raise exception 'invalid workout log identity in batch';
    end if;
    select s.user_id, s.company_id into owner_id, company_id_value
    from public.workouts w join public.training_cycles tc on tc.id=w.cycle_id
      join public.students s on s.id=student_id_value
    where w.id=workout_id_value and tc.student_id=s.id
      and tc.company_id=s.company_id and w.company_id=s.company_id;
    if not found then raise exception 'workout does not belong to student tenant'; end if;
    if caller_role <> 'service_role' and owner_id is distinct from caller_id
      and not public.is_company_staff(caller_id, company_id_value) then
      raise exception 'actor cannot write workout logs for this student tenant';
    end if;
    normalized := normalized || jsonb_build_array(item || jsonb_build_object(
      'student_id',student_id_value::text,'workout_id',workout_id_value::text,
      'exercise_index',exercise_index_value,'set_number',set_number_value,
      'session_date',to_char(session_date_value,'YYYY-MM-DD')));
  end loop;

  -- All RPC batches acquire workout locks in the same order, including batches
  -- without deletions. The private core can safely reacquire these row locks.
  for workout_to_lock in select distinct (row_value->>'workout_id')::uuid
    from jsonb_array_elements(normalized) row_value order by 1
  loop
    perform 1 from public.workouts where id=workout_to_lock for update;
  end loop;
  if not exists(select 1 from jsonb_array_elements(normalized) row_value
    where coalesce((row_value->>'deleted')::boolean,false)) then
    return public.save_workout_logs_if_current_core(normalized);
  end if;
  select jsonb_agg(row_value order by row_value->>'student_id',
    row_value->>'workout_id', (row_value->>'exercise_index')::integer,
    (row_value->>'set_number')::integer, row_value->>'session_date',
    coalesce((row_value->>'deleted')::boolean,false) desc)
  into normalized from jsonb_array_elements(normalized) row_value;
  fingerprint := md5(normalized::text);
  select * into receipt from public.workout_log_batch_receipts
    where request_hash=fingerprint and request_body=normalized;

  select jsonb_agg(jsonb_build_object('identity',identity_row,
      'row',(select to_jsonb(l) from public.workout_logs l
        where l.student_id=(identity_row->>'student_id')::uuid
          and l.workout_id=(identity_row->>'workout_id')::uuid
          and l.exercise_index=(identity_row->>'exercise_index')::integer
          and l.set_number=(identity_row->>'set_number')::integer
          and l.session_date=(identity_row->>'session_date')::date))
      order by identity_row::text)
  into actual_state from (
    select distinct jsonb_build_object('student_id',row_value->'student_id',
      'workout_id',row_value->'workout_id','exercise_index',row_value->'exercise_index',
      'set_number',row_value->'set_number','session_date',row_value->'session_date') as identity_row
    from jsonb_array_elements(normalized) row_value
  ) identities;

  if receipt.request_hash is not null then
    if receipt.post_state=actual_state then return receipt.response_body; end if;
    -- The batch committed, but another edit happened afterwards. Return the
    -- current state as a conflict; never replay mutations or a stale snapshot.
    for item in select value from jsonb_array_elements(normalized)
    loop
      select * into current_log from public.workout_logs
      where student_id=(item->>'student_id')::uuid and workout_id=(item->>'workout_id')::uuid
        and exercise_index=(item->>'exercise_index')::integer
        and set_number=(item->>'set_number')::integer
        and session_date=(item->>'session_date')::date;
      if found then result := to_jsonb(current_log);
      else result := item || jsonb_build_object('server_missing',true); end if;
      if coalesce((item->>'deleted')::boolean,false) then
        result := result || jsonb_build_object('requested_deleted',true);
      end if;
      conflicts := conflicts || jsonb_build_array(result);
    end loop;
    return jsonb_build_object('saved','[]'::jsonb,'conflicts',conflicts);
  end if;

  result := public.save_workout_logs_if_current_core(normalized);
  if jsonb_array_length(result->'conflicts') > 0 then return result; end if;

  select jsonb_agg(jsonb_build_object('identity',identity_row,
      'row',(select to_jsonb(l) from public.workout_logs l
        where l.student_id=(identity_row->>'student_id')::uuid
          and l.workout_id=(identity_row->>'workout_id')::uuid
          and l.exercise_index=(identity_row->>'exercise_index')::integer
          and l.set_number=(identity_row->>'set_number')::integer
          and l.session_date=(identity_row->>'session_date')::date))
      order by identity_row::text)
  into actual_state from (
    select distinct jsonb_build_object('student_id',row_value->'student_id',
      'workout_id',row_value->'workout_id','exercise_index',row_value->'exercise_index',
      'set_number',row_value->'set_number','session_date',row_value->'session_date') as identity_row
    from jsonb_array_elements(normalized) row_value
  ) identities;

  -- Full JSON equality above, not just MD5, prevents collision-based ACKs.
  -- A collision must not replace another request's durable receipt.
  insert into public.workout_log_batch_receipts(request_hash,request_body,response_body,post_state)
    values(fingerprint,normalized,result,actual_state) on conflict(request_hash) do nothing;
  return result;
end;
$$;
revoke all on function public.save_workout_logs_if_current(jsonb) from public, anon;
grant execute on function public.save_workout_logs_if_current(jsonb) to authenticated, service_role;
