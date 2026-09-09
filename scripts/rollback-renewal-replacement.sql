-- Non-destructive rollback for
-- 20260909165533_replace_paid_renewal_enrollment.sql.
--
-- This is a CODE rollback, not a data rollback. It restores the previous
-- payment lifecycle function while preserving carried_over_cycle_id,
-- carried_over_cycle_cleared_at, the FK, index, helper/RPC compatibility
-- surface, and all continuity/history references that student readers may use.
--
-- Safe default:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/rollback-renewal-replacement.sql
--
-- If replacement data already exists, the rollback aborts. To intentionally
-- restore old payment behavior while keeping existing replacement data readable:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v allow_after_renewal_replacements=true \
--     -f scripts/rollback-renewal-replacement.sql
--
-- Frontend rollback order:
--   1. Keep frontend readers that tolerate carried_over_cycle_id.
--   2. Run this script to stop new replacement behavior.
--   3. Roll back manual renewal callers away from replace_student_enrollment.
--   4. Do not remove carryover columns/FK/data without a separate retention
--      migration and exported compatibility plan.

\set ON_ERROR_STOP on

\if :{?allow_after_renewal_replacements}
\else
\set allow_after_renewal_replacements false
\endif

begin;

create temp table renewal_replacement_rollback_options(
  allow_after_replacements boolean not null
) on commit drop;

insert into renewal_replacement_rollback_options(allow_after_replacements)
values (:'allow_after_renewal_replacements'::boolean);

do $renewal_replacement_rollback_guard$
declare
  v_replacement_refs bigint;
  v_allow_after_replacements boolean;
begin
  select allow_after_replacements
    into v_allow_after_replacements
  from renewal_replacement_rollback_options;

  select count(*)
    into v_replacement_refs
  from public.enrollments enrollment
  where enrollment.carried_over_cycle_id is not null
     or enrollment.carried_over_cycle_cleared_at is not null;

  if v_replacement_refs > 0 and not v_allow_after_replacements then
    raise exception
      'renewal_replacement_rollback_blocked_existing_references count=%; rerun with -v allow_after_renewal_replacements=true only after confirming frontend reader compatibility',
      v_replacement_refs;
  end if;
end;
$renewal_replacement_rollback_guard$;

drop trigger if exists zz_enforce_enrollment_carried_over_cycle
  on public.enrollments;
drop trigger if exists zz_enforce_enrollment_replacement_and_carryover
  on public.enrollments;

commit;

-- Restore the previous live payment lifecycle definition exactly from the last
-- applied lifecycle migration. This migration owns only apply_paid_payment_lifecycle;
-- it does not remove the carryover schema/data retained above for compatibility.
\ir ../supabase/migrations/20260909154800_fix_paid_renewal_cycle_window.sql
