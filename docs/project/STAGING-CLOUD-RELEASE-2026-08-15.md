# SETT/BN cloud staging release — 2026-08-15

## Decision

- **Isolated Supabase staging:** GO for QA. The target is healthy, distinct from production/legacy, and remains on the Free plan.
- **Netlify staging:** independent QA returned `GO`; the exact audited draft payload was promoted to the isolated stable staging URL and passed the post-promotion smoke.
- **Production, MFIT, real users and providers:** NO-GO and untouched.
- **Next gate:** authenticated workflow QA may continue only with synthetic staging accounts. Production remains separately gated.

This release follows ATENA skill 1098, **Checklist de Qualidade Antes da Entrega**.

## Applied state

- Pre-migration logical schema backup stored outside the repository.
- Full schema applied to an initially empty cloud project: **161 migrations**.
- Cloud and local migration ledgers match exactly: **161/161**.
- Supabase types regenerated from the validated cloud schema; the only generated delta was the PostgREST version metadata.
- Eleven required Edge Functions deployed and active:
  - `ai-bnito-coach`
  - `ai-nutrition-meals`
  - `ai-prescribe-workout`
  - `ai-student-bnito`
  - `ai-validate-prescription`
  - `process-automation-sessions`
  - `public-anamnesis`
  - `public-registration`
  - `wearable-connect`
  - `whatsapp-manager`
  - `whatsapp-webhook`
- Four minimal staging secrets configured. No provider, OAuth, Anthropic, WhatsApp session or automation credential was added.
- Webhooks remain OFF/fail-closed and wearable provider calls were not exercised.

## Validations

- Fresh replay of all 160 migrations: PASS.
- Cloud RLS matrix: PASS for same-company students A/B, cross-tenant staff, company staff and master.
- Storage and UUID-poisoning authorization: PASS.
- Data API grants, policies, views and definer-function catalog: PASS.
- Wearable OAuth state, replay/expiry, lease exclusion/reclaim, stale-holder rejection, callback exclusion and empty commit: PASS inside rollback-only synthetic transactions.
- TypeScript: PASS.
- ESLint: 0 errors, 48 historical warnings.
- Focused Vitest: 33/33 PASS (21 wearable migration contracts and 12 workout-draft persistence tests).
- Staging build with backend provenance gate: PASS.
- Draft HTTP/SPA: 10/10 routes and 6/6 static assets returned successfully, without production/legacy backend references.

## Cloud-discovered fix

The first wearable cloud test exposed a real P0 defect: `commit_wearable_sync` attempted to insert JSON text directly into a `timestamptz` watermark column, which rejected every sync commit, including an empty watermark object. Migration `20260815170922_fix_wearable_sync_watermark_cast.sql` repaired the staging RPC immediately. Following independent review, `20260815174923_replace_wearable_sync_deterministically.sql` now recreates the complete reviewed definition, rejects unexpected overloads and restores the service-role-only grant without preserving remote body drift. The cloud test persists and verifies a non-empty ISO watermark.

## Frontend boundary

The generated recording pages are an operator-only production artifact. They embed production backend coordinates and an operational upload token by design, so the staging postbuild step omits `dist/gravacao` without altering its source. The postbuild then scans the deploy output and fails unless the isolated staging backend is present and blocked backend/key fragments are absent.

The draft and stable-staging smokes confirm that requesting a recording-page URL returns only the SPA shell and exposes none of the recording artifact. On the stable staging URL, 10/10 routes and 6/6 entry assets passed; the remote bundle contains the staging backend and zero production/legacy backend references.

## Independent QA

Final verdict: **GO for the isolated stable staging URL only**.

- P0: 0.
- P1: 0 after corrective commit `0fd4b6b`.
- Confirmed independently: ledger 161/161, exact RPC definition/ACL, 19 exact browser-executable definer signatures, cloud watermark test with zero synthetic persistence, public types byte-identical, 11 active Edge Functions, fail-closed anonymous smokes and audited frontend payload.
- Residual P2: the lease exclusion test uses sequential operations in one transaction and is not a true multissession race test.

## Known nonblocking debt

- Security advisor: 20 WARN entries corresponding exactly to 19 reviewed browser-executable `SECURITY DEFINER` RPCs; one RPC is reported for both `anon` and `authenticated`. The catalog test rejects any function outside the explicit allowlist.
- Performance advisor: 455 WARN entries (215 auth init-plan, 238 multiple-permissive policies, 2 duplicate indexes).
- Full visual/authenticated workflow testing is assigned to independent QA; no PII is required.

## Rollback

- Database: the target was empty before migration and has an external logical schema backup; rollback is project disposal/recreation or migration repair within isolated staging, never production.
- Edge Functions: all deployments are staging-only version 1 and can be removed/redeployed without affecting production.
- Frontend: Netlify retains the immutable draft and unique deploy URLs; the isolated staging site can roll back to a prior deploy without touching the production SETT site.
