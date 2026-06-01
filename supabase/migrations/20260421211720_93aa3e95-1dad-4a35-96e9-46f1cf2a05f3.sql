-- Remove duplicates first (keep oldest)
DELETE FROM public.whatsapp_chats a
USING public.whatsapp_chats b
WHERE a.id > b.id
  AND a.instance_id IS NOT DISTINCT FROM b.instance_id
  AND a.remote_jid = b.remote_jid;

-- Add the unique constraint that the webhook upsert relies on
ALTER TABLE public.whatsapp_chats
  ADD CONSTRAINT whatsapp_chats_instance_id_remote_jid_key
  UNIQUE (instance_id, remote_jid);