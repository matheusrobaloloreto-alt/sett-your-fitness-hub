-- Production retained direct anonymous SELECT grants on internal student and
-- workout tables. Browser reads for these relations require an authenticated
-- user and tenant-bound RLS; server-side public flows use service_role.
-- Remove the production default that would otherwise grant SELECT to anon on
-- every future table created by the migration owner. Intentionally public
-- relations such as platform_settings keep their explicit grants.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

revoke select on table
  public.student_anamneses,
  public.workout_logs,
  public.workout_sessions
from public, anon;

-- These two legacy relations exist only in production. Keep the reconciliation
-- replay-safe while removing the same anonymous read surface when present.
do $revoke_optional_anonymous_reads$
declare
  relation_name text;
begin
  foreach relation_name in array array['translations', 'workout_exercises']
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'revoke select on table public.%I from public, anon',
        relation_name
      );
    end if;
  end loop;
end;
$revoke_optional_anonymous_reads$;
