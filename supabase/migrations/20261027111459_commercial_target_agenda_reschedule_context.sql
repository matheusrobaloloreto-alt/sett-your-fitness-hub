-- Narrow Agenda-only exception for the actual two-phase rescheduling RPC.
-- No GUC is trusted: authorization rows can only be written by the trusted
-- routine owner, after the original RPC's auth/validation/row locks. These rows
-- describe exact permitted before -> pending -> final transitions, not an
-- enrollment-wide permission to publish arbitrary cycles or rewrite history.
begin;

create table commercial_private.agenda_reschedule_authorizations (
  transaction_id bigint not null,
  backend_pid integer not null,
  actor_id uuid not null,
  enrollment_id uuid not null,
  cycle_id uuid not null,
  before_row jsonb not null,
  pending_row jsonb not null,
  final_row jsonb not null,
  primary key (transaction_id, backend_pid, cycle_id)
);
alter table commercial_private.agenda_reschedule_authorizations enable row level security;
revoke all on commercial_private.agenda_reschedule_authorizations from public,anon,authenticated,service_role;

create function commercial_private.agenda_reschedule_write_allowed(old_row jsonb,new_row jsonb)
returns boolean language sql volatile security definer set search_path='' as $check$
  select exists (
    select 1 from commercial_private.agenda_reschedule_authorizations c
    where c.transaction_id=txid_current() and c.backend_pid=pg_backend_pid()
      and c.actor_id=auth.uid()
      and c.cycle_id=(old_row->>'id')::uuid
      and c.enrollment_id=(old_row->>'enrollment_id')::uuid
      and (
        (c.before_row is distinct from c.pending_row
          and c.before_row=(old_row-'updated_at') and c.pending_row=(new_row-'updated_at'))
        or (c.pending_row=(old_row-'updated_at') and c.final_row=(new_row-'updated_at'))
      )
  );
$check$;
revoke all on function commercial_private.agenda_reschedule_write_allowed(jsonb,jsonb) from public,anon,authenticated,service_role;

do $install$
declare
  routine_oid oid;
  routine_owner name;
  routine_language name;
  routine_definer boolean;
  original_source text;
  patched_source text;
  original_definition text;
  before_anchor text := E'  update public.training_cycles cycle\n     set status = ''pending''';
  after_anchor text := E'  delete from private.training_cycle_rebase_authorizations authz\n   where authz.transaction_id = txid_current()\n     and authz.enrollment_id = p_enrollment_id;';
  insertion text := $context$
  -- commercial-target-agenda-context-v1: only after original auth/validation/locks
  if commercial_private.feature_allowed(v_company_id,'hasAgenda')
     and not commercial_private.feature_allowed(v_company_id,'hasPrescription') then
    insert into commercial_private.agenda_reschedule_authorizations
      (transaction_id,backend_pid,actor_id,enrollment_id,cycle_id,before_row,pending_row,final_row)
    select txid_current(),pg_backend_pid(),auth.uid(),p_enrollment_id,cycle.id,
      to_jsonb(cycle)-'updated_at',
      (to_jsonb(cycle)-'updated_at') || jsonb_build_object('status',case when cycle.status='active' then 'pending' else cycle.status end),
      (to_jsonb(cycle)-'updated_at') || jsonb_build_object(
        'start_date',cycle.start_date+v_shift_days,'end_date',cycle.end_date+v_shift_days,
        'status',case when cycle.end_date+v_shift_days < public.current_business_date() then 'completed'
          when public.current_business_date() between cycle.start_date+v_shift_days and cycle.end_date+v_shift_days then 'active'
          else 'pending' end)
    from public.training_cycles cycle
    where cycle.enrollment_id=p_enrollment_id and cycle.start_date>=v_current_start
      and cycle.status<>'superseded' and cycle.superseded_by_cycle_id is null;
  end if;

$context$;
  cleanup text := $cleanup$
  delete from commercial_private.agenda_reschedule_authorizations c
    where c.transaction_id=txid_current() and c.backend_pid=pg_backend_pid()
      and c.actor_id=auth.uid() and c.enrollment_id=p_enrollment_id;
$cleanup$;
  shared_anchor text := E'  if not allowed or (previous is not null and previous is distinct from target and';
  shared_addition text := $shared$
  -- commercial-target-agenda-context-v1: exact owner-authorized RPC transitions
  if not allowed and tg_table_name='training_cycles' and tg_op='UPDATE'
    and commercial_private.feature_allowed(target,'hasAgenda')
    and commercial_private.agenda_reschedule_write_allowed(old_value,row_value) then
    allowed:=true;
  end if;
$shared$;
  entry record;
begin
  routine_oid:=to_regprocedure('commercial_private.reschedule_training_cycles_from(uuid,uuid,date)');
  if routine_oid is not null then
    select p.prosrc,r.rolname,l.lanname,p.prosecdef
      into original_source,routine_owner,routine_language,routine_definer from pg_proc p
      join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang where p.oid=routine_oid;
    if routine_owner<>'postgres' or routine_language<>'plpgsql' or not routine_definer then
      raise exception 'Unsupported reschedule owner/security contract';
    end if;
    if position('-- commercial-target-original-oid-v1:reschedule_training_cycles_from' in original_source)=0 then
      raise exception 'Install commercial original OID guard before Agenda context';
    end if;
    if (length(original_source)-length(replace(original_source,before_anchor,'')))<>length(before_anchor)
      or (length(original_source)-length(replace(original_source,after_anchor,'')))<>length(after_anchor) then
      raise exception 'Unsupported actual reschedule body; Agenda context not installed';
    end if;
    -- Preserve the original trusted owner without exposing the context to apps.
    execute format('alter table commercial_private.agenda_reschedule_authorizations owner to %I',routine_owner);
    original_definition:=pg_get_functiondef(routine_oid);
    patched_source:=replace(original_source,before_anchor,insertion||before_anchor);
    patched_source:=replace(patched_source,after_anchor,after_anchor||cleanup);
    execute replace(original_definition,original_source,patched_source);
  else
    raise notice 'Optional reschedule RPC absent; no context issuer installed';
  end if;

  routine_oid:='commercial_private.guard_shared_feature_mutation()'::regprocedure;
  select p.prosrc,r.rolname,l.lanname,p.prosecdef
    into original_source,routine_owner,routine_language,routine_definer from pg_proc p
    join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang where p.oid=routine_oid;
  if routine_owner<>'postgres' or routine_language<>'plpgsql' or not routine_definer then
    raise exception 'Unsupported shared guard owner/security contract';
  end if;
  alter table commercial_private.agenda_reschedule_authorizations owner to postgres;
  alter function commercial_private.agenda_reschedule_write_allowed(jsonb,jsonb) owner to postgres;
  if (length(original_source)-length(replace(original_source,shared_anchor,'')))<>length(shared_anchor) then
    raise exception 'Unsupported shared write guard; Agenda context not installed';
  end if;
  original_definition:=pg_get_functiondef(routine_oid);
  patched_source:=replace(original_source,shared_anchor,shared_addition||shared_anchor);
  execute replace(original_definition,original_source,patched_source);

  -- Defend against default privileges for nonstandard app roles as well.
  for entry in select distinct r.rolname from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    join pg_roles r on r.oid=a.grantee
    where c.oid='commercial_private.agenda_reschedule_authorizations'::regclass and a.grantee<>c.relowner
  loop
    execute format('revoke all on commercial_private.agenda_reschedule_authorizations from %I',entry.rolname);
  end loop;
  for entry in select distinct r.rolname from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    join pg_roles r on r.oid=a.grantee
    where p.oid='commercial_private.agenda_reschedule_write_allowed(jsonb,jsonb)'::regprocedure and a.grantee<>p.proowner
  loop
    execute format('revoke all on function commercial_private.agenda_reschedule_write_allowed(jsonb,jsonb) from %I',entry.rolname);
  end loop;
end $install$;

commit;
