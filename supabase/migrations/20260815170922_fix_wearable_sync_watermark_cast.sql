-- The provider adapters send ISO-8601 watermark strings in JSON. PostgreSQL
-- validates the INSERT target types even when the object is empty, so the
-- previous text expression made every commit_wearable_sync call fail before it
-- could persist metrics or workouts. Patch the already-hardened function body
-- in place and fail closed if its expected definition is not present.
do $$
declare
  target_function regprocedure := 'public.commit_wearable_sync(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamptz)'::regprocedure;
  current_definition text;
  patched_definition text;
  old_fragment constant text := 'select v_device.id, item.key, item.value, p_completed_at, now()';
  new_fragment constant text := 'select v_device.id, item.key, nullif(item.value, '''')::timestamptz, p_completed_at, now()';
begin
  select pg_get_functiondef(target_function)
  into current_definition;

  if current_definition is null or position(old_fragment in current_definition) = 0 then
    raise exception 'commit_wearable_sync watermark source changed; refusing an unverified patch';
  end if;

  patched_definition := replace(current_definition, old_fragment, new_fragment);
  if patched_definition = current_definition then
    raise exception 'commit_wearable_sync watermark patch was not applied';
  end if;

  execute patched_definition;
end;
$$;

revoke all on function public.commit_wearable_sync(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;

grant execute on function public.commit_wearable_sync(
  uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, jsonb, timestamptz
) to service_role;
