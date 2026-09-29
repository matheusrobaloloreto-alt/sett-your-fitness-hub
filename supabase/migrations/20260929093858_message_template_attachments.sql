-- Existing text templates keep their content and have no attachments.
alter table public.message_templates
  add column attachments jsonb not null default '[]'::jsonb;

alter table public.message_templates
  add constraint message_templates_attachments_array
    check (jsonb_typeof(attachments) = 'array');
