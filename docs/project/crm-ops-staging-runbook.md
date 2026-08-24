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

## Read-only checks

```bash
npm run staging:preflight
npm run staging:functions:list
npm run staging:secrets:list
```

`staging:secrets:list` redacts CLI digests. Treat missing `AUTOMATION_CRON_SECRET`,
`AUTOMATION_TEST_SECRET`, `EVOLUTION_API_URL`, and `EVOLUTION_API_KEY` as a blocker for live dispatch.
Never copy production secret values into staging.

## Link staging for linked-only commands

This is local to `supabase/.temp/` and is ignored by git:

```bash
supabase link --project-ref ifymocggowdlqqcxugko
npm run staging:migrations:list
npm run staging:db:push:dry-run
```

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

## Canary without sending

Only call `prepare_controlled_weekly_test_session` if staging already has a same-tenant fixture with:

- operator authorized for the tenant
- student, enrollment, chat, connected instance, weekly flow, and start/content nodes
- direct `@s.whatsapp.net` JID matching the student's phone or WhatsApp

Do not use production people, production numbers, or Renan-like fixtures in staging. Do not invoke
`process-automation-sessions`; preparation creates an auditable row only.
