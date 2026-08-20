# SETT/BN production preflight — 2026-08-20

## Verdict

- **Production data preflight:** conditional GO. The guarded tenant and parent
  references are consistent; one immutable historical trainer UUID requires the
  drift-safe function already applied in isolated staging.
- **Production promotion:** **NO-GO** until independent QA reviews the frozen
  release package, the 164-migration fresh replay is green, and the production
  backup/rollback checkpoint is captured.
- This audit was read-only. Production schema, data, functions, frontend and
  Edge Functions were not changed.

## Current ledgers

- Local release branch: **164 migrations**.
- Isolated Supabase staging: **164/164**, exact local/remote ledger match.
- Production: **150 migrations**; latest version `20260810123000`.
- Production therefore has **14 pending migrations**, from
  `20260814120000_manual_payment_to_assessment_stage.sql` through
  `20260820093445_preserve_legacy_trainer_history_references.sql`.

## Aggregate production evidence

- Students: **71 total / 38 active** at the time of the query.
- Twenty-five student/company guarded tables: **766 rows**.
- Null `company_id`: **0**.
- Orphan `student_id`: **0**.
- Student/company mismatch: **0**.
- Null `student_id`: **37**, all in `ai_decision_logs`, where the field is
  intentionally nullable for company-level decisions.
- Cycle-feedback cycle references: **0 mismatches**.
- Workout-feedback session references: **0 mismatches**.
- Strength, cardio and nutrition anamnese/bundle/cycle/previous-plan
  references: **0 mismatches**.
- Prescription-bundle anamnese/assessment/cycle/plan references:
  **0 mismatches**.
- Enrollment plan/trainer, payment enrollment, evaluation author, student-file
  path, plan-version and workout-session references: **0 mismatches**.
- Assessment frames: **75/75** have a canonical company/assessment path and a
  matching Storage object.
- The assessment bucket contains **171 objects**, including **96 unreferenced
  historical objects**. They are preserved as cleanup backlog and do not block
  the migration.

Current production security-advisor baseline is **196 WARN / 5 INFO**. Most are
the mutable-search-path and broad `SECURITY DEFINER` findings that the pending
terminal hardening migrations are designed to replace. One warning is the
project-level leaked-password-protection setting and is not changed by SQL.
The post-migration advisor result must be compared against the reviewed staging
allowlist before the release can remain green.

## Drift found and contained

`trainer_assignments_history` contains 99 field occurrences across 97 history
rows that reference one removed historical user UUID. That UUID is not used by
any current student assignment or enrollment. Rewriting or deleting the audit
history would be unnecessary and riskier.

Migration `20260820093445_preserve_legacy_trainer_history_references.sql`
therefore validates every new or changed trainer reference and every tenant
change, while allowing unrelated updates to preserve an unchanged historical
UUID. The rollback-only staging contract proves:

1. an unrelated update with immutable legacy refs succeeds;
2. a newly introduced invalid ref is rejected with `23514`;
3. replacement by a current same-company member succeeds;
4. all synthetic rows are rolled back.

## Schema drift reconciled

- Production lacks `cycle_feedback.enrollment_id`; migration
  `20260815060000_reconcile_cycle_feedback_enrollment_id.sql` adds it before
  terminal RLS/functions reference it.
- `training_cycles.objective` exists in production but was missing from fresh
  replay; migration `20260817120000_add_training_cycle_objective.sql` makes the
  contract explicit and idempotent.

## Required production gate

1. Freeze the release commit and obtain independent read-only QA.
2. Replay all **164 migrations** from an empty database and rerun the catalog,
   RLS, wearable-concurrency and trainer-history drift contracts.
3. Capture an encrypted logical backup outside the repository plus production
   ledger, function/policy definitions and row-count checkpoint.
4. Apply only the 14 reviewed migrations. Abort on any ledger drift.
5. Rerun the production aggregate preflight and Supabase security advisors.
6. Deploy only the reviewed Edge Functions and exact frontend artifact; verify
   backend provenance before deployment.
7. Run authenticated staff/student smoke tests and provider fail-closed checks.

## Rollback

- Database: preserve the pre-release logical backup and prior definitions. For
  an additive/function-policy failure, apply a reviewed corrective migration;
  restore from backup only for material data corruption.
- Edge Functions: retain the previous function versions and redeploy them if a
  smoke test fails.
- Frontend: retain the immutable Netlify deployment ID and restore it without
  changing Supabase.
- No cleanup of the 96 orphan Storage objects is part of this release.
