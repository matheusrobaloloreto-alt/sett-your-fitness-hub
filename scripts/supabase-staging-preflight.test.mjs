import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROD_REF,
  STAGING_REF,
  buildSupabaseArgs,
  extractDryRunMigrationVersions,
  runPreflight,
  sanitizeDbDryRunFailure,
  sanitizeSecretsOutput,
} from "./supabase-staging.mjs";

async function withFixture(files, callback) {
  const root = await mkdtemp(path.join(tmpdir(), "bn-staging-preflight-"));
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("preflight requires explicit staging confirmation", async () => {
  await withFixture({
    "supabase/config.toml": `project_id = "${PROD_REF}"\n`,
  }, async (root) => {
    assert.throws(
      () => runPreflight({ root, env: {}, requireLinked: false }),
      /SETT_BN_STAGING_PROJECT_REF/,
    );
  });
});

test("preflight preserves canonical production config while accepting staging link", async () => {
  await withFixture({
    "supabase/config.toml": `project_id = "${PROD_REF}"\n`,
    "supabase/.temp/project-ref": `${STAGING_REF}\n`,
  }, async (root) => {
    const result = runPreflight({
      root,
      env: { SETT_BN_STAGING_PROJECT_REF: STAGING_REF },
      requireLinked: true,
    });

    assert.equal(result.configRef, PROD_REF);
    assert.equal(result.linkedRef, STAGING_REF);
  });
});

test("preflight fails closed on production or divergent refs", async () => {
  await withFixture({
    "supabase/config.toml": `project_id = "${PROD_REF}"\n`,
    "supabase/.temp/project-ref": `${PROD_REF}\n`,
  }, async (root) => {
    assert.throws(
      () =>
        runPreflight({
          root,
          env: { SETT_BN_STAGING_PROJECT_REF: STAGING_REF },
          requireLinked: true,
        }),
      /linked Supabase ref points to production/,
    );
  });

  await withFixture({
    "supabase/config.toml": `project_id = "${STAGING_REF}"\n`,
  }, async (root) => {
    assert.throws(
      () =>
        runPreflight({
          root,
          env: { SETT_BN_STAGING_PROJECT_REF: STAGING_REF },
          requireLinked: false,
        }),
      /canonical config must remain on production/,
    );
  });

  await withFixture({
    "supabase/config.toml": `project_id = "${PROD_REF}"\n`,
  }, async (root) => {
    assert.throws(
      () =>
        runPreflight({
          root,
          env: {
            SETT_BN_STAGING_PROJECT_REF: STAGING_REF,
            SUPABASE_PROJECT_REF: PROD_REF,
          },
          requireLinked: false,
        }),
      /SUPABASE_PROJECT_REF points to production/,
    );
  });
});

test("wrapper only builds explicit staging commands", () => {
  const env = { SETT_BN_STAGING_PROJECT_REF: STAGING_REF };

  assert.deepEqual(buildSupabaseArgs("functions:list", env), [
    "functions",
    "list",
    "--project-ref",
    STAGING_REF,
  ]);
  assert.deepEqual(buildSupabaseArgs("secrets:list", env), [
    "secrets",
    "list",
    "--project-ref",
    STAGING_REF,
  ]);
  assert.deepEqual(buildSupabaseArgs("migration:list-linked", env), [
    "migration",
    "list",
    "--linked",
  ]);
  assert.deepEqual(buildSupabaseArgs("db:push-dry-run-linked", env), [
    "db",
    "push",
    "--dry-run",
    "--linked",
  ]);
  assert.throws(
    () => buildSupabaseArgs("deploy:process-automation-sessions", env),
    /SETT_BN_STAGING_WRITE_CONFIRM/,
  );

  assert.deepEqual(buildSupabaseArgs("deploy:process-automation-sessions", {
    ...env,
    SETT_BN_STAGING_WRITE_CONFIRM: STAGING_REF,
  }), [
    "functions",
    "deploy",
    "process-automation-sessions",
    "--project-ref",
    STAGING_REF,
    "--use-api",
  ]);

  assert.throws(() => buildSupabaseArgs("db:push", env), /not allowlisted/);
});

test("secrets output redacts CLI digests", () => {
  const output = `
   NAME                         | DIGEST
  ------------------------------|------------------------------------------------------------------
   SUPABASE_URL                 | 04d47b870b860fbcbc1fe5634cca8bdad476ae074b46c699553abb968edbd017
   EVOLUTION_API_KEY            | abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd
`;

  const sanitized = sanitizeSecretsOutput(output);
  assert.match(sanitized, /SUPABASE_URL\s+\| \[redacted-digest\]/);
  assert.match(sanitized, /EVOLUTION_API_KEY\s+\| \[redacted-digest\]/);
  assert.doesNotMatch(sanitized, /04d47b870b860/);
  assert.doesNotMatch(sanitized, /abcdefabcdef/);
});

test("dry-run parser returns only migration versions", () => {
  const output = `
Would push migrations:
supabase/migrations/20260820160000_claim_single_controlled_automation_session.sql
supabase/migrations/20260820170000_prepare_controlled_weekly_test_session.sql
supabase/migrations/20260820173000_exclude_controlled_sessions_from_batch_claim.sql
supabase/migrations/20260820174000_align_controlled_test_claim_semantics.sql
`;

  assert.deepEqual(extractDryRunMigrationVersions(output), [
    "20260820160000",
    "20260820170000",
    "20260820173000",
    "20260820174000",
  ]);
});

test("dry-run failure sanitizer keeps only actionable migration history details", () => {
  const output = `
github.com/supabase/cli/internal/db/push/push.go:33
Remote migration versions not found in local migrations directory.
supabase migration repair --status reverted 20260814121000 20260814203000
`;

  const sanitized = sanitizeDbDryRunFailure(output);
  assert.doesNotMatch(sanitized, /github\.com\/supabase/);
  assert.match(sanitized, /Remote migration versions not found/);
  assert.match(sanitized, /20260814121000/);
  assert.match(sanitized, /"repairApplied": false/);
});
