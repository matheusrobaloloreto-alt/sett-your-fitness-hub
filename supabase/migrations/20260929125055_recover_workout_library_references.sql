-- Additive only: no backfill, policy widening, global publication or plan writes.
-- Use current staff-scoped INSERT/SELECT RLS, with an additional explicit guard.
create or replace function public.ensure_workout_library_references(
  p_company_id uuid,
  p_exercises jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_field text;
  v_name text;
  v_group text;
  v_name_key text;
  v_id uuid;
  v_candidates uuid[];
  v_index integer := 0;
  v_created integer := 0;
  v_mappings jsonb := '[]'::jsonb;
  v_allowed_categories text[] := array['core', 'mobilidades', 'funcionais', 'base', 'pesos_livre', 'peso_corporal', 'maquinas', 'pliometria'];
begin
  if v_actor is null or p_company_id is null
     or not public.is_company_staff(v_actor, p_company_id)
     or not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'workout_library_recovery_forbidden' using errcode = '42501';
  end if;
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array'
     or jsonb_array_length(p_exercises) < 1 or jsonb_array_length(p_exercises) > 500
     or octet_length(p_exercises::text) > 524288 then
    raise exception 'workout_library_recovery_invalid_payload' using errcode = '22023';
  end if;

  -- Validate the entire batch before any insert. Prescription data is not accepted.
  for v_item in select value from jsonb_array_elements(p_exercises) loop
    if jsonb_typeof(v_item) <> 'object' or exists (
      select 1 from jsonb_object_keys(v_item) k
      where k not in ('name', 'muscle_group', 'equipment', 'category', 'categories')
    ) then
      raise exception 'workout_library_recovery_invalid_payload' using errcode = '22023';
    end if;
    foreach v_field in array array['name', 'muscle_group', 'equipment', 'category'] loop
      if v_item ? v_field and jsonb_typeof(v_item->v_field) not in ('string', 'null') then
        raise exception 'workout_library_recovery_invalid_text' using errcode = '22023';
      end if;
      if length(v_item->>v_field) > 240 then
        raise exception 'workout_library_recovery_invalid_text' using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(v_item->'name') is distinct from 'string'
       or public.exercise_taxonomy_key(v_item->>'name') = '' then
      raise exception 'workout_library_recovery_missing_name' using errcode = '22023';
    end if;
    if nullif(v_item->>'category', '') is not null
       and not (v_item->>'category' = any(v_allowed_categories)) then
      raise exception 'workout_library_recovery_invalid_category' using errcode = '22023';
    end if;
    if v_item ? 'categories' and v_item->'categories' <> 'null'::jsonb then
      if jsonb_typeof(v_item->'categories') <> 'array' then
        raise exception 'workout_library_recovery_invalid_category' using errcode = '22023';
      end if;
      if jsonb_array_length(v_item->'categories') > 8 or exists (
        select 1 from jsonb_array_elements(v_item->'categories') c
        where jsonb_typeof(c) <> 'string' or not (c #>> '{}' = any(v_allowed_categories))
      ) then
        raise exception 'workout_library_recovery_invalid_category' using errcode = '22023';
      end if;
    end if;
  end loop;

  -- One lock per company avoids reverse-batch deadlocks. Under READ COMMITTED,
  -- each lookup after acquiring it observes an earlier concurrent RPC's commit.
  perform pg_advisory_xact_lock(hashtextextended('workout-library-recovery:' || p_company_id::text, 0));
  for v_item in select value from jsonb_array_elements(p_exercises) loop
    v_name := btrim(v_item->>'name');
    v_group := nullif(btrim(v_item->>'muscle_group'), '');
    v_name_key := public.exercise_taxonomy_key(v_name);
    select array_agg(e.id order by e.id) into v_candidates
    from public.exercise_library e
    where (e.company_id = p_company_id or e.is_global = true)
      and public.exercise_taxonomy_key(e.name) = v_name_key;
    if coalesce(cardinality(v_candidates), 0) > 1 then
      select array_agg(e.id order by e.id) into v_candidates
      from public.exercise_library e
      where (e.company_id = p_company_id or e.is_global = true)
        and public.exercise_taxonomy_key(e.name) = v_name_key
        and v_group is not null
        and public.exercise_taxonomy_key(e.muscle_group) = public.exercise_taxonomy_key(v_group);
      if coalesce(cardinality(v_candidates), 0) <> 1 then
        raise exception 'workout_library_recovery_ambiguous' using errcode = '23514';
      end if;
    end if;
    v_id := v_candidates[1];
    if v_id is null then
      insert into public.exercise_library (
        company_id, name, muscle_group, equipment, category, categories, is_global, created_by
      ) values (
        p_company_id, v_name, v_group, nullif(btrim(v_item->>'equipment'), ''),
        nullif(v_item->>'category', ''),
        array(select jsonb_array_elements_text(case when jsonb_typeof(v_item->'categories') = 'array' then v_item->'categories' else '[]'::jsonb end)),
        false, v_actor
      ) returning id into v_id;
      v_created := v_created + 1;
    end if;
    v_mappings := v_mappings || jsonb_build_array(jsonb_build_object('input_index', v_index, 'exercise_id', v_id));
    v_index := v_index + 1;
  end loop;
  return jsonb_build_object('ok', true, 'company_id', p_company_id, 'actor_id', v_actor,
    'created_count', v_created, 'mappings', v_mappings);
end;
$$;

revoke all on function public.ensure_workout_library_references(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ensure_workout_library_references(uuid, jsonb) to authenticated;
comment on function public.ensure_workout_library_references(uuid, jsonb) is
  'Staff-only company-local recovery from named draft metadata; visible exact matches first, serialized retries, no global or prescription writes.';
