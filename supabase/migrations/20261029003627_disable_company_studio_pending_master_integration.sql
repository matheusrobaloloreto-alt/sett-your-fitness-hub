-- Quarantine the company Studio candidate. The canonical BN Studio remains in the
-- Master menu (bn_content_studio_* / bn-content-studio); no company ID is inferred.
-- Preserve all saved documents, history, assets and validators for later integration.
begin;

-- Replace bodies too: a stale or re-granted RPC cannot recover company access.
create or replace function public.get_company_content(_company_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 raise exception 'Company Studio disabled; use canonical BN Master Studio' using errcode='42501';
end $$;
create or replace function public.save_company_content(_company_id uuid,_document jsonb,_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 raise exception 'Company Studio disabled; use canonical BN Master Studio' using errcode='42501';
end $$;
revoke all on function public.get_company_content(uuid),public.save_company_content(uuid,jsonb,integer) from public,anon,authenticated;

-- Keep the wrapper signature for existing Storage policies, but deny every company
-- path, including for masters with company membership. Do not change the shared
-- content_private.company_admin helper: experience adoption also depends on it.
create or replace function public.company_content_image_access(_name text) returns boolean
language sql stable security definer set search_path='' as $$ select false $$;
revoke all on function public.company_content_image_access(text) from public,anon;
grant execute on function public.company_content_image_access(text) to authenticated;

-- Restrictive fences defeat unrelated permissive policies and accidental table grants.
-- Service-role/BYPASSRLS operational recovery remains privileged; no new grants.
revoke all on public.company_content_studios,public.company_content_history from public,anon,authenticated;
create policy company_studio_quarantined on public.company_content_studios
 as restrictive for all to public using(false) with check(false);
create policy company_studio_history_quarantined on public.company_content_history
 as restrictive for all to public using(false) with check(false);
create policy company_studio_media_quarantined on storage.objects
 as restrictive for all to public
 using(bucket_id<>'company-content-images') with check(bucket_id<>'company-content-images');
update storage.buckets set public=false where id='company-content-images';
commit;
