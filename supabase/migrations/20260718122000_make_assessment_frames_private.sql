-- Functional-assessment frames contain identifiable health media and must never be public.
update storage.buckets
set public = false
where id = 'assessment-frames';
drop policy if exists "assessment_frames_storage_read" on storage.objects;
drop policy if exists "assessment-frames company read" on storage.objects;
create policy "assessment_frames_storage_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
);
drop policy if exists "assessment_frames_storage_delete" on storage.objects;
create policy "assessment_frames_storage_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'assessment-frames'
  and public.is_company_staff(auth.uid(), public.try_uuid(split_part(name, '/', 1)))
);
-- Older rows stored a public URL. Keep only the object path so callers must sign it.
update public.assessment_frames
set image_url = regexp_replace(
  image_url,
  '^.*/storage/v1/object/public/assessment-frames/',
  ''
)
where image_url like '%/storage/v1/object/public/assessment-frames/%';
