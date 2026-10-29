-- Forward-only companion to 20261026174537. Renaming/moving a routine keeps its
-- OID: an already parsed SQL-standard SECURITY DEFINER caller can still execute
-- that original routine with the trusted owner's privileges after ACL revocation.
-- Guard entry to the original body as well as the public wrapper. The original
-- body remains a nested block, preserving its authorization, locks and results.
-- No clinical table policy, shared helper, public RPC grant or business rule changes.
do $install$
declare
  target record;
  routine_oid oid;
  routine record;
  original_definition text;
  guarded_source text;
  marker text;
  nested_terminator text;
  wrapper_oid oid;
  wrapper_definition text;
  wrapper_header text;
  original_header text;
  grantee record;
begin
  for target in select * from (values
    ('get_company_dashboard_snapshot', 'uuid', array['_company_id'],
      $guard$public.company_feature_allowed(_company_id,'hasDashboard')$guard$),
    ('reassign_student_trainer', 'uuid,uuid,uuid', array['_student_id','_trainer_id','_expected_trainer_id'],
      $guard$(public.company_feature_allowed((select s.company_id from public.students s where s.id=_student_id),'hasStudents')
        or public.company_feature_allowed((select s.company_id from public.students s where s.id=_student_id),'hasTeam')
        or public.company_feature_allowed((select s.company_id from public.students s where s.id=_student_id),'hasPrescription'))$guard$),
    ('set_registration_lead_stage', 'uuid,text,uuid,text,text', array['_company_id','_entity_type','_record_id','_expected_stage','_target_stage'],
      $guard$public.company_feature_allowed(_company_id,'hasRegistration')$guard$),
    ('reschedule_training_cycles_from', 'uuid,uuid,date', array['p_enrollment_id','p_cycle_id','p_new_start_date'],
      $guard$(public.company_feature_allowed((select e.company_id from public.enrollments e where e.id=p_enrollment_id),'hasAgenda')
        or public.company_feature_allowed((select e.company_id from public.enrollments e where e.id=p_enrollment_id),'hasPrescription'))$guard$)
  ) as t(name, signature, argument_names, allowed_expression)
  loop
    routine_oid := to_regprocedure(format('commercial_private.%I(%s)', target.name, target.signature));
    if routine_oid is null then
      if to_regprocedure(format('public.%I(%s)',target.name,target.signature)) is not null then
        raise exception 'Expected relocated commercial original: %', target.name;
      end if;
      raise notice 'Optional commercial original absent: %', target.name;
      continue;
    end if;
    select p.*, l.lanname into routine from pg_proc p
      join pg_language l on l.oid=p.prolang where p.oid=routine_oid;
    -- Known live contracts are PL/pgSQL. Fail atomically on schema drift rather
    -- than install a different signature or silently leave an unguarded body.
    if routine.lanname <> 'plpgsql' or routine.prokind <> 'f'
      or routine.proargnames[1:cardinality(target.argument_names)] is distinct from target.argument_names then
      raise exception 'Unsupported commercial original contract: %', target.name;
    end if;
    marker := '-- commercial-target-original-oid-v1:' || target.name;
    if position(marker in routine.prosrc)=0 then
      original_definition := pg_get_functiondef(routine_oid);
      if routine.prosrc='' or
        (length(original_definition)-length(replace(original_definition,routine.prosrc,''))) <> length(routine.prosrc) then
        raise exception 'Cannot uniquely locate commercial original body: %', target.name;
      end if;
      -- PL/pgSQL accepts an omitted terminator on the top-level END, but a
      -- nested block requires it. Preserve captured source and append only the
      -- missing terminator; never emit an empty PL/pgSQL statement after END;.
      if routine.prosrc ~ ';[[:space:]]*$' then
        nested_terminator:='';
      elsif routine.prosrc ~* '\mend[[:space:]]*$' then
        nested_terminator:=E'\n;';
      else
        raise exception 'Unsupported commercial block terminator: %',target.name;
      end if;
      guarded_source := E'\nBEGIN\n  ' || marker || E'\n  IF NOT coalesce((' || target.allowed_expression || E'), false) THEN\n'
        || E'    RAISE EXCEPTION ''Company feature unavailable'' USING ERRCODE=''42501'';\n  END IF;\n'
        || routine.prosrc || nested_terminator || E'\nEND;\n';
      -- pg_get_functiondef preserves defaults, RETURNS TABLE/SETOF, volatility,
      -- SECURITY DEFINER/INVOKER, strictness, cost, rows, parallelism and all GUCs.
      -- CREATE OR REPLACE also preserves OID, owner, comments and dependencies.
      execute replace(original_definition,routine.prosrc,guarded_source);
    end if;
    -- The frozen wrappers used explicit signatures and could lose original
    -- optional defaults. Copy only the argument declaration from the original;
    -- retain the wrapper's guard/body/properties and its existing ACL/owner/OID.
    wrapper_oid := to_regprocedure(format('public.%I(%s)',target.name,target.signature));
    if wrapper_oid is null or
      pg_get_function_identity_arguments(wrapper_oid) is distinct from pg_get_function_identity_arguments(routine_oid)
      or pg_get_function_result(wrapper_oid) is distinct from pg_get_function_result(routine_oid) then
      raise exception 'Unsupported commercial wrapper contract: %', target.name;
    end if;
    if pg_get_function_arguments(wrapper_oid) is distinct from pg_get_function_arguments(routine_oid) then
      wrapper_definition := pg_get_functiondef(wrapper_oid);
      wrapper_header := format('CREATE OR REPLACE FUNCTION public.%I(%s)',target.name,pg_get_function_arguments(wrapper_oid));
      original_header := format('CREATE OR REPLACE FUNCTION public.%I(%s)',target.name,pg_get_function_arguments(routine_oid));
      if left(wrapper_definition,length(wrapper_header)) <> wrapper_header then
        raise exception 'Cannot locate commercial wrapper declaration: %', target.name;
      end if;
      execute original_header || substr(wrapper_definition,length(wrapper_header)+1);
    end if;
    -- The public wrappers retain the frozen grants. Private originals must not
    -- retain custom or inherited direct entry points left by the initial move.
    execute format('revoke all on function commercial_private.%I(%s) from public',target.name,target.signature);
    for grantee in
      select distinct r.rolname from pg_proc p
        cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        join pg_roles r on r.oid=a.grantee
        where p.oid=routine_oid and a.grantee<>p.proowner
    loop
      execute format('revoke all on function commercial_private.%I(%s) from %I',target.name,target.signature,grantee.rolname);
    end loop;
  end loop;
end $install$;
