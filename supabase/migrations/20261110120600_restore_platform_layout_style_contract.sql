-- Older environments may already have this field from the original editor.
-- Keep their saved layouts and fill the schema gap for newer environments.
alter table public.platform_settings
  add column if not exists layout_style text not null default 'classico';
