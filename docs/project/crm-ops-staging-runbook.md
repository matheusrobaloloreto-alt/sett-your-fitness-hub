# CRM Ops Staging Runbook

Scope: this worktree may target only Supabase staging project `ifymocggowdlqqcxugko`.
Production project `zshrcgbyhzxpnlccssyz` remains the canonical app backend in `supabase/config.toml`.
Do not rewrite the canonical config to staging.

## Required confirmation

All commands in this runbook require:

```bash
export SETT_BN_STAGING_PROJECT_REF=ifymocggowdlqqcxugko
```

Staging writes also require:

```bash
export SETT_BN_STAGING_WRITE_CONFIRM=ifymocggowdlqqcxugko
```

The wrapper fails if any local env ref points to production or to another project. It also fails if
`supabase/.temp/project-ref` points anywhere except staging.

Before running the wrapper, unset inherited remote connection/env values such as `SUPABASE_URL`,
`SUPABASE_DB_URL`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, publishable/anon keys, and Vite
Supabase URLs. The wrapper intentionally fails closed when any of those values are present; it does
not print their contents.

## Read-only checks

```bash
npm run staging:preflight
npm run staging:functions:list
npm run staging:secrets:list
```

`staging:secrets:list` redacts CLI digests. Treat missing `AUTOMATION_CRON_SECRET`,
`AUTOMATION_TEST_SECRET`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, and
`WHATSAPP_WEBHOOK_SECRET` as a blocker for live dispatch. Never copy production secret values into
staging.

## Link staging for linked-only commands

This is local to `supabase/.temp/` and is ignored by git:

```bash
supabase link --project-ref ifymocggowdlqqcxugko
npm run staging:migrations:list
npm run staging:db:push:dry-run
```

Supabase CLI does not provide `--project-ref` for `migration list --linked` or
`db push --dry-run --linked`. This is the only wrapper exception to explicit `--project-ref`.
The wrapper compensates by validating `supabase/.temp/project-ref` immediately before spawning the
CLI and by running from the fixed repository root. If the link is absent, production, or anything
other than `ifymocggowdlqqcxugko`, the command does not spawn.

Stop if the link prompts for unavailable database credentials, if the fingerprint is not
`ifymocggowdlqqcxugko`, or if migration list shows any pending version beyond:

- `20260820160000`
- `20260820170000`
- `20260820173000`
- `20260820174000`

Do not run broad `db push` while any older or extra migration is pending. Use a backup/rollback plan
before applying even these four migrations.

## Edge deploy

Deploy only after local tests, preflight, and staging write confirmation:

```bash
npm run staging:deploy:automation
```

This deploys only `process-automation-sessions` with `--project-ref ifymocggowdlqqcxugko --use-api`.
Do not invoke the dispatcher from this runbook.

## No-send preparation

This phase ends at `prepare_controlled_weekly_test_session`. It must not invoke
`process-automation-sessions`, the Evolution provider, or any webhook.

Only call `prepare_controlled_weekly_test_session(student_id, controlled_test_run_id)` if staging
already has a same-tenant fixture with:

- operator authorized for the tenant
- student, enrollment, chat, connected instance, weekly flow, and start/content nodes
- direct `@s.whatsapp.net` JID matching the student's phone or WhatsApp

Do not use production people, production numbers, or Renan-like fixtures in staging. Preparation
creates one auditable `flow_sessions` row only. Capture a sanitized snapshot containing only:

- session id
- trigger type
- `controlled_test=true`
- hash of the canonical phone/JID
- count of other `processing` sessions

If the fixture cannot be created without real people or production numbers, stop here.

## Authorized real canary

This phase is a separate gate. It may happen only after the no-send preparation passes, the exact
four migrations above are applied, `process-automation-sessions` from this branch is deployed to
staging, and `AUTOMATION_CRON_SECRET`, `AUTOMATION_TEST_SECRET`, `EVOLUTION_API_URL`,
`EVOLUTION_API_KEY`, and `WHATSAPP_WEBHOOK_SECRET` are present in staging.

For a real send, invoke the dispatcher once with:

- the exact `session_id` created by the no-send preparation
- the normal cron secret
- the temporary test secret
- a staging-only provider instance
- a recipient number controlled by the operator

Confirm exactly one provider message and one matching database message, then remove
`AUTOMATION_TEST_SECRET`. If the session has not sent, rollback is
`cancel_controlled_weekly_test_session(session_id)`; do not delete the row, because it is audit
evidence. A Renan production canary is not authorized by this staging runbook and requires its own
explicit approval after the staging proof is green.
