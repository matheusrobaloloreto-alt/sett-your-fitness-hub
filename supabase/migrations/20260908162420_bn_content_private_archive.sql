-- Arquivo privado dos materiais renderizados pelo BN Content Studio.
-- O gerador continua local; o painel Master acessa somente esta cópia estática.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bn-content-archive',
  'bn-content-archive',
  false,
  209715200,
  array['application/json', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Master reads BN content archive" on storage.objects;
create policy "Master reads BN content archive"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
  );

drop policy if exists "Master uploads BN content archive" on storage.objects;
create policy "Master uploads BN content archive"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
  );

drop policy if exists "Master updates BN content archive" on storage.objects;
create policy "Master updates BN content archive"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
  )
  with check (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
  );

drop policy if exists "Master deletes BN content archive" on storage.objects;
create policy "Master deletes BN content archive"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'bn-content-archive'
    and public.has_role((select auth.uid()), 'master'::public.app_role)
  );
