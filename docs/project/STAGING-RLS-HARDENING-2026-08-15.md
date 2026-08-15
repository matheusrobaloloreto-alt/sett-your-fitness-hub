# Staging RLS hardening — 2026-08-15

## Verdict

- **Cloud/fresh staging: GO for independent QA.** The complete migration chain replays from an empty database and the final RLS/ACL catalog passes the security gate in the isolated Free-plan staging project.
- **Production: NO-GO until a read-only legacy-data preflight is run.** Existing rows with null or divergent tenant/reference fields can become invisible under the new fail-closed policies or fail later updates.
- The isolated Supabase and draft Netlify staging targets were changed. Production, real data, OAuth providers, webhooks, MFIT and external integrations were not touched.

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
- Fixed `commit_wearable_sync` to cast provider JSON watermark strings to `timestamptz`; the cloud concurrency test exposed that the prior expression made every sync commit fail.
- Added reproducible cloud catalog and wearable concurrency test scripts.

## Validation evidence

- Complete empty-database replay: **PASS on all 160 migrations**, including the cloud-discovered wearable watermark fix.
- Cloud migration ledger: **160 local / 160 remote, exact match**.
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
- Supabase security advisors: **20 WARN entries, all accounted for by an exact allowlist of 19 reviewed browser-executable `SECURITY DEFINER` RPCs**; one RPC is reported once for `anon` and once for `authenticated`. The catalog gate rejects any unreviewed definer function.
- Security INFO: 9 intentionally fail-closed backend/internal tables with RLS and no browser policies.
- Wearable migration order checker: **PASS**.
- `git diff --check`: **PASS**.
- TypeScript (`tsc --noEmit`): **PASS**.
- ESLint: **PASS with 48 pre-existing warnings and 0 errors**.
- Vitest excluding the environment-blocked PDF suite: **61 files / 448 tests PASS**.
- Focused wearable security contracts: **21/21 PASS**.
- Production build, including backend provenance verification: **PASS**.
- Staging build and postbuild provenance/sanitization gate: **PASS**.
- Draft HTTP/SPA smoke: **10/10 routes and 6/6 static assets PASS**; the operator-only recording artifact is absent.

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
- Triage the 455 performance-advisor warnings (215 auth init-plan, 238 multiple-permissive-policy, 2 duplicate-index); these are nonblocking for isolated staging but remain release debt.

## Release boundary

The cloud checkpoint is limited to isolated staging. Eleven required Edge Functions are active without provider credentials, OAuth remains synthetic, webhooks fail closed, and the frontend exists only as a Netlify draft. Promotion to the stable staging URL remains blocked until independent QA returns `GO`. Production remains a separate operator-gated release after the legacy-data preflight.
