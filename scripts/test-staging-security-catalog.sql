\set ON_ERROR_STOP on

do $$
declare
  issue_count integer;
  actual_security_definer_browser_functions text[];
  expected_security_definer_browser_functions constant text[] := array[
    'award_xp',
    'check_and_unlock_achievements',
    'get_active_platform_ads',
    'get_company_ai_identity',
    'get_effective_exercise_targets',
    'get_monthly_leaderboard',
    'get_student_rank',
    'get_user_company_id',
    'get_user_role',
    'has_role',
    'is_company_staff',
    'is_student_company_staff',
    'mark_training_cycle_viewed',
    'move_student_to_assessment_stage',
    'recalculate_training_cycles',
    'replace_exercise_muscle_targets',
    'reschedule_training_cycles_from',
    'save_workout_logs_if_current',
    'sync_prescription_cycles'
  ]::text[];
begin
  select count(*) into issue_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;
  if issue_count <> 0 then
    raise exception '% public tables do not have RLS enabled', issue_count;
  end if;

  select count(*) into issue_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class c on c.oid = policy.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and 0::oid = any(policy.polroles);
  if issue_count <> 0 then
    raise exception '% public policies still grant the PUBLIC role', issue_count;
  end if;

  select count(*) into issue_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class c on c.oid = policy.polrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        ilike '%get_user_company_id%'
      or coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')
        ilike '%get_user_company_id%'
    );
  if issue_count <> 0 then
    raise exception '% policies still use first-membership company semantics', issue_count;
  end if;

  select count(*) into issue_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true'];
  if issue_count <> 0 then
    raise exception '% public views are missing security_invoker', issue_count;
  end if;

  select count(*) into issue_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1
      from unnest(coalesce(p.proconfig, '{}'::text[])) setting
      where setting like 'search_path=%'
    );
  if issue_count <> 0 then
    raise exception '% SECURITY DEFINER functions lack an explicit search_path', issue_count;
  end if;

  select coalesce(array_agg(distinct p.proname order by p.proname), '{}'::text[])
  into actual_security_definer_browser_functions
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );
  if actual_security_definer_browser_functions
      is distinct from expected_security_definer_browser_functions then
    raise exception 'SECURITY DEFINER browser allowlist changed: %',
      actual_security_definer_browser_functions;
  end if;

  select count(*) into issue_count
  from information_schema.role_table_grants grant_row
  where grant_row.table_schema = 'public'
    and grant_row.grantee = 'anon'
    and not (
      grant_row.table_name = 'platform_settings'
      and grant_row.privilege_type = 'SELECT'
    );
  if issue_count <> 0 then
    raise exception '% unexpected anonymous public-table grants exist', issue_count;
  end if;

  if not pg_catalog.has_table_privilege('anon', 'public.platform_settings', 'SELECT') then
    raise exception 'the intentional anonymous platform_settings read is missing';
  end if;

  select count(*) into issue_count
  from information_schema.role_table_grants grant_row
  join pg_catalog.pg_class c on c.relname = grant_row.table_name
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace and n.nspname = grant_row.table_schema
  where grant_row.table_schema = 'public'
    and grant_row.grantee = 'authenticated'
    and c.relkind in ('r', 'p')
    and (
      not c.relrowsecurity
      or not exists (
        select 1
        from pg_catalog.pg_policy policy
        where policy.polrelid = c.oid
          and 'authenticated'::pg_catalog.regrole::oid = any(policy.polroles)
          and policy.polcmd in (
            '*',
            case grant_row.privilege_type
              when 'SELECT' then 'r'
              when 'INSERT' then 'a'
              when 'UPDATE' then 'w'
              when 'DELETE' then 'd'
              else '!'
            end
          )
      )
    );
  if issue_count <> 0 then
    raise exception '% authenticated Data API grants are not backed by matching RLS policies',
      issue_count;
  end if;

  select count(*) into issue_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not (
      pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT')
      and pg_catalog.has_table_privilege('service_role', c.oid, 'INSERT')
      and pg_catalog.has_table_privilege('service_role', c.oid, 'UPDATE')
      and pg_catalog.has_table_privilege('service_role', c.oid, 'DELETE')
    );
  if issue_count <> 0 then
    raise exception '% public tables are missing complete service-role DML access', issue_count;
  end if;
end;
$$;

\echo 'Security catalog PASS: RLS, policies, views, grants, Data API, SECURITY DEFINER allowlist, and service role'
