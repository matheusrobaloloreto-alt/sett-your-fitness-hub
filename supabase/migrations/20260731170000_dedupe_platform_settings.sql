-- A company has one active visual identity. Older duplicate rows made public
-- registration context fail because the API expected a single object.
with ranked as (
  select
    id,
    row_number() over (
      partition by company_id
      order by updated_at desc, created_at desc, id desc
    ) as position
  from public.platform_settings
  where company_id is not null
)
delete from public.platform_settings settings
using ranked
where settings.id = ranked.id
  and ranked.position > 1;

create unique index if not exists idx_platform_settings_company_unique
  on public.platform_settings (company_id)
  where company_id is not null;
