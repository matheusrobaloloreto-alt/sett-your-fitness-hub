-- Root created this forward migration via CLI. Apply only in the root-owned serial runtime.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('company-content-images','company-content-images',false,5242880,array['image/png','image/jpeg']);

-- Public wrapper is needed by storage RLS; private helper retains the real membership,
-- admin/master, active-company and hasAppearance gates (including for Master).
create function public.company_content_image_access(_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if _name is null or _name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(slides|logos)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$' then return false; end if;
 return content_private.company_admin(split_part(_name,'/',1)::uuid);
end $$;
revoke all on function public.company_content_image_access(text) from public,anon,authenticated;
grant execute on function public.company_content_image_access(text) to authenticated;

create policy company_content_images_read on storage.objects for select to authenticated
using(bucket_id='company-content-images' and public.company_content_image_access(name));
create policy company_content_images_insert on storage.objects for insert to authenticated
with check(bucket_id='company-content-images' and owner_id=auth.uid()::text and public.company_content_image_access(name));
-- Restrictive fences also protect against any pre-existing broad permissive policies.
create policy company_content_images_scope on storage.objects as restrictive for all to authenticated
using(bucket_id<>'company-content-images' or public.company_content_image_access(name))
with check(bucket_id<>'company-content-images' or (owner_id=auth.uid()::text and public.company_content_image_access(name)));
create policy company_content_images_immutable on storage.objects as restrictive for update to authenticated
using(bucket_id<>'company-content-images') with check(bucket_id<>'company-content-images');
create policy company_content_images_no_delete on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'company-content-images');
create policy company_content_images_no_anon on storage.objects as restrictive for all to anon
using(bucket_id<>'company-content-images') with check(bucket_id<>'company-content-images');

-- Keep the original strict text validator unchanged; strip only the two new optional
-- reference fields before calling it. Old documents/history and OCC RPC remain intact.
alter function content_private.validate_studio(jsonb) rename to validate_studio_text_v1;
create function content_private.validate_image_ref(a jsonb, kind text) returns void
language plpgsql immutable set search_path='' as $$
begin
 if not content_private.keys_exact(a,array['path','mime','bytes','width','height']) or
   not content_private.text_valid(a,'path',83,84) or
   a->>'path' !~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'||kind||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$') or
   jsonb_typeof(a->'mime') is distinct from 'string' or a->>'mime' not in ('image/png','image/jpeg') or
   right(a->>'path',4) is distinct from (case when a->>'mime'='image/png' then '.png' else '.jpg' end) or
   not content_private.integer_valid(a,'bytes',1,5242880) or
   not content_private.integer_valid(a,'width',32,4096) or not content_private.integer_valid(a,'height',32,4096) then
   raise exception 'Invalid image reference' using errcode='22023';
 end if;
 if (a->>'width')::integer*(a->>'height')::integer>16000000 then raise exception 'Image pixel limit' using errcode='22023'; end if;
end $$;
create function content_private.validate_studio(d jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare stripped jsonb:=d; p jsonb; s jsonb; posts jsonb:='[]'; slides jsonb;
begin
 if d->'brand' ? 'logo' then
   perform content_private.validate_image_ref(d->'brand'->'logo','logos');
   stripped:=jsonb_set(stripped,'{brand}',(d->'brand')-'logo');
 end if;
 if jsonb_typeof(d->'posts')='array' then
   for p in select value from jsonb_array_elements(d->'posts') loop
     slides:='[]';
     if jsonb_typeof(p->'slides')='array' then
       for s in select value from jsonb_array_elements(p->'slides') loop
         if s ? 'image' then perform content_private.validate_image_ref(s->'image','slides'); end if;
         slides:=slides||jsonb_build_array(s-'image');
       end loop;
       p:=jsonb_set(p,'{slides}',slides);
     end if;
     posts:=posts||jsonb_build_array(p);
   end loop;
   stripped:=jsonb_set(stripped,'{posts}',posts);
 end if;
 perform content_private.validate_studio_text_v1(stripped);
end $$;

create function content_private.assert_studio_image(a jsonb, cid uuid, kind text) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 perform content_private.validate_image_ref(a,kind);
 if split_part(a->>'path','/',1) is distinct from cid::text or not content_private.company_admin(cid) then
   raise exception 'Image company access denied' using errcode='42501';
 end if;
 -- Require an actual object in the dedicated private bucket, with server Storage metadata.
 if not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
   where o.bucket_id='company-content-images' and b.public=false and o.name=a->>'path'
   and o.metadata->>'mimetype'=a->>'mime'
   and o.metadata->>'size'=a->>'bytes') then
   raise exception 'Image object missing or metadata mismatch' using errcode='22023';
 end if;
end $$;
create function content_private.validate_studio_images_row() returns trigger
language plpgsql security definer set search_path='' as $$
declare p jsonb; s jsonb;
begin
 perform content_private.validate_studio(new.document);
 if new.document->'brand' ? 'logo' then perform content_private.assert_studio_image(new.document->'brand'->'logo',new.company_id,'logos'); end if;
 for p in select value from jsonb_array_elements(new.document->'posts') loop
   for s in select value from jsonb_array_elements(p->'slides') loop
     if s ? 'image' then perform content_private.assert_studio_image(s->'image',new.company_id,'slides'); end if;
   end loop;
 end loop;
 return new;
end $$;
create trigger company_content_image_references before insert or update on public.company_content_studios
for each row execute function content_private.validate_studio_images_row();
revoke all on all functions in schema content_private from public,anon,authenticated;
commit;
