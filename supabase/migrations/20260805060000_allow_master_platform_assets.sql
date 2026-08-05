-- Permite que usuários master administrem logos/assets globais e de empresas.
-- Staff continua limitado ao path da própria empresa pelas policies já existentes.
drop policy if exists "master manages platform-assets objects" on storage.objects;

create policy "master manages platform-assets objects"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'platform-assets'
  and public.has_role(auth.uid(), 'master'::app_role)
)
with check (
  bucket_id = 'platform-assets'
  and public.has_role(auth.uid(), 'master'::app_role)
);
