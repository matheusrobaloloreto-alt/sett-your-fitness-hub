-- Restringe o arquivo privado aos objetos efetivamente consumidos pelo painel.
-- O manifesto pode listar rascunhos: a superfície é exclusiva do perfil Master.
update storage.buckets
set allowed_mime_types = array['application/json', 'image/png', 'image/jpeg', 'image/webp']
where id = 'bn-content-archive';

drop policy if exists "Master uploads BN content archive" on storage.objects;
create policy "Master uploads BN content archive"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
    and (
      name = 'manifest.json'
      or name ~ '^posts/[a-z0-9][a-z0-9-]{0,127}/slide_[1-9][0-9]{0,2}\.(png|jpe?g|webp)$'
    )
  );

drop policy if exists "Master updates BN content archive" on storage.objects;
create policy "Master updates BN content archive"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
    and (
      name = 'manifest.json'
      or name ~ '^posts/[a-z0-9][a-z0-9-]{0,127}/slide_[1-9][0-9]{0,2}\.(png|jpe?g|webp)$'
    )
  )
  with check (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
    and (
      name = 'manifest.json'
      or name ~ '^posts/[a-z0-9][a-z0-9-]{0,127}/slide_[1-9][0-9]{0,2}\.(png|jpe?g|webp)$'
    )
  );

drop policy if exists "Master deletes BN content archive" on storage.objects;
create policy "Master deletes BN content archive"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
    and (
      name = 'manifest.json'
      or name ~ '^posts/[a-z0-9][a-z0-9-]{0,127}/slide_[1-9][0-9]{0,2}\.(png|jpe?g|webp)$'
    )
  );
