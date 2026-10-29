-- Capability gates intersect the existing Storage tenant/role policies. They
-- deliberately add no permissive grants and do not hide public branding assets.
create function public.commercial_storage_allowed(_bucket text, _name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  parts text[];
  company uuid;
  master boolean;
begin
  if _bucket not in ('platform-assets','whatsapp-media') then return true; end if;
  if auth.uid() is null or _name is null or _name = '' then return false; end if;
  parts := string_to_array(_name,'/');
  -- Do not authorize ambiguous prefixes interpreted differently by URL clients.
  if _name ~ '[\\\\]' or exists(
    select 1 from unnest(parts) p where p in ('','.','..')
  ) then return false; end if;
  master := public.has_role(auth.uid(),'master'::public.app_role);
  if cardinality(parts)=1 then
    -- Existing Master-only global logo uploads have no company prefix.
    return _bucket='platform-assets' and master;
  end if;
  company := public.try_uuid(parts[1]);
  if company is null or not exists(select 1 from public.companies where id=company)
    or not (master or public.is_company_staff(auth.uid(),company)) then return false; end if;
  if _bucket='whatsapp-media' then
    return public.company_feature_allowed(company,'hasWhatsApp');
  end if;
  -- Mural authoring is separately authorized; it is not a branding subscription.
  if cardinality(parts)>=3 and parts[2]='announcements' then return true; end if;
  return public.company_feature_allowed(company,'hasAppearance');
end $$;
revoke all on function public.commercial_storage_allowed(text,text) from public,anon;
grant execute on function public.commercial_storage_allowed(text,text) to authenticated;

create policy commercial_storage_insert on storage.objects as restrictive
for insert to authenticated with check(public.commercial_storage_allowed(bucket_id,name));
create policy commercial_storage_update on storage.objects as restrictive
for update to authenticated
using(public.commercial_storage_allowed(bucket_id,name))
with check(public.commercial_storage_allowed(bucket_id,name));
create policy commercial_whatsapp_storage_read on storage.objects as restrictive
for select to authenticated
using(bucket_id<>'whatsapp-media' or public.commercial_storage_allowed(bucket_id,name));
-- DELETE retains existing authorization for cleanup/revocation. Trusted service
-- ingestion also retains its existing bypass; outbound sends are gated separately.
