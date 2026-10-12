# BN Content Studio Backend

Local implementation in `codex/sett-load-save-release-20260928`, baseline
`782d4bb270a0c1f619496d9ea82c142c78f16619`. Integration and remote release
belong to root.

## Contract

Import runtime-independent types, defaults and validators from
`../_shared/bnContent.ts`. All operations are JSON POST requests with `action`
and a live user Bearer token. Every data/cost action checks
`auth.getUser(token)` then `has_role({_user_id: user.id, _role: "master"})`. The
service client and service key are accessed only after that gate. CORS is an
additional origin restriction, never authentication. Gateway JWT configuration
belongs to root.

- `bootstrap`: posts, calendars, brand settings, private signed assets and
  provider capabilities.
- `save`: `{id?,expected_version?,brief,spec,status}` returns `{post}` only
  after a verified acknowledgement. Update requires the version last read.
  Stale/deleted ID gives HTTP 409 `version_conflict`; no overwrite. Creation has
  a server UUID and version 1. Author/timestamp/version input fields are
  rejected.
- `generate`: `{brief,format,audience,aesthetic,objective?,format_key?,pillar?}`
  returns `{spec}` without saving. Up to three approved specs serve as prompt
  examples; this is not automatic training.
- `revise`: `{spec,instruction}` returns `{spec}` without saving, preserving
  format/aesthetic. Existing background references may be retained; new
  references from the provider are rejected. Change format/aesthetic through
  manual editing or a fresh generation.
- `image`: `{post_id,slide_index,scene,aspect:"4:5"|"9:16"}` returns
  `{path,signedUrl}` after upload to an existing saved post's private namespace.
  It does not update the post spec/version: the client associates the returned
  path and explicitly saves with CAS. PNG/JPEG are validated by MIME/signature
  and bounded to 10 MB. The required object name ends in `.png`; actual
  Content-Type reflects the accepted bytes. Asset paths cannot be copied to a
  different post; copying a post with images must be disabled or clear its
  background paths before creation.
- `calendar`: `{weeks:1..6,posts_per_week:1..7,focus:string}` validates
  generated entries and returns the persisted
  `{calendar:{id,calendar,created_at}}`.

All failures return only `{error: stable_code}`. No raw provider, authentication
or database exception text, prompts, secrets or request bodies are logged.
Request bodies are stream-limited to 128 KiB even without Content-Length.

## Database And Provider

Migration generated using `supabase migration new bn_content_studio_cloud`, then
aligned with the production migration ledger after publication:
`supabase/migrations/20261012074421_bn_content_studio_cloud.sql`.

New tables are `bn_content_studio_posts`, `bn_content_studio_calendars` and
`bn_content_studio_quota`; new private bucket is `bn-content-studio`.
Authenticated masters share read access. All direct client table mutations and
quota access are revoked. Service-only RPCs enforce CAS, master identity, spec
validity and atomic quota counters. Storage restrictive policies prevent older
broad policies from granting non-master access or client writes to this new
bucket. The old `bn-content-archive` bucket and policies are preserved.

The server needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and optional `BN_CONTENT_GEMINI_API_KEY`. Never copy
these values into frontend code or tracked files. With no Gemini key, manual
bootstrap/edit/save/approve continues and capabilities are false. Capabilities
report configuration, not a live credit/health guarantee.

Text uses fixed `gemini-2.5-flash`, with fixed `gemini-2.5-pro` fallback only
for transient HTTP failures. Images use one fixed `gemini-3.1-flash-image`
request and no fallback. Each provider request has a 60 second timeout,
including response-body reads. Generation attempts consume quota before the
provider call: 30 text operations and 10 images per user per UTC hour. Failed
provider attempts also consume quota; counters survive edge restarts. No new
subscription is created by this code; provider calls use the existing account.

Brand doctrine is a sanitized snapshot of the canonical Studio brain, limited to
nine approved sections. History/review fields and personal identifiers are
excluded. Refreshing the snapshot is deliberate; nothing imports local `.env` or
performs automatic learning. REST integration follows the official
[Gemini image API](https://ai.google.dev/gemini-api/docs/image-generation) and
[JSON output API](https://ai.google.dev/gemini-api/docs/structured-output).

## Local Verification

Run from the worktree root:

```sh
node scripts/bn-content-backend-tests.mjs
node scripts/bn-content-pglite-contract.mjs
deno check --no-lock --node-modules-dir=none supabase/functions/bn-content-studio/index.ts
```

The PGlite loader uses installed/cached `@electric-sql/pglite@0.3.16`, checking
package metadata and searching only immediate npm `_npx` cache directories. It
does not install dependencies or change repository package/lock files. An
explicit `PGLITE_MODULE_PATH` can select an existing test runtime. If the cache
is unavailable, prepare an isolated runtime outside the repository:

```sh
npm install --prefix /tmp/bn-content-test-runtime --no-package-lock --ignore-scripts @electric-sql/pglite@0.3.16
PGLITE_MODULE_PATH=/tmp/bn-content-test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/bn-content-pglite-contract.mjs
```

PGlite executes the actual migration with synthetic users, auth role lookup and
storage schema, and intentionally broad legacy storage policies. It tests
PostgreSQL RLS/grants, two shared masters, forged authors, CAS contention, quota
exhaustion/reset and archive isolation. It is not a live Supabase
gateway/storage integration test. Deno tests inject auth/database/provider
dependencies and mock network calls, including runtime Supabase request order.
No server starts on import. Actual authenticated production flow, browser QA and
independent review belong to root before release.

## Rollback

Before remote release, discard only these owned new files if this work is
rejected; leave other workers' changes intact. After a root-owned release,
restore the previous frontend/edge release to stop new Studio writes and keep
the new tables/bucket intact for recovery. Disabling the Gemini secret only
disables provider generation, leaving manual workflows operational. Do not drop
tables/bucket or delete content as a rollback. No existing archive, training,
enrollment data, generated types or shared auth flow is changed.
