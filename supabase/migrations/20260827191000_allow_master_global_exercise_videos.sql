-- Uploads feitos pela operação master alimentam a biblioteca global. A política
-- de empresa continua isolando treinadores no primeiro segmento company_id.
drop policy if exists "master manages exercises-videos objects" on storage.objects;
create policy "master manages exercises-videos objects"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'exercises-videos'
  and public.has_role(auth.uid(), 'master'::public.app_role)
)
with check (
  bucket_id = 'exercises-videos'
  and public.has_role(auth.uid(), 'master'::public.app_role)
);
