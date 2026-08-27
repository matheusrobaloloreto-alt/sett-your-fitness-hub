-- The one-off identity repair has been completed and verified in production.
-- Keep its restricted audit trail, but remove the maintenance mutation surface.

drop function if exists public.repair_whatsapp_student_chat_identity(uuid, uuid, uuid);

comment on table public.whatsapp_identity_repairs is
  'Restricted audit trail for completed, evidence-backed WhatsApp identity repairs. No public repair RPC remains active.';
