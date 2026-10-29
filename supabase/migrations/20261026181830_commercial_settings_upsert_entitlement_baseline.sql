-- INSERT triggers also run on the INSERT side of INSERT ... ON CONFLICT UPDATE.
-- Compare against persisted settings first, so unrelated preserved sections do
-- not become new commercial mutations simply because the caller uses upsert.
create function commercial_private.guard_product_settings_feature_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare baseline jsonb; k text; feature text;
begin
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' then
    if new.company_id is distinct from old.company_id then raise exception 'Company mismatch' using errcode='42501'; end if;
    baseline:=old.settings;
  else
    select settings into baseline from public.company_product_settings where company_id=new.company_id;
    if not found then baseline:=public.company_product_settings_defaults(); end if;
  end if;
  for k,feature in select * from (values ('brand','hasAppearance'),('prescription','hasPrescription'),
    ('contact_policy','hasAutomation'),('messages','hasWhatsApp'),('business','hasRegistration')) t(k,f) loop
    if (new.settings->k) is distinct from (baseline->k) and
      not commercial_private.feature_allowed(new.company_id,feature) then
      raise exception 'Company feature unavailable: %',feature using errcode='42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function commercial_private.guard_product_settings_feature_write() from public,anon,authenticated;
drop trigger if exists commercial_shared_feature_write on public.company_product_settings;
create trigger commercial_shared_feature_write before insert or update or delete
  on public.company_product_settings for each row
  execute function commercial_private.guard_product_settings_feature_write();
