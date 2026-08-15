# Staging RLS hardening — 2026-08-15

## Verdict

- **Local/fresh staging: GO.** The complete migration chain replays from an empty database and the final RLS/ACL catalog passes the security gate.
- **Production: NO-GO until a read-only legacy-data preflight is run.** Existing rows with null or divergent tenant/reference fields can become invisible under the new fail-closed policies or fail later updates.
- No cloud project, production data, Netlify site, OAuth provider, webhook, MFIT account, or external integration was changed.

## Delivered

- Reconciled historical migrations that depended on production-only schema drift so a fresh database can replay all migrations.
- Hardened tenant isolation for goals, feedback, assessments, plans, bundles, anamneses, measurements, activities, sessions, enrollments, check-ins, XP, achievements, files, alerts, and related Storage paths.
- Replaced first-membership policy checks with authoritative multi-company staff/student relationships.
- Added reference-integrity triggers that reject cross-tenant and same-company cross-student UUID poisoning.
- Kept student self-service updates working while limiting direct `students` updates to weekly goal, gender, height, and timestamp fields.
- Repaired the student monthly leaderboard authorization path.
- Added the missing canonical `workout_templates` schema, RLS policies, creator/company integrity, and updated-at trigger used by the existing UI.
- Restricted trigger functions and privileged RPCs; rebuilt explicit Data API grants for fresh Supabase projects.
- Restricted application policies to `authenticated`, kept the one intentional anonymous table read (`platform_settings`) and one anonymous RPC (`get_active_platform_ads`).
- Regenerated local Supabase TypeScript types only after the final schema was green.

## Validation evidence

- Complete empty-database replay: **PASS twice on the frozen final migrations** (159 migrations, including `20260815061954` and `20260815062126`).
- Transactional reapplication of both terminal migrations: **PASS**.
- Synthetic RLS matrix: **PASS**.
  - 5 actor profiles (Student A, Student B in the same company, staff A, cross-tenant staff B, master).
  - 16 core tables, 80 visibility assertions.
  - Student self-update compatibility, protected-field rejection, leaderboard same/cross-tenant checks, workout-template authorization, Storage authorization, and UUID-poisoning rejection.
- Catalog gate: **PASS**.
  - 0 application policies granted to `PUBLIC`.
  - 0 remaining policies using `get_user_company_id` first-membership semantics.
  - 0 public views missing `security_invoker`.
  - 0 public tables without RLS.
  - 0 `SECURITY DEFINER` functions without an explicit `search_path`.
  - Anonymous table grants: 1 `SELECT`; authenticated grants are policy-backed; service role retains complete backend access.
- Supabase security advisors at WARN/ERROR: **0 issues**.
- Security INFO: 9 intentionally fail-closed backend/internal tables with RLS and no browser policies.
- Wearable migration order checker: **PASS**.
- `git diff --check`: **PASS**.
- TypeScript (`tsc --noEmit`): **PASS**.
- ESLint: **PASS with 48 pre-existing warnings and 0 errors**.
- Vitest excluding the environment-blocked PDF suite: **61 files / 448 tests PASS**.
- Focused wearable security contracts: **20/20 PASS**.
- Production build, including backend provenance verification: **PASS**.

The complete test command has one environment-only failure in `dietPdf.test.ts`: this worktree's `node_modules` is a symlink outside the Vite filesystem allowlist, so the PDF worker import is denied. The application build does resolve and bundle the same worker successfully. No test or safety assertion was weakened.

## Remaining risks / required preflight

Before applying these migrations to an existing database, run read-only counts for:

- null `company_id` / `student_id` in newly guarded tables;
- `student_id` whose authoritative student belongs to a different `company_id`;
- feedback rows whose enrollment, cycle, or workout session belongs to another student/company;
- plans/bundles whose anamnese, previous plan, linked plan, assessment, or cycle belongs to another tenant/student;
- Storage assessment-frame paths whose company/assessment segments do not match the database row.

Abort production application if any count is non-zero; repair with an audited, reversible data migration first.

Backlog that does not block fresh staging:

- Move gamification awards/unlocks into atomic server-side completion/activity flows to reduce cosmetic XP farming.
- Add achievement/company semantic integrity beyond the student/company trigger.
- Bind `admin_alerts.enrollment_id` to `admin_alerts.student_id` when both are present.
- Move membership/role helper functions behind private-schema wrappers to reduce metadata oracle surface.
- Add domain/range constraints for student gender and height.
- Triage the 449 historical performance-advisor warnings (213 init-plan, 234 multiple-permissive-policy, 2 duplicate-index); these are not security-advisor failures.

## Release boundary

This checkpoint is local and committed only. Cloud migration/deploy remains a separate, operator-gated action after the production preflight.
