-- Large videos use TUS resumable uploads and are validated again by
-- whatsapp-manager before the provider receives a signed URL.
update storage.buckets
set file_size_limit = 536870912
where id = 'whatsapp-media';
